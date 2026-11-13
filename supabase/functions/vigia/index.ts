// @ts-nocheck
// Supabase Edge Function: vigia
// 🛡 Vigia da captação: a cada 30 min confere se o caminho do cliente até você está funcionando
// (site, visitas do anúncio, WhatsApp, formulário, funil, robô de e-mail e verba do Google)
// e avisa no seu WhatsApp pessoal assim que algo quebra — e de novo quando volta ao normal.
// Cada problema gera UM aviso (com lembrete a cada 24h se continuar). Fora do horário escolhido, o aviso espera.
// Se o próprio WhatsApp da empresa estiver fora do ar, o aviso vai por e-mail.
//
// Chamada pelo agendador do banco (pg_cron, ver supabase/vigia-2026-11.sql) e pelo botão "Verificar agora" do painel.
// Deixe "Verify JWT" LIGADO (o agendador manda a chave pública do site).
// Secrets: os mesmos já usados — EVOLUTION_URL, EVOLUTION_KEY (WhatsApp) e SMTP_USER, SMTP_PASS (e-mail reserva).
// Configuração e histórico: tabela ajustes, chaves "vigia" (regras) e "vigia_estado" (situação e histórico).

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const SITE = 'https://pontesferreiracalculos.com';
const digitos = (s: unknown) => String(s || '').replace(/\D/g, '');
const H = 3600e3;

export const PADRAO = {
  ativo: true,
  desligadas: [] as string[],
  // quando pode mandar aviso no WhatsApp (fora disso o aviso espera)
  aviso_dias: [0, 1, 2, 3, 4, 5, 6], aviso_ini: 8, aviso_fim: 21,
  // horário em que o anúncio roda (para o alerta de "sem visitas")
  anuncio_dias: [1, 2, 3, 4, 5], anuncio_ini: 8, anuncio_fim: 19, horas_sem_visita: 3,
  horas_sem_mensagem: 24, cliques_sem_conversa: 3
};
export const VERIFICACOES: Record<string, string> = {
  site: '🌐 Site no ar', anuncio: '📈 Visitas do anúncio', whatsapp: '💬 WhatsApp conectado', mensagens: '📥 Mensagens chegando',
  formulario: '📝 Formulário', funil: '🧭 Cliques viram conversa', robo: '🤖 Robô de e-mail', verba: '💰 Verba do Google'
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));
    const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: dono } = await usuario.rpc('is_dono');
    const manual = dono === true && !!b.agora; // "Verificar agora" do painel
    return resp(await rodar(manual, dono === true && !!b.teste_aviso));
  } catch (e) {
    console.error(e);
    return resp({ erro: 'interno', mensagem: (e as Error).message }, 500);
  }
});

async function ajuste(chave: string) { const { data } = await db.from('ajustes').select('valor').eq('chave', chave).maybeSingle(); return data?.valor || {}; }
async function salvar(chave: string, valor: unknown) { await db.from('ajustes').upsert({ chave, publico: false, valor }); }
const agoraBR = () => new Date(Date.now() - 3 * H); // horário de Brasília (getUTC* = hora local)
const dentro = (dias: number[], ini: number, fim: number, d = agoraBR()) => dias.map(Number).includes(d.getUTCDay()) && d.getUTCHours() >= ini && d.getUTCHours() < fim;
const ha = (iso?: string | null) => iso ? (Date.now() - new Date(iso).getTime()) / H : Infinity;
const horas = (h: number) => !isFinite(h) ? 'nunca' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)} dias`;

async function rodar(manual: boolean, testeAviso: boolean) {
  const cfg = { ...PADRAO, ...(await ajuste('vigia')) };
  if (!cfg.ativo && !manual) return { ok: false, motivo: 'vigia desligado' };
  const est = await ajuste('vigia_estado');
  const checks: Record<string, any> = est.checks || {}, historico: any[] = est.historico || [];
  const agora = new Date().toISOString();
  const res: Record<string, { nivel: string, msg: string, confirmar?: boolean }> = {};
  const roda = async (id: string, fn: () => Promise<any>) => {
    if ((cfg.desligadas || []).includes(id)) return;
    try { res[id] = await fn(); } catch (e) { res[id] = { nivel: 'warn', msg: 'Não consegui verificar: ' + String((e as Error)?.message || e).slice(0, 120) }; }
  };

  await Promise.all([
    roda('site', checarSite), roda('anuncio', () => checarAnuncio(cfg)), roda('whatsapp', checarWhatsapp), roda('mensagens', () => checarMensagens(cfg)),
    roda('formulario', () => checarFormulario(checks.formulario)), roda('funil', () => checarFunil(cfg)), roda('robo', checarRobo), roda('verba', checarVerba)
  ]);

  // máquina de estados: só avisa quando muda (e lembra a cada 24h se continuar ruim)
  const novos: string[] = [], resolvidos: string[] = [];
  const podeAvisar = manual || dentro(cfg.aviso_dias, cfg.aviso_ini, cfg.aviso_fim);
  for (const [id, r] of Object.entries(res)) {
    const c = checks[id] || { nivel: 'ok' };
    if (r.nivel === 'ok') {
      if (c.nivel !== 'ok' && c.avisado_em && id !== 'formulario') { resolvidos.push(`✅ ${VERIFICACOES[id]}: voltou ao normal.`); historico.unshift({ em: agora, id, nivel: 'ok', msg: 'Voltou ao normal' }); }
      checks[id] = { nivel: 'ok', msg: r.msg, desde: c.nivel === 'ok' ? c.desde || agora : agora, verificado: agora, extra: r.extra };
      continue;
    }
    const falhas = c.nivel === r.nivel ? (c.falhas || 1) + 1 : 1;
    const confirmado = !r.confirmar || falhas >= 2; // site e WhatsApp: confirma em 2 verificações seguidas (evita alarme falso)
    const mudou = c.nivel !== r.nivel || c.msg !== r.msg;
    const lembrar = c.avisado_em && ha(c.avisado_em) >= 24;
    const avisar = confirmado && (!c.avisado_em || mudou && c.nivel !== r.nivel || lembrar);
    checks[id] = { ...c, nivel: r.nivel, msg: r.msg, falhas, desde: c.nivel === r.nivel ? c.desde : agora, verificado: agora, extra: r.extra };
    if (avisar && podeAvisar) {
      novos.push(`${r.nivel === 'crit' ? '🔴' : '🟡'} *${VERIFICACOES[id]}*: ${r.msg}`);
      checks[id].avisado_em = agora; checks[id].pendente = false;
      historico.unshift({ em: agora, id, nivel: r.nivel, msg: r.msg });
    } else if (avisar) checks[id].pendente = true;
  }
  // verificações desligadas somem do quadro
  for (const id of Object.keys(checks)) if (!(id in res)) delete checks[id];

  let envio: any = null;
  if (novos.length || resolvidos.length || testeAviso) {
    const texto = ['🛡 *Vigia da captação* · Pontes Ferreira', '',
      ...(novos.length ? novos : []), ...(resolvidos.length ? ['', ...resolvidos] : []),
      ...(testeAviso && !novos.length && !resolvidos.length ? ['✅ Teste: os avisos do vigia estão chegando neste WhatsApp.'] : []),
      '', `Detalhes: ${SITE}/painel/#vigia`].join('\n');
    envio = await avisar(texto, res.whatsapp?.nivel === 'crit');
    if (envio.erro) historico.unshift({ em: agora, id: 'aviso', nivel: 'warn', msg: 'Não consegui mandar o aviso: ' + envio.erro });
  }
  await salvar('vigia_estado', { checks, historico: historico.slice(0, 150), ultima: agora });
  return { ok: true, checks, avisos: novos.length, resolvidos: resolvidos.length, envio };
}

// ---------------- verificações ----------------
async function checarSite() {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(SITE + '/?vigia=1', { signal: ctl.signal, headers: { 'User-Agent': 'PontesFerreira-Vigia/1.0' } });
    const html = await r.text();
    if (!r.ok) return { nivel: 'crit', msg: `O site respondeu com erro ${r.status}. Ninguém consegue pedir orçamento.`, confirmar: true };
    if (!/leadForm/.test(html) || !/wa\.me|js-wa/.test(html)) return { nivel: 'crit', msg: 'O site abriu, mas sem o formulário ou os botões de WhatsApp.', confirmar: true };
    return { nivel: 'ok', msg: 'Site no ar, com formulário e botões de WhatsApp.' };
  } catch (e) {
    return { nivel: 'crit', msg: 'O site não abriu (' + String((e as Error)?.name === 'AbortError' ? 'demorou mais de 15s' : (e as Error)?.message || e).slice(0, 80) + ').', confirmar: true };
  } finally { clearTimeout(t); }
}

async function checarAnuncio(cfg: any) {
  const { data } = await db.from('eventos').select('created_at').eq('tipo', 'visita').or('utm_source.ilike.%google%,utm_medium.eq.cpc').order('created_at', { ascending: false }).limit(1);
  const ult = data?.[0]?.created_at, h = ha(ult), lim = Number(cfg.horas_sem_visita) || 3;
  if (!dentro(cfg.anuncio_dias, cfg.anuncio_ini, cfg.anuncio_fim)) return { nivel: 'ok', msg: `Fora do horário do anúncio. Última visita do Google: há ${horas(h)}.` };
  const abertoHa = agoraBR().getUTCHours() - Number(cfg.anuncio_ini) + agoraBR().getUTCMinutes() / 60; // horas desde que o anúncio começou hoje
  if (h > lim && abertoHa >= lim) return { nivel: 'warn', msg: `Nenhuma visita do Google Ads há ${horas(h)}, em horário de anúncio. Confira no Google Ads se a campanha está ativa, se o saldo acabou ou se algum anúncio foi reprovado.` };
  return { nivel: 'ok', msg: `Última visita do Google Ads: há ${horas(h)}.` };
}

async function checarWhatsapp() {
  const url = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/+$/, ''), key = Deno.env.get('EVOLUTION_KEY') || '', inst = Deno.env.get('EVOLUTION_INSTANCIA') || 'pontes';
  if (!url || !key) return { nivel: 'ok', msg: 'WhatsApp pelo painel não configurado.' };
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`${url}/instance/connectionState/${inst}`, { headers: { apikey: key }, signal: ctl.signal });
    const d = await r.json().catch(() => ({}));
    const st = d?.instance?.state || d?.state;
    if (st === 'open') return { nivel: 'ok', msg: 'Conectado.' };
    return { nivel: 'crit', msg: `O WhatsApp da empresa está ${st === 'close' ? 'DESCONECTADO' : st ? 'com problema (' + st + ')' : 'sem resposta do servidor'}. Mensagens de clientes não chegam ao painel. Abra o painel > WhatsApp > Conectar.`, confirmar: true };
  } catch (e) {
    return { nivel: 'crit', msg: 'O servidor do WhatsApp não respondeu. Mensagens de clientes podem estar se perdendo.', confirmar: true };
  } finally { clearTimeout(t); }
}

async function checarMensagens(cfg: any) {
  const lim = Number(cfg.horas_sem_mensagem) || 24;
  const { data: m } = await db.from('wa_mensagens').select('created_at').eq('direcao', 'in').order('created_at', { ascending: false }).limit(1);
  const diag = ((await ajuste('wa_diag')).lista || []).find((x: any) => x.tipo === 'recebida');
  const ult = [m?.[0]?.created_at, diag?.em].filter(Boolean).sort().pop(), h = ha(ult);
  if (h > lim) return { nivel: 'warn', msg: `Nenhuma mensagem recebida no WhatsApp há ${horas(h)}. Se alguém escreveu e não apareceu, o recebimento travou: abra WhatsApp > 🩺 Diagnóstico.` };
  return { nivel: 'ok', msg: `Última mensagem recebida: há ${horas(h)}.` };
}

async function checarFormulario(anterior: any) {
  const desde = new Date(Date.now() - 24 * H).toISOString(), ate = new Date(Date.now() - 10 * 60e3).toISOString();
  const { data: ped } = await db.from('eventos').select('ref,created_at').eq('tipo', 'pedido').gte('created_at', desde).lte('created_at', ate).limit(200);
  const refs = [...new Set((ped || []).map((x: any) => x.ref).filter(Boolean))];
  if (!refs.length) return { nivel: 'ok', msg: 'Nenhum envio de formulário pendente de conferência.', extra: { avisados: (anterior?.extra?.avisados || []).slice(-50) } };
  const { data: ls } = await db.from('leads').select('ref').in('ref', refs);
  const tem = new Set((ls || []).map((x: any) => x.ref));
  const jaAvisados = new Set(anterior?.extra?.avisados || []);
  const sumiram = refs.filter(r => !tem.has(r)), novos = sumiram.filter(r => !jaAvisados.has(r));
  const extra = { avisados: [...jaAvisados, ...novos].slice(-50) };
  if (novos.length) return { nivel: 'crit', msg: `${novos.length} visitante(s) enviaram o formulário e o pedido não está no painel (${novos.join(', ')}). Se não foi você que apagou, pode ser falha no envio.`, extra };
  return { nivel: 'ok', msg: 'Todos os formulários enviados chegaram ao painel.', extra };
}

async function checarFunil(cfg: any) {
  const desde = new Date(Date.now() - 24 * H).toISOString(), min = Number(cfg.cliques_sem_conversa) || 3;
  const { data: cl } = await db.from('eventos').select('sessao').eq('tipo', 'whatsapp').gte('created_at', desde).limit(500);
  const cliques = new Set((cl || []).map((x: any) => x.sessao).filter(Boolean)).size;
  if (cliques < min) return { nivel: 'ok', msg: `${cliques} clique(s) no WhatsApp do site nas últimas 24h.` };
  const { count: conv } = await db.from('wa_conversas').select('id', { count: 'exact', head: true }).gte('created_at', desde);
  const diag = ((await ajuste('wa_diag')).lista || []).filter((x: any) => x.tipo === 'recebida' && x.em >= desde).length;
  if (!conv && !diag) return { nivel: 'warn', msg: `${cliques} pessoas clicaram no WhatsApp do site nas últimas 24h e nenhuma conversa nova chegou. Ou desistiram no WhatsApp, ou o recebimento falhou: confira o 🩺 Diagnóstico.` };
  return { nivel: 'ok', msg: `${cliques} clique(s) no WhatsApp e ${conv || diag} conversa(s) nova(s) nas últimas 24h.` };
}

async function checarRobo() {
  const cfg = await ajuste('robo_email');
  if (!cfg.ativo) return { nivel: 'ok', msg: 'Robô de e-mail desligado.' };
  const log = (await ajuste('robo_email_log')).lista || [];
  const envios = log.filter((x: any) => !x.devolucao).slice(0, 3);
  if (envios.length === 3 && envios.every((x: any) => !x.ok)) return { nivel: 'crit', msg: `Os 3 últimos envios do robô de e-mail falharam (${String(envios[0].erro || '').slice(0, 80)}).` };
  const dia = agoraBR().toISOString().slice(0, 10), voltaram = log.filter((x: any) => x.devolucao && x.dia === dia).length;
  if (voltaram >= 3) return { nivel: 'warn', msg: `${voltaram} e-mails do robô voltaram hoje (endereços que não existem). Muitos retornos prejudicam a reputação do e-mail.` };
  const { data: fila } = await db.from('prospects').select('id,email,tentativas').eq('status', 'a_contatar').not('email', 'is', null).limit(500);
  const ja = new Set(log.map((x: any) => x.id + '|' + String(x.email || '').toLowerCase()));
  const restam = (fila || []).filter((p: any) => !p.tentativas && !ja.has(p.id + '|' + String(p.email).trim().toLowerCase())).length;
  if (!restam) return { nivel: 'warn', msg: 'A fila do robô de e-mail acabou: não há mais contatos "A contatar" com e-mail. Busque novos escritórios na Prospecção e use ✉ Buscar e-mails.' };
  return { nivel: 'ok', msg: `${restam} contato(s) na fila do robô.` };
}

async function checarVerba() {
  const traf = await ajuste('trafego'), verba = Number(traf.verba_google) || 0;
  if (!verba) return { nivel: 'ok', msg: 'Verba do Google não definida no painel.' };
  const d = agoraBR(), ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const { data } = await db.from('despesas').select('valor').eq('canal', 'Google Ads').gte('data', ini);
  const gasto = (data || []).reduce((s: number, x: any) => s + (Number(x.valor) || 0), 0), p = gasto / verba;
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (p >= 1) return { nivel: 'crit', msg: `O gasto lançado com Google Ads no mês (${brl(gasto)}) passou da verba (${brl(verba)}).` };
  if (p >= 0.9) return { nivel: 'warn', msg: `O gasto lançado com Google Ads no mês já é ${Math.round(p * 100)}% da verba (${brl(gasto)} de ${brl(verba)}).` };
  return { nivel: 'ok', msg: `${brl(gasto)} de ${brl(verba)} no mês (${Math.round(p * 100)}%).` };
}

// ---------------- aviso: WhatsApp pessoal (e e-mail se o WhatsApp estiver fora) ----------------
async function avisar(texto: string, whatsappFora: boolean) {
  let erro = '';
  if (!whatsappFora) {
    try { await avisarWhatsapp(texto); return { canal: 'whatsapp' }; } catch (e) { erro = String((e as Error)?.message || e).slice(0, 160); }
  }
  try { await avisarEmail(texto); return { canal: 'email', erro_whatsapp: erro || (whatsappFora ? 'WhatsApp fora do ar' : '') }; }
  catch (e) { return { erro: (erro ? erro + ' / ' : '') + String((e as Error)?.message || e).slice(0, 160) }; }
}
async function avisarWhatsapp(texto: string) {
  const url = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/+$/, ''), key = Deno.env.get('EVOLUTION_KEY') || '', inst = Deno.env.get('EVOLUTION_INSTANCIA') || 'pontes';
  if (!url || !key) throw new Error('WhatsApp não configurado');
  const aj = await ajuste('alertas');
  let numero = digitos(aj.aviso_whatsapp || Deno.env.get('AVISO_WHATSAPP') || '');
  if (!numero) {
    const r = await fetch(`${url}/instance/fetchInstances?instanceName=${inst}`, { headers: { apikey: key } }).then(x => x.json()).catch(() => null);
    const i = Array.isArray(r) ? r[0] : r;
    numero = digitos(String(i?.ownerJid || i?.owner || '').split('@')[0]) || '5521987708652';
  }
  if (numero.length <= 11) numero = '55' + numero;
  const r = await fetch(`${url}/message/sendText/${inst}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: numero, text: texto }) });
  if (!r.ok) throw new Error('Evolution ' + r.status + ' ' + (await r.text()).slice(0, 120));
}
async function avisarEmail(texto: string) {
  const user = Deno.env.get('SMTP_USER'), pass = Deno.env.get('SMTP_PASS');
  if (!user || !pass) throw new Error('e-mail não configurado');
  const smtp = nodemailer.createTransport({ host: Deno.env.get('SMTP_HOST') || 'email-ssl.com.br', port: Number(Deno.env.get('SMTP_PORT') || 465), secure: true, auth: { user, pass } });
  const para = Deno.env.get('AVISO_PARA') || user;
  await smtp.sendMail({ from: `"Vigia da captação" <${user}>`, to: para, subject: '🛡 Vigia da captação: atenção', text: texto.replace(/\*/g, '') });
}
