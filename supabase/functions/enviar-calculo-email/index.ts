// @ts-nocheck
// Supabase Edge Function: enviar-calculo-email
// Envia ao cliente, por e-mail, os arquivos do cálculo (PDF e .PJC guardados em "Entregas" do cálculo).
// Com tipo "apresentacao": envia a apresentação do serviço para um escritório (prospecção).
// Com tipo "robo": robô de prospecção por e-mail, chamado pelo agendador (pg_cron) a cada 15 min.
//   Manda 1 apresentação por chamada para o próximo contato "A contatar" com e-mail, respeitando o limite diário,
//   o intervalo mínimo, os dias e o horário (de Brasília) escolhidos no painel. Liga/desliga, horário e limites no painel (Prospecção > 🤖 Robô de e-mail).
// Só o dono logado no painel pode usar. Deixe "Verify JWT" LIGADO.
// Secrets: os mesmos da função aviso-lead (SMTP_USER, SMTP_PASS, opcionais SMTP_HOST, SMTP_PORT).
// Arquivos grandes (mais de 15 MB no total) vão como links de download válidos por 7 dias, em vez de anexo.

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const LIMITE_ANEXOS = 15 * 1048576;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const corpo = await req.clone().json().catch(() => ({}));
    const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: dono } = await usuario.rpc('is_dono');
    // o agendador chama sem login; "enviar agora" (fora do horário) só o dono logado
    if (corpo.tipo === 'robo') return resp(await roboEmail(!!corpo.teste && dono === true));
    if (dono !== true) return resp({ erro: 'nao_autorizado' }, 401);

    const b = await req.json().catch(() => ({}));
    const para = String(b.para || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return resp({ erro: 'email_invalido', mensagem: 'E-mail inválido.' }, 400);
    const user = Deno.env.get('SMTP_USER'), pass = Deno.env.get('SMTP_PASS');
    if (!user || !pass) return resp({ erro: 'smtp', mensagem: 'Configure SMTP_USER e SMTP_PASS nos Secrets.' }, 400);
    const smtp = nodemailer.createTransport({ host: Deno.env.get('SMTP_HOST') || 'email-ssl.com.br', port: Number(Deno.env.get('SMTP_PORT') || 465), secure: true, auth: { user, pass } });

    // apresentação do serviço para um escritório (prospecção): não depende de cálculo
    if (b.tipo === 'apresentacao') {
      const d = { tratamento: String(b.tratamento || 'Prezado(a) Dr(a).').slice(0, 80), abertura: String(b.abertura || '').slice(0, 600), assinatura: String(b.assinatura || 'Equipe Pontes Ferreira').slice(0, 80) };
      const html = apresentacaoHtml(d);
      await smtp.sendMail({ from: `"${d.assinatura.replace(/"/g, '')} · Pontes Ferreira Cálculos" <${user}>`, to: para, bcc: user, replyTo: user,
        subject: String(b.assunto || 'Proposta de parceria – cálculos trabalhistas no PJe-Calc em até 48h').slice(0, 200), html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') });
      return resp({ ok: true, para, anexos: 0, links: 0 });
    }
    const { data: calc, error } = await db.from('calculos').select('*').eq('id', b.calc_id).maybeSingle();
    if (error || !calc) return resp({ erro: 'calculo', mensagem: 'Cálculo não encontrado.' }, 404);
    const arquivos = (calc.arquivos || []).filter((a: any) => a && a.path);
    if (!arquivos.length) return resp({ erro: 'sem_arquivos', mensagem: 'O cálculo não tem arquivos guardados (Entregas).' }, 400);
    const { data: cli } = calc.cliente_id ? await db.from('clientes').select('nome,portal_token').eq('id', calc.cliente_id).maybeSingle() : { data: null };

    // baixa os arquivos; se passar do limite, manda links em vez de anexos
    const baixados: { nome: string, bytes: Uint8Array }[] = [];
    let total = 0;
    for (const a of arquivos) {
      const { data: blob, error: e } = await db.storage.from('processos').download(a.path);
      if (e || !blob) throw new Error(`Não consegui ler ${a.nome}`);
      const bytes = new Uint8Array(await blob.arrayBuffer()); total += bytes.length;
      baixados.push({ nome: a.nome || a.path.split('/').pop(), bytes });
    }
    const porLink = total > LIMITE_ANEXOS;
    const links: { nome: string, url: string }[] = [];
    if (porLink) for (const a of arquivos) {
      const { data: s } = await db.storage.from('processos').createSignedUrl(a.path, 7 * 86400, { download: a.nome || true });
      if (s?.signedUrl) links.push({ nome: a.nome, url: s.signedUrl });
    }

    const partes = calc.reclamante && calc.reclamada ? `${calc.reclamante} x ${calc.reclamada}` : '';
    const assunto = String(b.assunto || `Cálculo pronto: processo ${calc.numero_processo || ''}${partes ? ' – ' + partes : ''}`).slice(0, 200);
    const saud = String(b.mensagem || 'Segue em anexo o cálculo do seu processo: relatório em PDF e o arquivo .PJC para importar no PJe-Calc.').slice(0, 2000);
    const portal = cli?.portal_token ? `https://pontesferreiracalculos.com/cliente/?t=${encodeURIComponent(cli.portal_token)}` : '';
    const html = emailHtml({ nome: cli?.nome ? String(cli.nome).split(' ').slice(0, 2).join(' ') : '', saud, calc, partes, porLink, links, nomesArq: baixados.map(x => x.nome), portal });
    await smtp.sendMail({
      from: `"Pontes Ferreira Cálculos" <${user}>`, to: para, bcc: user, replyTo: user, subject: assunto, html,
      text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
      attachments: porLink ? [] : baixados.map(x => ({ filename: x.nome, content: x.bytes }))
    });
    return resp({ ok: true, para, anexos: porLink ? 0 : baixados.length, links: links.length });
  } catch (e) {
    console.error(e);
    return resp({ erro: 'interno', mensagem: (e as Error).message }, 500);
  }
});

// ---------- modelo do e-mail (tabelas e estilos inline: funciona no Gmail, Outlook e celular) ----------
const SITE = 'https://pontesferreiracalculos.com';
function emailHtml(d: any) {
  const linha = (rot: string, val: string) => val ? `<tr><td style="padding:9px 14px;color:#6b7690;font-size:13px;width:120px;border-bottom:1px solid #eef1f6">${rot}</td><td style="padding:9px 14px;color:#0b1a3d;font-size:14px;font-weight:600;border-bottom:1px solid #eef1f6">${val}</td></tr>` : '';
  const icone = (n: string) => /\.pjc$/i.test(n) ? '🧮' : /\.pdf$/i.test(n) ? '📄' : '📎';
  const arquivos = d.porLink
    ? d.links.map((l: any) => `<tr><td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:14px">${icone(l.nome)} ${esc(l.nome)}</td><td align="right" style="padding:10px 14px;border-bottom:1px solid #eef1f6"><a href="${esc(l.url)}" style="background:#0b1a3d;color:#fff;text-decoration:none;font-size:12px;font-weight:700;padding:7px 12px;border-radius:6px">Baixar</a></td></tr>`).join('')
    : d.nomesArq.map((n: string) => `<tr><td colspan="2" style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:14px">${icone(n)} ${esc(n)} <span style="color:#1f8a5b;font-size:12px;font-weight:700">· em anexo</span></td></tr>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f3f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f7;padding:24px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 6px 24px rgba(11,26,61,.08)">
  <tr><td style="background:#0b1a3d;background-image:linear-gradient(135deg,#1a3a7a 0%,#0b1a3d 55%,#060f26 100%);padding:26px 28px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:14px"><img src="${SITE}/img/logo-email.png" width="56" height="56" alt="Pontes Ferreira" style="display:block;border:0"></td>
      <td><div style="color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:.06em;font-weight:700">PONTES FERREIRA</div>
          <div style="color:#e3b13c;font-size:11px;letter-spacing:.42em;margin-top:3px">CÁLCULOS JUDICIAIS</div></td></tr></table>
  </td></tr>
  <tr><td style="background:#e3b13c;background-image:linear-gradient(90deg,#fbe7a1,#e2b13c 45%,#b07a12);height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:28px 28px 8px">
    <div style="display:inline-block;background:#dff3e6;color:#14632f;font-size:12px;font-weight:700;padding:5px 10px;border-radius:20px">✅ CÁLCULO CONCLUÍDO</div>
    <h1 style="margin:14px 0 6px;font-family:Georgia,'Times New Roman',serif;color:#0b1a3d;font-size:24px;font-weight:700">Seu cálculo está pronto</h1>
    <p style="margin:0 0 4px;color:#33405a;font-size:15px;line-height:1.6">Olá${d.nome ? ', ' + esc(d.nome) : ''}!</p>
    <p style="margin:0;color:#33405a;font-size:15px;line-height:1.6">${esc(d.saud).replace(/\n/g, '<br>')}</p>
  </td></tr>
  <tr><td style="padding:18px 28px 6px">
    <div style="color:#6b7690;font-size:11px;letter-spacing:.12em;font-weight:700;margin-bottom:8px">DADOS DO PROCESSO</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e8ef;border-radius:10px;border-collapse:separate;overflow:hidden">
      ${linha('Processo', esc(d.calc.numero_processo || '—'))}${linha('Partes', esc(d.partes))}${linha('Tipo', esc(d.calc.tipo || ''))}${linha('Entregue em', d.calc.data_entrega ? esc(String(d.calc.data_entrega).split('-').reverse().join('/')) : esc(new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })))}
    </table>
  </td></tr>
  <tr><td style="padding:18px 28px 6px">
    <div style="color:#6b7690;font-size:11px;letter-spacing:.12em;font-weight:700;margin-bottom:8px">ARQUIVOS${d.porLink ? ' (LINKS VÁLIDOS POR 7 DIAS)' : ''}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e8ef;border-radius:10px;border-collapse:separate;overflow:hidden">${arquivos}</table>
    <p style="margin:10px 0 0;color:#6b7690;font-size:12.5px;line-height:1.5">O arquivo <b>.PJC</b> é importado direto no PJe-Calc; o <b>PDF</b> é o relatório pronto para juntar aos autos.</p>
  </td></tr>
  ${d.portal ? `<tr><td align="center" style="padding:22px 28px 4px">
    <a href="${esc(d.portal)}" style="display:inline-block;background:#e3b13c;background-image:linear-gradient(135deg,#fbe7a1,#e2b13c 45%,#b07a12);color:#1b1203;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px">Ver todos os meus cálculos</a>
    <div style="color:#8a94a8;font-size:12px;margin-top:8px">Seu painel pessoal: arquivos, andamento e valores em aberto.</div></td></tr>` : ''}
  <tr><td style="padding:22px 28px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ef;border-radius:10px"><tr><td style="padding:14px 16px;color:#4a5870;font-size:13.5px;line-height:1.55">
      🛡 <b>Revisão garantida:</b> se o juízo pedir retificação decorrente do próprio cálculo, a primeira revisão é sem custo.</td></tr></table>
  </td></tr>
  <tr><td align="center" style="padding:22px 28px 26px">
    <p style="margin:0 0 12px;color:#33405a;font-size:14px">Dúvidas? Responda este e-mail ou fale com a gente:</p>
    <a href="https://wa.me/5521987708652" style="display:inline-block;background:#1f8a5b;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:10px">WhatsApp (21) 98770-8652</a>
  </td></tr>
  <tr><td style="background:#0b1a3d;padding:18px 28px;text-align:center;color:#aab4c8;font-size:12px;line-height:1.6">
    <b style="color:#ffffff">Pontes Ferreira Cálculos Judiciais</b><br>CNPJ 51.362.258/0001-79 · <a href="${SITE}" style="color:#e3b13c;text-decoration:none">pontesferreiracalculos.com</a><br>
    <span style="color:#7f8aa3">Este e-mail contém informações do seu processo. Se não for o destinatário, por favor desconsidere.</span>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ---------- apresentação do serviço (prospecção de escritórios) ----------
function apresentacaoHtml(d: any) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f3f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f7;padding:24px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 6px 24px rgba(11,26,61,.08)">
  <tr><td style="background:#0b1a3d;background-image:linear-gradient(135deg,#1a3a7a 0%,#0b1a3d 55%,#060f26 100%);padding:26px 28px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:14px"><img src="https://pontesferreiracalculos.com/img/logo-email.png" width="56" height="56" alt="Pontes Ferreira" style="display:block;border:0"></td>
      <td><div style="color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:.06em;font-weight:700">PONTES FERREIRA</div>
          <div style="color:#e3b13c;font-size:11px;letter-spacing:.42em;margin-top:3px">CÁLCULOS JUDICIAIS</div></td></tr></table>
  </td></tr>
  <tr><td style="background:#e3b13c;background-image:linear-gradient(90deg,#fbe7a1,#e2b13c 45%,#b07a12);height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:28px 28px 6px">
    <div style="display:inline-block;background:#fff4d6;color:#7a5408;font-size:12px;font-weight:700;padding:5px 10px;border-radius:20px">🤝 PROPOSTA DE PARCERIA</div>
    <h1 style="margin:14px 0 10px;font-family:Georgia,'Times New Roman',serif;color:#0b1a3d;font-size:24px;line-height:1.25;font-weight:700">Cálculos trabalhistas no PJe-Calc para o seu escritório, prontos em até 48h</h1>
    <p style="margin:0 0 10px;color:#33405a;font-size:15px;line-height:1.6">${esc(d.tratamento)},</p>
    ${d.abertura ? `<p style="margin:0 0 10px;color:#33405a;font-size:15px;line-height:1.6">${esc(d.abertura).replace(/\n/g, '<br>')}</p>` : ''}
    <p style="margin:0;color:#33405a;font-size:15px;line-height:1.6">Somos a <b>Pontes Ferreira Cálculos Judiciais</b>, especializada em cálculos trabalhistas para advogados e escritórios. O escritório nos envia o número do processo e nós devolvemos o cálculo pronto para protocolar, com o arquivo <b>.PJC</b> para importar no PJe-Calc.</p>
  </td></tr>
  <tr><td style="padding:20px 28px 4px">
    <div style="color:#6b7690;font-size:11px;letter-spacing:.12em;font-weight:700;margin-bottom:8px">O QUE FAZEMOS</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e8ef;border-radius:10px;border-collapse:separate;overflow:hidden">
      <tr><td style="padding:11px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0b1a3d"><b>⚖ Liquidação de sentença</b><br><span style="color:#6b7690;font-size:13px">Conta completa sobre o título executivo, com sentença, acórdão e embargos conferidos.</span></td></tr>
      <tr><td style="padding:11px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0b1a3d"><b>🔎 Impugnação aos cálculos</b><br><span style="color:#6b7690;font-size:13px">Revisão da conta da parte contrária ou do perito, com os pontos divergentes apontados.</span></td></tr>
      <tr><td style="padding:11px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#0b1a3d"><b>📝 Cálculo para a petição inicial</b><br><span style="color:#6b7690;font-size:13px">Valor de cada pedido com reflexos, para liquidar a inicial (art. 840, §1º, da CLT).</span></td></tr>
      <tr><td style="padding:11px 14px;font-size:14px;color:#0b1a3d"><b>📈 Atualização de cálculos</b><br><span style="color:#6b7690;font-size:13px">Correção e juros pelos índices vigentes.</span></td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:20px 28px 4px">
    <div style="color:#6b7690;font-size:11px;letter-spacing:.12em;font-weight:700;margin-bottom:8px">O QUE O ESCRITÓRIO RECEBE</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="33%" valign="top" style="padding:0 4px 0 0"><div style="background:#f6f8fc;border-radius:10px;padding:14px 10px;text-align:center"><div style="font-size:22px">🧮</div><div style="color:#0b1a3d;font-size:13px;font-weight:700;margin-top:4px">Arquivo .PJC</div><div style="color:#6b7690;font-size:12px;margin-top:2px">importa direto no PJe-Calc</div></div></td>
      <td width="33%" valign="top" style="padding:0 2px"><div style="background:#f6f8fc;border-radius:10px;padding:14px 10px;text-align:center"><div style="font-size:22px">📄</div><div style="color:#0b1a3d;font-size:13px;font-weight:700;margin-top:4px">Relatório em PDF</div><div style="color:#6b7690;font-size:12px;margin-top:2px">pronto para juntar aos autos</div></div></td>
      <td width="33%" valign="top" style="padding:0 0 0 4px"><div style="background:#f6f8fc;border-radius:10px;padding:14px 10px;text-align:center"><div style="font-size:22px">📋</div><div style="color:#0b1a3d;font-size:13px;font-weight:700;margin-top:4px">Resumo do deferido</div><div style="color:#6b7690;font-size:12px;margin-top:2px">o que entrou na conta e por quê</div></div></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:20px 28px 4px">
    <div style="color:#6b7690;font-size:11px;letter-spacing:.12em;font-weight:700;margin-bottom:8px">COMO FUNCIONA</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#33405a;line-height:1.5">
      <tr><td width="34" valign="top" style="padding:5px 0"><div style="width:24px;height:24px;border-radius:12px;background:#0b1a3d;color:#e3b13c;font-weight:700;font-size:13px;text-align:center;line-height:24px">1</div></td><td style="padding:5px 0">O escritório envia o <b>número do processo</b> (ou o PDF dos autos).</td></tr>
      <tr><td width="34" valign="top" style="padding:5px 0"><div style="width:24px;height:24px;border-radius:12px;background:#0b1a3d;color:#e3b13c;font-weight:700;font-size:13px;text-align:center;line-height:24px">2</div></td><td style="padding:5px 0">Enviamos o <b>orçamento com preço fechado</b> em até 1 hora útil.</td></tr>
      <tr><td width="34" valign="top" style="padding:5px 0"><div style="width:24px;height:24px;border-radius:12px;background:#0b1a3d;color:#e3b13c;font-weight:700;font-size:13px;text-align:center;line-height:24px">3</div></td><td style="padding:5px 0">Entregamos o cálculo <b>em até 48h</b>, com o .PJC, o PDF e o resumo.</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:20px 28px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1a3d;background-image:linear-gradient(135deg,#1a3a7a 0%,#0b1a3d 70%);border-radius:12px"><tr><td style="padding:18px 20px;text-align:center">
      <div style="color:#e3b13c;font-size:11px;letter-spacing:.14em;font-weight:700">CONDIÇÃO PARA O PRIMEIRO CÁLCULO</div>
      <div style="color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;margin:6px 0 4px">1º cálculo por R$ 200</div>
      <div style="color:#c8d1e4;font-size:13px">Para o escritório conhecer o nosso trabalho sem compromisso.</div>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:18px 28px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13.5px;color:#33405a"><tr>
      <td width="50%" style="padding:4px 0">✔ Todos os 24 TRTs</td><td width="50%" style="padding:4px 0">✔ Preço fechado antes de começar</td></tr><tr>
      <td style="padding:4px 0">✔ 1ª revisão sem custo</td><td style="padding:4px 0">✔ Leitura integral do processo</td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 28px 4px"><p style="margin:0;color:#33405a;font-size:15px;line-height:1.6">Se fizer sentido para o escritório, basta responder este e-mail com o número de um processo que enviamos o orçamento. Também podemos atender demandas recorrentes, com prioridade na fila e condições para volume.</p></td></tr>
  <tr><td align="center" style="padding:22px 28px 8px">
    <a href="https://wa.me/5521987708652" style="display:inline-block;background:#1f8a5b;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;margin:0 4px 8px">💬 WhatsApp (21) 98770-8652</a>
    <a href="https://pontesferreiracalculos.com/?utm_source=email&amp;utm_medium=prospeccao&amp;utm_campaign=apresentacao" style="display:inline-block;background:#e3b13c;background-image:linear-gradient(135deg,#fbe7a1,#e2b13c 45%,#b07a12);color:#1b1203;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;margin:0 4px 8px">Conhecer o site</a>
  </td></tr>
  <tr><td style="padding:8px 28px 24px"><p style="margin:0;color:#33405a;font-size:15px;line-height:1.6">Atenciosamente,<br><b>${esc(d.assinatura)}</b><br><span style="color:#6b7690;font-size:13px">Pontes Ferreira Cálculos Judiciais</span></p></td></tr>
  <tr><td style="background:#0b1a3d;padding:18px 28px;text-align:center;color:#aab4c8;font-size:12px;line-height:1.6">
    <b style="color:#ffffff">Pontes Ferreira Cálculos Judiciais</b><br>CNPJ 51.362.258/0001-79 · <a href="https://pontesferreiracalculos.com" style="color:#e3b13c;text-decoration:none">pontesferreiracalculos.com</a><br>
    <span style="color:#7f8aa3">Se preferir não receber nossos contatos, é só responder este e-mail pedindo.</span>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ---------- robô de prospecção por e-mail ----------
const ROBO_PADRAO = { ativo: false, por_dia: 20, intervalo_min: 20, assinatura: 'Amanda Pontes', hora_inicio: 9, hora_fim: 22, dias: [1, 2, 3, 4, 5] };
const NOMES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
async function lerAjuste(chave: string) { const { data } = await db.from('ajustes').select('valor').eq('chave', chave).maybeSingle(); return data?.valor || {}; }
async function roboEmail(teste: boolean) {
  const cfg = { ...ROBO_PADRAO, ...(await lerAjuste('robo_email')) };
  const porDia = Math.min(Math.max(1, Number(cfg.por_dia) || 20), 40), intervalo = Math.max(10, Number(cfg.intervalo_min) || 20);
  if (!cfg.ativo) return { ok: false, motivo: 'robô desligado' };
  const agoraBR = new Date(Date.now() - 3 * 3600e3), dia = agoraBR.toISOString().slice(0, 10), hora = agoraBR.getUTCHours(), sem = agoraBR.getUTCDay();
  const ini = Math.min(Math.max(0, Number(cfg.hora_inicio) || 0), 23), fim = Math.min(Math.max(ini + 1, Number(cfg.hora_fim) || 24), 24);
  const dias = Array.isArray(cfg.dias) && cfg.dias.length ? cfg.dias.map(Number) : ROBO_PADRAO.dias;
  if (!teste && (!dias.includes(sem) || hora < ini || hora >= fim)) return { ok: false, motivo: `fora do horário (${dias.map(x => NOMES_DIA[x]).join(', ')}, ${ini}h–${fim}h)` };
  const log = (await lerAjuste('robo_email_log')).lista || [];
  const hoje = log.filter((x: any) => x.dia === dia && x.ok).length;
  if (hoje >= porDia) return { ok: false, motivo: `limite do dia atingido (${hoje}/${porDia})` };
  const ult = log.find((x: any) => x.ok);
  if (!teste && ult && Date.now() - new Date(ult.em).getTime() < intervalo * 60e3) return { ok: false, motivo: `aguardando o intervalo de ${intervalo} min` };
  const { data: lista } = await db.from('prospects').select('id,nome,escritorio,email,obs,tentativas,status').eq('status', 'a_contatar').not('email', 'is', null).limit(500);
  const jaFoi = new Set(log.map((x: any) => x.id));
  const nota = (p: any) => { const m = String(p.obs || '').match(/★\s*([\d.,]+)\s*\((\d+)/); return m ? Number(m[1].replace(',', '.')) * Math.log10(Number(m[2]) + 1) : 0; };
  const fila = (lista || []).filter((p: any) => !p.tentativas && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email).trim()) && !jaFoi.has(p.id)).sort((a: any, b: any) => nota(b) - nota(a));
  if (!fila.length) return { ok: false, motivo: 'fila vazia: nenhum contato "A contatar" com e-mail' };
  const p = fila[0], nome = String(p.nome || '').trim(), dr = /^(dr|dra)\.?\s/i.test(nome), esc2 = p.escritorio || (!dr ? nome : '');
  const d = { tratamento: dr ? (/^dra/i.test(nome) ? 'Prezada ' : 'Prezado ') + nome.split(/\s+/).slice(0, 2).join(' ') : 'Prezados(as) Drs.',
    abertura: `Gostaríamos de apresentar nossos serviços ao escritório${esc2 ? ' ' + esc2 : ''}.`, assinatura: String(cfg.assinatura || 'Amanda Pontes').slice(0, 80) };
  const reg: any = { em: new Date().toISOString(), dia, id: p.id, nome: nome.slice(0, 80), email: String(p.email).trim(), ok: false };
  try {
    const user = Deno.env.get('SMTP_USER'), pass = Deno.env.get('SMTP_PASS');
    if (!user || !pass) throw new Error('Configure SMTP_USER e SMTP_PASS nos Secrets.');
    const smtp = nodemailer.createTransport({ host: Deno.env.get('SMTP_HOST') || 'email-ssl.com.br', port: Number(Deno.env.get('SMTP_PORT') || 465), secure: true, auth: { user, pass } });
    const html = apresentacaoHtml(d);
    await smtp.sendMail({ from: `"${d.assinatura.replace(/"/g, '')} · Pontes Ferreira Cálculos" <${user}>`, to: reg.email, replyTo: user,
      subject: 'Proposta de parceria – cálculos trabalhistas no PJe-Calc em até 48h', html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') });
    const pr = await lerAjuste('prospeccao'), dias = Number(pr.dias_follow1) || 3;
    const prox = new Date(agoraBR.getTime() + dias * 864e5).toISOString().slice(0, 10);
    await db.from('prospects').update({ status: 'contatado', tentativas: 1, ultimo_contato: reg.em, proximo_contato: prox }).eq('id', p.id);
    reg.ok = true;
  } catch (e) { reg.erro = String((e as Error)?.message || e).slice(0, 160); console.error('robo-email', reg.email, e); }
  await db.from('ajustes').upsert({ chave: 'robo_email_log', publico: false, valor: { lista: [reg, ...log].slice(0, 400) } });
  return { ok: reg.ok, enviado: reg.ok ? reg.email : null, erro: reg.erro || null, hoje: hoje + (reg.ok ? 1 : 0), restante_fila: fila.length - 1 };
}

