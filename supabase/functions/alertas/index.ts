// @ts-nocheck
// Supabase Edge Function: alertas
// E-mails automáticos para o dono (mesma caixa do aviso de pedidos):
//   • diário (8h): prazos de hoje e amanhã, atrasados, cálculos parados, leads sem resposta, retornos e a receber
//   • semanal (segunda, 8h): resumo da semana passada e prazos da semana
// Chamada pelo agendador do banco (pg_cron, ver schema.sql) e pelo botão "Enviar teste" do painel.
// IMPORTANTE: DESLIGUE "Enforce JWT verification". Proteção: cada e-mail só sai uma vez por dia/semana,
// a não ser no teste feito pelo dono (logado no painel).
// Secrets: os mesmos da função aviso-lead (SMTP_USER, SMTP_PASS, opcionais SMTP_HOST, SMTP_PORT, AVISO_PARA)

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PAINEL = 'https://pontesferreiracalculos.com/painel/';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const diaSP = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const somaDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const br = (iso: string) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const soma = (a: any[], f: (x: any) => number) => a.reduce((t, x) => t + (Number(f(x)) || 0), 0);

async function tudo() {
  const ler = async (t: string, campos = '*') => (await db.from(t).select(campos).limit(5000)).data || [];
  const [calculos, leads, clientes, despesas, prospects] = await Promise.all([ler('calculos'), ler('leads'), ler('clientes', 'id,nome'), ler('despesas'), ler('prospects', 'id,nome,status,tentativas,proximo_contato')]);
  const nomeCli = (id: string) => clientes.find((c: any) => c.id === id)?.nome || '—';
  return { calculos, leads, despesas, prospects, nomeCli };
}
const tabela = (titulo: string, cab: string[], linhas: string[][], vazio = '') => !linhas.length ? (vazio ? `<p style="color:#888;margin:4px 0 16px">${vazio}</p>` : '') :
  `<h3 style="font-size:15px;margin:20px 0 6px">${titulo}</h3><table style="border-collapse:collapse;width:100%;font-size:13px">
   <tr>${cab.map(h => `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e3a82b;color:#555">${h}</th>`).join('')}</tr>
   ${linhas.map(l => `<tr>${l.map(c => `<td style="padding:6px 8px;border-bottom:1px solid #eee">${c}</td>`).join('')}</tr>`).join('')}</table>`;
const caixa = (rot: string, val: string, cor = '#0b1a3d') => `<td style="padding:10px 12px;background:#f6f4ef;border-radius:8px"><div style="font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.05em">${rot}</div><div style="font-size:20px;font-weight:700;color:${cor}">${val}</div></td>`;
const molde = (titulo: string, sub: string, corpo: string) => `<div style="font-family:Arial,sans-serif;color:#111;max-width:640px">
  <div style="background:#0b1a3d;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><div style="font-size:12px;letter-spacing:.3em;color:#e3a82b">PONTES FERREIRA · CÁLCULOS</div><h2 style="margin:6px 0 0;font-size:20px">${titulo}</h2><div style="opacity:.8;font-size:13px">${sub}</div></div>
  <div style="padding:6px 20px 20px;border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px">${corpo}
  <p style="margin:22px 0 0"><a href="${PAINEL}" style="background:#e3a82b;color:#1b1203;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Abrir o painel</a></p></div></div>`;

async function diario() {
  const { calculos, leads, prospects, nomeCli } = await tudo(), hoje = diaSP(), amanha = somaDias(hoje, 1);
  const abertos = calculos.filter((c: any) => c.status !== 'entregue');
  const linhaCalc = (c: any) => [esc(c.numero_processo || '—'), esc(nomeCli(c.cliente_id)), esc(c.tipo || '—'), br(c.prazo_entrega)];
  const vHoje = abertos.filter((c: any) => c.prazo_entrega === hoje), vAmanha = abertos.filter((c: any) => c.prazo_entrega === amanha);
  const atrasados = abertos.filter((c: any) => c.prazo_entrega && c.prazo_entrega < hoje);
  const parados = abertos.filter((c: any) => c.status === 'recebido' && c.data_entrada && c.data_entrada <= somaDias(hoje, -2));
  const semResp = leads.filter((l: any) => l.status === 'novo' && !l.respondido_em);
  const retornos = leads.filter((l: any) => !['fechado', 'perdido'].includes(l.status) && l.proximo_contato && l.proximo_contato <= hoje);
  const follow = prospects.filter((p: any) => p.status === 'contatado' && p.proximo_contato && p.proximo_contato <= hoje && (p.tentativas || 0) < 3);
  const receber = calculos.filter((c: any) => c.status === 'entregue' && !c.pago && c.data_entrega && c.data_entrega <= somaDias(hoje, -7));
  const total = vHoje.length + vAmanha.length + atrasados.length + parados.length + semResp.length + retornos.length + follow.length + receber.length;
  const corpo = `<table style="width:100%;border-spacing:6px;margin:12px 0"><tr>${caixa('Vencem hoje', String(vHoje.length), vHoje.length ? '#c0392b' : '#0b1a3d')}${caixa('Amanhã', String(vAmanha.length))}${caixa('Atrasados', String(atrasados.length), atrasados.length ? '#c0392b' : '#0b1a3d')}${caixa('Leads sem resposta', String(semResp.length), semResp.length ? '#c0392b' : '#0b1a3d')}</tr></table>
    ${tabela('🔴 Atrasados', ['Processo', 'Cliente', 'Tipo', 'Prazo'], atrasados.map(linhaCalc))}
    ${tabela('⏰ Vencem hoje', ['Processo', 'Cliente', 'Tipo', 'Prazo'], vHoje.map(linhaCalc))}
    ${tabela('📅 Vencem amanhã', ['Processo', 'Cliente', 'Tipo', 'Prazo'], vAmanha.map(linhaCalc))}
    ${tabela('⏸ Parados (recebidos há 2+ dias e não iniciados)', ['Processo', 'Cliente', 'Tipo', 'Prazo'], parados.map(linhaCalc))}
    ${tabela('💬 Leads sem resposta', ['Nome', 'WhatsApp', 'Pedido', 'Desde'], semResp.map((l: any) => [esc(l.nome || '—'), esc(l.whatsapp || '—'), esc(l.tipo || '—'), br(l.created_at)]))}
    ${tabela('📞 Retornos agendados (leads)', ['Nome', 'Status', 'Retorno'], retornos.map((l: any) => [esc(l.nome || '—'), esc(l.status), br(l.proximo_contato)]))}
    ${tabela('🎯 Follow-ups da prospecção', ['Contato', 'Tentativas', 'Retorno'], follow.map((p: any) => [esc(p.nome), String(p.tentativas || 0), br(p.proximo_contato)]))}
    ${tabela('💰 A receber há mais de 7 dias', ['Processo', 'Cliente', 'Entregue', 'Valor'], receber.map((c: any) => [esc(c.numero_processo || '—'), esc(nomeCli(c.cliente_id)), br(c.data_entrega), brl(c.valor_cobrado)]))}
    ${total ? '' : '<p style="margin:16px 0">Nada pendente para hoje. 🎉</p>'}`;
  return { total, assunto: `${vHoje.length + atrasados.length ? '🔴 ' : ''}Agenda de hoje: ${vHoje.length} prazo(s) hoje, ${vAmanha.length} amanhã, ${atrasados.length} atrasado(s)`, html: molde('Agenda do dia', br(hoje), corpo) };
}

async function semanal() {
  const { calculos, leads, despesas, nomeCli } = await tudo(), hoje = diaSP(), ini = somaDias(hoje, -7), fimProx = somaDias(hoje, 7);
  const naSemana = (d: string) => d && d.slice(0, 10) >= ini && d.slice(0, 10) < hoje;
  const leadsS = leads.filter((l: any) => naSemana(l.created_at)), fechados = leadsS.filter((l: any) => l.status === 'fechado');
  const entraram = calculos.filter((c: any) => naSemana(c.data_entrada)), entregues = calculos.filter((c: any) => c.status === 'entregue' && naSemana(c.data_entrega));
  const faturado = soma(entregues, (c: any) => c.valor_cobrado), recebido = soma(calculos.filter((c: any) => c.pago && naSemana(c.data_pagamento)), (c: any) => c.valor_cobrado);
  const gastos = soma(despesas.filter((d: any) => naSemana(d.data)), (d: any) => d.valor);
  const aReceber = calculos.filter((c: any) => c.status === 'entregue' && !c.pago);
  const prox = calculos.filter((c: any) => c.status !== 'entregue' && c.prazo_entrega && c.prazo_entrega >= hoje && c.prazo_entrega <= fimProx).sort((a: any, b: any) => a.prazo_entrega.localeCompare(b.prazo_entrega));
  const origem: Record<string, number> = {}; leadsS.forEach((l: any) => { const k = l.origem || 'Site'; origem[k] = (origem[k] || 0) + 1; });
  const corpo = `<table style="width:100%;border-spacing:6px;margin:12px 0"><tr>${caixa('Leads', String(leadsS.length))}${caixa('Fechados', String(fechados.length))}${caixa('Cálculos entregues', String(entregues.length))}</tr>
    <tr>${caixa('Faturado', brl(faturado))}${caixa('Recebido', brl(recebido), '#1f7a44')}${caixa('Despesas', brl(gastos))}</tr></table>
    <p style="margin:6px 0">Conversão da semana: <b>${leadsS.length ? Math.round(fechados.length / leadsS.length * 100) + '%' : '—'}</b> · Cálculos que entraram: <b>${entraram.length}</b> · A receber (total): <b>${brl(soma(aReceber, (c: any) => c.valor_cobrado))}</b> em ${aReceber.length} cálculo(s)</p>
    ${tabela('De onde vieram os leads', ['Origem', 'Leads'], Object.entries(origem).sort((a, b) => b[1] - a[1]).map(([k, v]) => [esc(k), String(v)]), 'Nenhum lead na semana.')}
    ${tabela('📅 Prazos dos próximos 7 dias', ['Prazo', 'Processo', 'Cliente', 'Status'], prox.map((c: any) => [br(c.prazo_entrega), esc(c.numero_processo || '—'), esc(nomeCli(c.cliente_id)), esc(c.status)]), 'Nenhum prazo na próxima semana.')}`;
  return { total: 1, assunto: `Resumo da semana: ${leadsS.length} lead(s), ${fechados.length} fechado(s), ${brl(recebido)} recebidos`, html: molde('Resumo da semana', `${br(ini)} a ${br(somaDias(hoje, -1))}`, corpo) };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let teste = false;
  try {
    const b = await req.json().catch(() => ({}));
    const tipo = b.tipo === 'semanal' ? 'semanal' : 'diario';
    // teste manual: só o dono logado no painel pode forçar o envio
    if (b.teste && req.headers.get('Authorization')) {
      const u = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
      const { data } = await u.rpc('is_dono'); teste = data === true;
      if (!teste) return resp({ erro: 'nao_autorizado' }, 401);
    }
    // chamada automática (sem login): só vale no horário do agendamento (8h de Brasília = 11h UTC) e, o semanal, só na segunda.
    // Assim, quem descobrir o endereço não consegue disparar e-mails nem "gastar" o envio da semana.
    if (!teste) {
      const agora = new Date(), min = agora.getUTCHours() * 60 + agora.getUTCMinutes();
      const segundaSP = new Date(agora.getTime() - 3 * 3600e3).getUTCDay() === 1;
      if (min < 10 * 60 + 50 || min > 12 * 60 + 30 || (tipo === 'semanal' && !segundaSP)) return resp({ ok: true, pulado: 'fora_do_horario' });
    }
    const marca = tipo === 'diario' ? diaSP() : `${diaSP().slice(0, 4)}-s${Math.ceil((new Date(diaSP() + 'T12:00:00Z').getTime() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 864e5 / 7)}`;
    const { data: logRow } = await db.from('ajustes').select('valor').eq('chave', 'alertas').maybeSingle();
    const log = logRow?.valor || {};
    if (log.desligado?.[tipo] && !teste) return resp({ ok: true, pulado: 'desligado' });
    if (!teste && log[tipo] === marca) return resp({ ok: true, pulado: 'ja_enviado' });

    const r = tipo === 'diario' ? await diario() : await semanal();
    if (tipo === 'diario' && !r.total && !teste) { await db.from('ajustes').upsert({ chave: 'alertas', publico: false, valor: { ...log, [tipo]: marca } }); return resp({ ok: true, pulado: 'nada_pendente' }); }

    const user = Deno.env.get('SMTP_USER')!, pass = Deno.env.get('SMTP_PASS')!;
    if (!user || !pass) throw new Error('Configure SMTP_USER e SMTP_PASS nos Secrets');
    const smtp = nodemailer.createTransport({ host: Deno.env.get('SMTP_HOST') || 'email-ssl.com.br', port: Number(Deno.env.get('SMTP_PORT') || 465), secure: true, auth: { user, pass } });
    await smtp.sendMail({ from: `"Painel Pontes Ferreira" <${user}>`, to: Deno.env.get('AVISO_PARA') || user, subject: (teste ? '[TESTE] ' : '') + r.assunto, html: r.html, text: r.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') });
    if (!teste) await db.from('ajustes').upsert({ chave: 'alertas', publico: false, valor: { ...log, [tipo]: marca } });
    return resp({ ok: true, enviado: tipo });
  } catch (e) {
    console.error(e);
    return resp({ erro: 'interno', ...(teste ? { mensagem: (e as Error).message } : {}) }, 500); // detalhe só para o dono (teste do painel)
  }
});
