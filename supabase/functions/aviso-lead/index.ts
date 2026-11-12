// @ts-nocheck
// Supabase Edge Function: aviso-lead
// Manda um e-mail para você a cada pedido novo (lead) que chega pelo site.
// É chamada pelo próprio banco (gatilho "avisar_lead_novo" no schema.sql).
// IMPORTANTE: ao criar a função, DESLIGUE "Enforce JWT verification" (o banco chama sem login).
// Segurança: a função não confia no que recebe. Ela relê o lead no banco e só avisa
// se ele for novo (até 10 min) e ainda não tiver sido avisado. Assim ninguém consegue
// usá-la para mandar e-mails.
//
// Secrets (Edge Functions > Secrets):
//   SMTP_USER  -> adm@pontesferreiracalculos.com (a caixa de e-mail da Locaweb que envia)
//   SMTP_PASS  -> senha dessa caixa de e-mail
//   AVISO_PARA -> opcional: quem recebe (padrão: o próprio SMTP_USER). Vários: separe por vírgula
//   SMTP_HOST / SMTP_PORT -> opcionais (padrão Locaweb: email-ssl.com.br, 465)
// Aviso no WhatsApp (pela Evolution API, os mesmos secrets EVOLUTION_URL e EVOLUTION_KEY do painel):
//   vai para o número definido no painel (Configurações > Avisos > WhatsApp que recebe o aviso);
//   sem número definido, vai para o próprio WhatsApp da empresa (conversa "Você", sem som no celular).

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PAINEL = 'https://pontesferreiracalculos.com/painel/#leads';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const digitos = (s: string) => String(s || '').replace(/\D/g, '');

Deno.serve(async req => {
  let id: string | null = null;
  try {
    const corpo = await req.json().catch(() => ({}));
    id = corpo?.record?.id || corpo?.id || null;
    if (!id) return new Response('sem id', { status: 400 });

    const { data: l } = await db.from('leads').select('*').eq('id', id).maybeSingle();
    if (!l) return new Response('lead não encontrado', { status: 404 });
    if (l.aviso_enviado_em) return new Response('já avisado');
    if (Date.now() - new Date(l.created_at).getTime() > 10 * 60e3) return new Response('lead antigo');

    // marca antes de enviar, para nunca mandar dois e-mails do mesmo lead
    const { data: marcado } = await db.from('leads').update({ aviso_enviado_em: new Date().toISOString() }).eq('id', id).is('aviso_enviado_em', null).select('id');
    if (!marcado?.length) return new Response('já avisado');

    let pdf = '';
    if (l.arquivo_path) {
      const { data } = await db.storage.from('processos').createSignedUrl(l.arquivo_path, 7 * 24 * 3600);
      if (data?.signedUrl) pdf = data.signedUrl;
    }
    let wa = digitos(l.whatsapp); if (wa && wa.length <= 11) wa = '55' + wa;
    const nome = (l.nome || '').split(' ').slice(0, 2).join(' ');
    const saudacao = `Olá, ${nome}! Aqui é da Pontes Ferreira Cálculos Judiciais. Recebemos seu pedido de cálculo${l.numero_processo ? ` do processo ${l.numero_processo}` : ''} e já vamos analisar. 😊`;
    const urgente = /48h|urgente/i.test(l.prazo || '');
    const origem = [l.origem, l.utm_campaign && l.utm_campaign !== l.origem ? l.utm_campaign : null, l.utm_term].filter(Boolean).join(' · ');

    const linhas: [string, string][] = [
      ['Nome', esc(l.nome)],
      ['WhatsApp', wa ? `<a href="https://wa.me/${wa}?text=${encodeURIComponent(saudacao)}">${esc(l.whatsapp)} · responder agora</a>` : '—'],
      ['Cálculo', esc(l.tipo || '—')],
      ['Prazo', `${urgente ? '🔴 ' : ''}${esc(l.prazo || '—')}`],
      ['Processo', l.numero_processo ? esc(l.numero_processo) : (pdf ? `<a href="${pdf}">Baixar o PDF</a> (link válido por 7 dias)` : '—')],
      ['Origem', esc(origem || 'site')]
    ];
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:560px">
      <h2 style="margin:0 0 6px">${urgente ? '🔴 URGENTE · ' : ''}Novo pedido de cálculo</h2>
      <p style="margin:0 0 14px;color:#555">Responda em até 15 minutos: quem responde primeiro fecha.</p>
      <table style="border-collapse:collapse;width:100%">${linhas.map(([k, v]) => `<tr><td style="padding:7px 10px;border-bottom:1px solid #eee;color:#555;width:110px">${k}</td><td style="padding:7px 10px;border-bottom:1px solid #eee">${v}</td></tr>`).join('')}</table>
      <p style="margin:18px 0"><a href="${PAINEL}" style="background:#0f1c2e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir no painel</a></p>
      <p style="color:#888;font-size:12px">Aviso automático do site pontesferreiracalculos.com</p></div>`;
    const texto = linhas.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, '')}`).join('\n') + `\n\nPainel: ${PAINEL}`;

    // 1) aviso no WhatsApp (antes do e-mail: se o e-mail falhar, o WhatsApp já foi)
    await avisarWhatsapp([
      `${urgente ? '🔴 *URGENTE* · ' : '🔔 '}*Novo pedido no site*`,
      `👤 ${l.nome || 'sem nome'}`,
      wa ? `📱 ${l.whatsapp} · responder: https://wa.me/${wa}?text=${encodeURIComponent(saudacao)}` : '',
      `🧮 ${l.tipo || 'Cálculo'}${l.prazo ? ` · prazo: ${l.prazo}` : ''}`,
      l.numero_processo ? `📄 Processo ${l.numero_processo}` : (pdf ? '📄 Enviou o PDF (link no e-mail)' : ''),
      `📍 Origem: ${origem || 'site'}${l.cidade ? ` · ${l.cidade}${l.uf ? '/' + l.uf : ''}` : ''}`,
      `\nAbrir no painel: ${PAINEL}`
    ].filter(Boolean).join('\n')).catch(e => console.error('aviso whatsapp', e));

    // 2) aviso por e-mail
    const user = Deno.env.get('SMTP_USER')!, pass = Deno.env.get('SMTP_PASS')!;
    if (!user || !pass) throw new Error('Configure SMTP_USER e SMTP_PASS nos Secrets');
    const smtp = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST') || 'email-ssl.com.br', port: Number(Deno.env.get('SMTP_PORT') || 465), secure: true,
      auth: { user, pass }
    });
    await smtp.sendMail({
      from: `"Site Pontes Ferreira" <${user}>`, to: Deno.env.get('AVISO_PARA') || user,
      subject: `${urgente ? '🔴 URGENTE · ' : ''}Novo pedido: ${l.nome || 'sem nome'} · ${l.tipo || 'cálculo'}`,
      text: texto, html
    });
    return new Response('enviado');
  } catch (e) {
    console.error(e);
    // libera para tentar de novo numa próxima chamada manual, se falhou no envio
    if (id) await db.from('leads').update({ aviso_enviado_em: null }).eq('id', id).then(() => { }, () => { });
    return new Response('erro: ' + (e as Error).message, { status: 500 });
  }
});

// Manda o aviso pelo WhatsApp da empresa (Evolution API) para o número configurado no painel
async function avisarWhatsapp(texto: string) {
  const url = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/+$/, ''), key = Deno.env.get('EVOLUTION_KEY') || '', inst = Deno.env.get('EVOLUTION_INSTANCIA') || 'pontes';
  if (!url || !key) return;
  const { data: aj } = await db.from('ajustes').select('valor').eq('chave', 'alertas').maybeSingle();
  if (aj?.valor?.aviso_whatsapp_off) return;
  let numero = digitos(aj?.valor?.aviso_whatsapp || Deno.env.get('AVISO_WHATSAPP') || '');
  if (!numero) { // sem número definido: o próprio número da empresa
    const r = await fetch(`${url}/instance/fetchInstances?instanceName=${inst}`, { headers: { apikey: key } }).then(x => x.json()).catch(() => null);
    const i = Array.isArray(r) ? r[0] : r;
    numero = digitos(String(i?.ownerJid || i?.owner || i?.instance?.owner || '').split('@')[0]) || '5521987708652';
  }
  if (numero.length <= 11) numero = '55' + numero;
  const r = await fetch(`${url}/message/sendText/${inst}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: numero, text: texto }) });
  if (!r.ok) throw new Error('Evolution ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

