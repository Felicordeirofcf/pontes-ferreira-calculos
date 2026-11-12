// @ts-nocheck
// Supabase Edge Function: enviar-calculo-email
// Envia ao cliente, por e-mail, os arquivos do cálculo (PDF e .PJC guardados em "Entregas" do cálculo).
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
    const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: dono } = await usuario.rpc('is_dono');
    if (dono !== true) return resp({ erro: 'nao_autorizado' }, 401);

    const b = await req.json().catch(() => ({}));
    const para = String(b.para || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return resp({ erro: 'email_invalido', mensagem: 'E-mail do cliente inválido.' }, 400);
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
    const html = `<div style="font-family:Arial,sans-serif;color:#111;max-width:620px">
      <div style="background:#0b1a3d;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><div style="font-size:12px;letter-spacing:.3em;color:#e3a82b">PONTES FERREIRA · CÁLCULOS</div>
      <h2 style="margin:6px 0 0;font-size:19px">Seu cálculo está pronto</h2></div>
      <div style="padding:16px 20px;border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px;font-size:14px;line-height:1.55">
      <p>Olá${cli?.nome ? ', ' + esc(String(cli.nome).split(' ').slice(0, 2).join(' ')) : ''}!</p>
      <p>${esc(saud).replace(/\n/g, '<br>')}</p>
      <table style="border-collapse:collapse;margin:10px 0;font-size:14px">
        <tr><td style="padding:4px 10px 4px 0;color:#666">Processo</td><td><b>${esc(calc.numero_processo || '—')}</b></td></tr>
        ${partes ? `<tr><td style="padding:4px 10px 4px 0;color:#666">Partes</td><td>${esc(partes)}</td></tr>` : ''}
        ${calc.tipo ? `<tr><td style="padding:4px 10px 4px 0;color:#666">Tipo</td><td>${esc(calc.tipo)}</td></tr>` : ''}
      </table>
      ${porLink ? `<p><b>Arquivos</b> (links válidos por 7 dias):</p><ul>${links.map(l => `<li><a href="${esc(l.url)}">${esc(l.nome)}</a></li>`).join('')}</ul>`
        : `<p><b>Arquivos em anexo:</b> ${baixados.map(x => esc(x.nome)).join(', ')}</p>`}
      ${portal ? `<p>Você também pode baixar os arquivos a qualquer momento no seu painel: <a href="${esc(portal)}">meus cálculos</a>.</p>` : ''}
      <p>Se o juízo pedir retificação, a primeira revisão decorrente do próprio cálculo é sem custo. Qualquer dúvida, é só responder este e-mail ou chamar no WhatsApp (21) 98770-8652.</p>
      <p style="margin-top:18px">Atenciosamente,<br><b>Pontes Ferreira Cálculos Judiciais</b><br><span style="color:#666">CNPJ 51.362.258/0001-79 · pontesferreiracalculos.com</span></p></div></div>`;

    const user = Deno.env.get('SMTP_USER'), pass = Deno.env.get('SMTP_PASS');
    if (!user || !pass) return resp({ erro: 'smtp', mensagem: 'Configure SMTP_USER e SMTP_PASS nos Secrets.' }, 400);
    const smtp = nodemailer.createTransport({ host: Deno.env.get('SMTP_HOST') || 'email-ssl.com.br', port: Number(Deno.env.get('SMTP_PORT') || 465), secure: true, auth: { user, pass } });
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
