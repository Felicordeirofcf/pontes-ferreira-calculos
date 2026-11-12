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

// Regras do monitoramento do tráfego pago (copiadas de site/painel/monitor-ads.js por scripts/sincronizar-robo.mjs)
// <monitor-ads>
const MON_FREQ = { diaria: 'Todo dia', semanal: 'Toda segunda', mensal: 'Todo dia 1º' };
const MON_RUINS = /gr[aá]tis|gratuit|calculadora|curso|apostila|download|baixar|como fazer|como calcular|tutorial|vaga|emprego|concurso|sal[aá]rio d|quanto ganha|meus direitos|fgts|seguro desemprego|rescis[aã]o|planilha|modelo|pdf|manual|treinamento|aplicativo|excel|significa|o que (?:é|e)\b|oque|quanto tempo|demora|homologad|juntada|iniciada|fase de|justi[cç]a do trabalho|\bia\b|intelig[eê]ncia artificial|rescis[oó]ri/i;
const monNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/["\[\]+]/g, '').replace(/\s+/g, ' ').trim();
const monDia = ts => String(ts || '').slice(0, 10);
const monSomaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monBrl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const monPct = v => isFinite(v) ? Math.round(v * 100) + '%' : '—';
const monGoogle = l => !!l.gclid || /google|gads|adwords|cpc/i.test(`${l.utm_source || ''} ${l.origem || ''} ${l.utm_medium || ''}`);
const monSessoes = (ev, f) => new Set(ev.filter(f).map(e => e.sessao)).size;

// d = { hoje, agora, leads, despesas, eventos (Google, últimos ~35 dias), gads, traf, rast }
// cada regra devolve null (tudo certo) ou { nivel: 'crit' | 'warn' | 'dica', msg, acao }
const MON_REGRAS = [
  /* ---------- todo dia ---------- */
  { id: 'lead_sem_resposta', freq: 'diaria', titulo: 'Pedido de anúncio sem resposta', avaliar(d) {
    const l = d.leads.filter(x => monGoogle(x) && x.status === 'novo' && !x.respondido_em && d.agora - new Date(x.created_at).getTime() > 3600e3);
    return l.length ? { nivel: 'crit', msg: `${l.length} pedido(s) vindos do Google esperando resposta há mais de 1 hora (${l.slice(0, 3).map(x => x.nome || x.whatsapp).join(', ')}${l.length > 3 ? '…' : ''}).`, acao: 'Responda agora com o orçamento. Lead de prazo processual fecha com quem responde primeiro.' } : null;
  } },
  { id: 'rastreamento', freq: 'diaria', titulo: 'Medição das conversões ligada', avaliar(d) {
    if (d.rast && d.rast.ativo && d.rast.gads_id && d.rast.gads_label) return null;
    return { nivel: 'crit', msg: 'O site não está registrando as conversões do Google Ads.', acao: 'Tráfego pago › 1. Ativação: confira o ID, o rótulo e ligue a chave. Sem isso o Google não aprende quem vira cliente.' };
  } },
  { id: 'whatsapp_sem_lead', freq: 'diaria', titulo: 'Cliques no WhatsApp viram conversa no painel', avaliar(d) {
    const desde = monSomaDias(d.hoje, -2);
    const cliques = monSessoes(d.eventos, e => e.tipo === 'whatsapp' && e.utm_term && monDia(e.created_at) >= desde);
    const leads = d.leads.filter(l => monGoogle(l) && monDia(l.created_at) >= desde).length;
    if (cliques < 2 || leads) return null;
    return { nivel: 'crit', msg: `${cliques} pessoa(s) do anúncio clicaram no WhatsApp nos últimos 2 dias e nenhum pedido entrou no painel.`, acao: 'Confira se o WhatsApp do painel está recebendo (aba WhatsApp: faixa verde "conectado"). Se não estiver, reconecte pelo QR code e responda essas pessoas pelo celular.' };
  } },
  { id: 'anuncio_parado', freq: 'diaria', titulo: 'Anúncio trazendo visitas', avaliar(d) {
    const ja = d.eventos.some(e => e.utm_term) || (d.gads && d.gads.campanhas);
    if (!ja) return null;
    const desde = monSomaDias(d.hoje, -3);
    if (d.eventos.some(e => e.tipo === 'visita' && e.utm_term && monDia(e.created_at) >= desde)) return null;
    return { nivel: 'warn', msg: 'Nenhuma visita vinda do anúncio nos últimos 3 dias.', acao: 'No Google Ads: confira o saldo do Pix (recarregue se acabou), se a campanha está "Qualificada" e, se estiver com 0 impressões, aumente o limite de CPC (ex.: de R$ 4 para R$ 6).' };
  } },

  /* ---------- toda segunda ---------- */
  { id: 'relatorio_velho', freq: 'semanal', titulo: 'Relatórios do Google atualizados', avaliar(d) {
    const g = d.gads || {}, datas = ['palavras', 'termos', 'campanhas'].map(k => g[k] && g[k].importado_em).filter(Boolean).sort();
    const ultimo = datas[datas.length - 1];
    if (ultimo && d.agora - new Date(ultimo).getTime() < 8 * 86400e3) return null;
    return { nivel: 'dica', msg: ultimo ? `O último relatório do Google Ads foi importado em ${ultimo.slice(0, 10).split('-').reverse().join('/')}.` : 'Nenhum relatório do Google Ads importado ainda.', acao: 'Baixe "Termos de pesquisa" e "Palavras-chave" (CSV) e importe em Tráfego pago › Google Ads. Leva 2 minutos e mostra onde a verba está indo.' };
  } },
  { id: 'impressoes_zero', freq: 'semanal', titulo: 'Campanha aparecendo nas buscas', avaliar(d) {
    const base = d.gads && (d.gads.campanhas || d.gads.palavras);
    if (!base || !base.linhas.length) return null;
    const impr = base.linhas.reduce((t, x) => t + (x.impr || 0), 0);
    return impr ? null : { nivel: 'warn', msg: 'O último relatório mostra 0 impressões: o anúncio não está aparecendo.', acao: 'Aumente o limite de CPC máximo (R$ 4 → R$ 6) em Configurações › Lances. Se continuar em 0, inclua palavras-chave de maior volume, como "calculista trabalhista" em correspondência de frase.' };
  } },
  { id: 'negativas', freq: 'semanal', titulo: 'Termos de pesquisa que não são cliente', avaliar(d) {
    const t = (d.gads && d.gads.termos && d.gads.termos.linhas) || [];
    const minhas = new Set([...((d.gads && d.gads.palavras && d.gads.palavras.linhas) || []), ...t].map(x => monNorm(x.palavra)).filter(Boolean));
    const ruins = [...new Set(t.filter(x => !x.conv && x.cliques && !minhas.has(monNorm(x.termo)) && MON_RUINS.test(x.termo)).map(x => x.termo))];
    return ruins.length ? { nivel: 'warn', msg: `${ruins.length} termo(s) com cara de quem não é cliente receberam cliques: ${ruins.slice(0, 4).map(x => `"${x}"`).join(', ')}${ruins.length > 4 ? '…' : ''}.`, acao: 'Tráfego pago › Google Ads › Termos de pesquisa › "Copiar negativas sugeridas" e cole nas palavras negativas da campanha.' } : null;
  } },
  { id: 'ctr_baixo', freq: 'semanal', titulo: 'Anúncio atraente (CTR)', avaliar(d) {
    const p = ((d.gads && d.gads.palavras && d.gads.palavras.linhas) || []).filter(x => x.impr >= 200 && x.cliques / x.impr < 0.03);
    return p.length ? { nivel: 'warn', msg: `${p.length} palavra(s)-chave com menos de 3% de cliques: ${p.slice(0, 3).map(x => `"${x.palavra}" (${(x.cliques / x.impr * 100).toFixed(1).replace('.', ',')}%)`).join(', ')}.`, acao: 'Coloque a própria palavra-chave e o preço nos títulos do grupo (ex.: "Calculista PJe-Calc R$ 250") e confira se a busca combina com o serviço.' } : null;
  } },
  { id: 'palavra_sem_pedido', freq: 'semanal', titulo: 'Palavras-chave que gastam sem trazer pedido', avaliar(d) {
    const p = (d.gads && d.gads.palavras && d.gads.palavras.linhas) || [];
    const comLead = new Set(d.leads.filter(l => l.utm_term).map(l => monNorm(l.utm_term)));
    const cpc = (() => { const c = p.reduce((t, x) => t + x.cliques, 0); return c ? p.reduce((t, x) => t + x.custo, 0) / c : 0; })();
    const r = p.filter(x => !x.conv && x.custo >= Math.max(40, cpc * 10) && !comLead.has(monNorm(x.palavra)));
    return r.length ? { nivel: 'warn', msg: `${r.map(x => `"${x.palavra}" (${monBrl(x.custo)})`).slice(0, 3).join(', ')} gastaram sem gerar nenhum pedido.`, acao: 'Veja os termos de pesquisa dessas palavras: negative os ruins ou pause a palavra e passe a verba para as que trazem pedido.' } : null;
  } },
  { id: 'site_converte', freq: 'semanal', titulo: 'Visitante do anúncio chama no WhatsApp', avaliar(d) {
    const desde = monSomaDias(d.hoje, -7), ev = d.eventos.filter(e => e.utm_term && monDia(e.created_at) >= desde);
    const vis = monSessoes(ev, e => e.tipo === 'visita'), cont = monSessoes(ev, e => e.tipo === 'whatsapp' || e.tipo === 'pedido');
    if (vis < 25 || cont / vis >= 0.06) return null;
    return { nivel: 'warn', msg: `Só ${monPct(cont / vis)} dos ${vis} visitantes do anúncio na semana chamaram no WhatsApp ou pediram orçamento (bom: 8% ou mais).`, acao: 'Na primeira tela do site, deixe à vista preço, prazo de 48h e o botão do WhatsApp; teste um título com a dor do advogado ("Prazo de liquidação correndo?").' };
  } },
  { id: 'celular', freq: 'semanal', titulo: 'Experiência no celular', avaliar(d) {
    const desde = monSomaDias(d.hoje, -14), ev = d.eventos.filter(e => e.utm_term && monDia(e.created_at) >= desde);
    const taxa = disp => { const v = monSessoes(ev, e => e.tipo === 'visita' && e.dispositivo === disp); return { v, t: v ? monSessoes(ev, e => (e.tipo === 'whatsapp' || e.tipo === 'pedido') && e.dispositivo === disp) / v : 0 }; };
    const cel = taxa('celular'), pc = taxa('computador');
    if (cel.v < 20 || pc.v < 10 || cel.t >= pc.t * 0.6) return null;
    return { nivel: 'dica', msg: `No celular, ${monPct(cel.t)} dos visitantes do anúncio chamam; no computador, ${monPct(pc.t)}.`, acao: 'Abra o site no celular como cliente: o botão do WhatsApp precisa aparecer sem rolar e o formulário deve ser curto.' };
  } },
  { id: 'sem_orcamento', freq: 'semanal', titulo: 'Todo pedido recebe orçamento', avaliar(d) {
    const desde = monSomaDias(d.hoje, -14), l = d.leads.filter(x => monGoogle(x) && monDia(x.created_at) >= desde && monDia(x.created_at) < monSomaDias(d.hoje, -1));
    if (l.length < 3) return null;
    const orc = l.filter(x => x.status !== 'novo').length;
    return orc / l.length >= 0.7 ? null : { nivel: 'warn', msg: `Só ${orc} de ${l.length} pedidos do Google nas últimas 2 semanas receberam orçamento.`, acao: 'Mande o orçamento no mesmo dia (Leads › arraste para "Orçamento enviado"). Pedido sem orçamento é verba de anúncio jogada fora.' };
  } },
  { id: 'motivo_perda', freq: 'semanal', titulo: 'Por que os pedidos do Google são perdidos', avaliar(d) {
    const desde = monSomaDias(d.hoje, -30), p = d.leads.filter(x => monGoogle(x) && x.status === 'perdido' && monDia(x.created_at) >= desde);
    if (p.length < 3) return null;
    // agrupa variações ("preço", "Preço alto", "achou caro") no mesmo motivo
    const grupo = m => { const t = monNorm(m); return !t ? 'sem motivo anotado' : /preco|caro|valor|barato|orcamento/.test(t) ? 'preço' : /prazo|demor|urgen/.test(t) ? 'prazo' : /fez|outro|concorr|colega|interno/.test(t) ? 'fez com outro' : /sumiu|nao respond|parou/.test(t) ? 'parou de responder' : t.slice(0, 40); };
    const cont = {}; p.forEach(x => { const k = grupo(x.motivo_perda); cont[k] = (cont[k] || 0) + 1; });
    const [top, n] = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
    const dica = /pre[cç]o|caro|valor/.test(top) ? 'Teste uma oferta de entrada (ex.: 1º cálculo com 20% off) ou destaque o que está incluso (.PJC + relatório + 1 revisão).'
      : /prazo|demor/.test(top) ? 'Destaque o prazo de 48h e ofereça urgência (24h) com acréscimo.'
      : /parou de responder/.test(top) ? 'Faça follow-up em 24h e em 3 dias (resposta rápida "Follow-up") e pergunte a data do prazo processual.'
      : /outro/.test(top) ? 'Responda mais rápido que a concorrência e mostre o diferencial: resumo do deferido e 1 revisão sem custo.'
      : /sem motivo/.test(top) ? 'Anote o motivo de cada perda no lead: é o que mostra o que mudar na oferta.' : 'Ajuste a oferta e o anúncio para esse motivo.';
    return { nivel: 'dica', msg: `${p.length} pedidos do Google perdidos em 30 dias; o motivo mais comum: "${top}" (${n}).`, acao: dica };
  } },

  /* ---------- todo dia 1º ---------- */
  { id: 'verba', freq: 'mensal', titulo: 'Verba do mês bem usada', avaliar(d) {
    const verba = Number(d.traf && d.traf.verba_google) || 0; if (!verba) return null;
    const ini = monSomaDias(d.hoje.slice(0, 8) + '01', -1).slice(0, 8) + '01', fim = d.hoje.slice(0, 8) + '01';
    const gasto = d.despesas.filter(x => x.canal === 'Google Ads' && x.data >= ini && x.data < fim).reduce((t, x) => t + (Number(x.valor) || 0), 0);
    if (!gasto) return null; // campanha não rodou no mês passado
    if (gasto < verba * 0.7) return { nivel: 'dica', msg: `O mês passado usou ${monBrl(gasto)} de ${monBrl(verba)} planejados no Google.`, acao: 'Se o saldo acabou no meio do mês, ative a recarga automática; se sobrou verba, inclua palavras-chave de frase com mais volume ou amplie os horários.' };
    if (gasto > verba * 1.15) return { nivel: 'warn', msg: `O mês passado gastou ${monBrl(gasto)}, acima da verba de ${monBrl(verba)}.`, acao: 'Ajuste o orçamento diário no Google Ads (verba ÷ 22 dias úteis).' };
    return null;
  } },
  { id: 'cac', freq: 'mensal', titulo: 'Custo por cliente dentro do limite', avaliar(d) {
    const desde = monSomaDias(d.hoje, -30), max = Number(d.traf && d.traf.cac_maximo) || 0;
    const gasto = d.despesas.filter(x => x.canal === 'Google Ads' && x.data >= desde).reduce((t, x) => t + (Number(x.valor) || 0), 0);
    const fech = d.leads.filter(l => monGoogle(l) && l.status === 'fechado' && monDia(l.created_at) >= monSomaDias(d.hoje, -45)).length;
    if (gasto < 100) return null;
    if (!fech) return { nivel: 'crit', msg: `${monBrl(gasto)} investidos no Google em 30 dias e nenhum cliente fechado.`, acao: 'Antes de colocar mais verba: confira os termos de pesquisa, a velocidade de resposta e o orçamento enviado. Se não melhorar em 2 semanas, pause e revise a oferta.' };
    const cac = gasto / fech;
    if (max && cac > max) return { nivel: 'warn', msg: `Custo por cliente do Google: ${monBrl(cac)} (máximo definido: ${monBrl(max)}).`, acao: 'Corte palavras que gastam sem pedido e reforce as que fecham (veja a aba Google Ads).' };
    if (max && cac < max * 0.5 && fech >= 3) return { nivel: 'dica', msg: `Custo por cliente do Google em ${monBrl(cac)}, bem abaixo do máximo de ${monBrl(max)}.`, acao: 'Hora de crescer: aumente o orçamento diário em 20% e acompanhe por 2 semanas.' };
    return null;
  } },
  { id: 'conversoes_offline', freq: 'mensal', titulo: 'Google sabe quem virou cliente', avaliar(d) {
    const desde = monSomaDias(d.hoje, -35), n = d.leads.filter(l => l.gclid && l.status === 'fechado' && monDia(l.created_at) >= desde).length;
    return n ? { nivel: 'dica', msg: `${n} cliente(s) fechado(s) vindos de anúncio (com gclid) no último mês.`, acao: 'Tráfego pago › 5. Conversões offline: baixe o arquivo e envie no Google Ads. Assim ele procura mais gente parecida com quem paga.' } : null;
  } },
  { id: 'remarketing', freq: 'mensal', titulo: 'Reimpactar quem visitou e não chamou', avaliar(d) {
    const desde = monSomaDias(d.hoje, -30), vis = monSessoes(d.eventos, e => e.tipo === 'visita' && monDia(e.created_at) >= desde);
    if (vis < 300) return null;
    return { nivel: 'dica', msg: `${vis} visitantes do Google em 30 dias: já dá para fazer remarketing.`, acao: 'Ative a campanha "Remarketing | Display" (Campanhas prontas) com R$ 5/dia para quem visitou e não pediu orçamento.' };
  } }
];
// freqs: quais frequências avaliar (ex.: ['diaria'] no e-mail diário); desligadas: ids que o dono desligou
function monitorAvaliar(d, freqs, desligadas) {
  const off = new Set(desligadas || []);
  return MON_REGRAS.filter(r => (!freqs || freqs.includes(r.freq))).map(r => {
    let res = null, erro = null;
    if (!off.has(r.id)) { try { res = r.avaliar(d); } catch (e) { erro = String(e && e.message || e); } }
    return { id: r.id, freq: r.freq, titulo: r.titulo, ligada: !off.has(r.id), res, erro };
  });
}
// </monitor-ads>
async function monitorTrafego(leads: any[], despesas: any[], freqs: string[]) {
  const aj = async (k: string) => (await db.from('ajustes').select('valor').eq('chave', k).maybeSingle()).data?.valor || {};
  const [gads, traf, rast, cfg] = await Promise.all([aj('gads'), aj('trafego'), aj('rastreamento'), aj('monitor_ads')]);
  if (cfg.email === false) return [];
  let eventos: any[] = [];
  const desde = new Date(Date.now() - 35 * 86400e3).toISOString();
  for (let de = 0; de < 30000; de += 1000) {
    const { data } = await db.from('eventos').select('tipo,sessao,utm_term,dispositivo,created_at').eq('utm_source', 'google').gte('created_at', desde).range(de, de + 999);
    eventos = eventos.concat(data || []); if (!data || data.length < 1000) break;
  }
  return monitorAvaliar({ hoje: diaSP(), agora: Date.now(), leads, despesas, eventos, gads, traf, rast }, freqs, cfg.desligadas).filter((r: any) => r.res);
}
const secaoMonitor = (lista: any[], titulo: string) => !lista.length ? '' : `<h3 style="font-size:15px;margin:22px 0 6px">${titulo}</h3>` +
  [...lista].sort((a, b) => ({ crit: 0, warn: 1, dica: 2 } as any)[a.res.nivel] - ({ crit: 0, warn: 1, dica: 2 } as any)[b.res.nivel]).map(r =>
    `<div style="padding:8px 10px;margin:6px 0;border-left:4px solid ${r.res.nivel === 'crit' ? '#c0392b' : r.res.nivel === 'warn' ? '#e3a82b' : '#2a6fdb'};background:#fafafa;border-radius:4px;font-size:13px">
      <b>${r.res.nivel === 'crit' ? '⚠ ' : r.res.nivel === 'warn' ? '● ' : 'ℹ '}${esc(r.titulo)}</b><br>${esc(r.res.msg)}<br><span style="color:#555">👉 ${esc(r.res.acao)}</span></div>`).join('');

async function diario() {
  const { calculos, leads, prospects, despesas, nomeCli } = await tudo(), hoje = diaSP(), amanha = somaDias(hoje, 1);
  const diaUm = hoje.slice(8, 10) === '01';
  const mon = await monitorTrafego(leads, despesas, diaUm ? ['diaria', 'mensal'] : ['diaria']).catch(e => { console.error('monitor', e); return []; });
  const abertos = calculos.filter((c: any) => c.status !== 'entregue');
  const linhaCalc = (c: any) => [esc(c.numero_processo || '—'), esc(nomeCli(c.cliente_id)), esc(c.tipo || '—'), br(c.prazo_entrega)];
  const vHoje = abertos.filter((c: any) => c.prazo_entrega === hoje), vAmanha = abertos.filter((c: any) => c.prazo_entrega === amanha);
  const atrasados = abertos.filter((c: any) => c.prazo_entrega && c.prazo_entrega < hoje);
  const parados = abertos.filter((c: any) => c.status === 'recebido' && c.data_entrada && c.data_entrada <= somaDias(hoje, -2));
  const semResp = leads.filter((l: any) => l.status === 'novo' && !l.respondido_em);
  const retornos = leads.filter((l: any) => !['fechado', 'perdido'].includes(l.status) && l.proximo_contato && l.proximo_contato <= hoje);
  const follow = prospects.filter((p: any) => p.status === 'contatado' && p.proximo_contato && p.proximo_contato <= hoje && (p.tentativas || 0) < 3);
  const receber = calculos.filter((c: any) => c.status === 'entregue' && !c.pago && c.data_entrega && c.data_entrega <= somaDias(hoje, -7));
  const total = vHoje.length + vAmanha.length + atrasados.length + parados.length + semResp.length + retornos.length + follow.length + receber.length + mon.length;
  const corpo = `<table style="width:100%;border-spacing:6px;margin:12px 0"><tr>${caixa('Vencem hoje', String(vHoje.length), vHoje.length ? '#c0392b' : '#0b1a3d')}${caixa('Amanhã', String(vAmanha.length))}${caixa('Atrasados', String(atrasados.length), atrasados.length ? '#c0392b' : '#0b1a3d')}${caixa('Leads sem resposta', String(semResp.length), semResp.length ? '#c0392b' : '#0b1a3d')}</tr></table>
    ${tabela('🔴 Atrasados', ['Processo', 'Cliente', 'Tipo', 'Prazo'], atrasados.map(linhaCalc))}
    ${tabela('⏰ Vencem hoje', ['Processo', 'Cliente', 'Tipo', 'Prazo'], vHoje.map(linhaCalc))}
    ${tabela('📅 Vencem amanhã', ['Processo', 'Cliente', 'Tipo', 'Prazo'], vAmanha.map(linhaCalc))}
    ${tabela('⏸ Parados (recebidos há 2+ dias e não iniciados)', ['Processo', 'Cliente', 'Tipo', 'Prazo'], parados.map(linhaCalc))}
    ${tabela('💬 Leads sem resposta', ['Nome', 'WhatsApp', 'Pedido', 'Desde'], semResp.map((l: any) => [esc(l.nome || '—'), esc(l.whatsapp || '—'), esc(l.tipo || '—'), br(l.created_at)]))}
    ${tabela('📞 Retornos agendados (leads)', ['Nome', 'Status', 'Retorno'], retornos.map((l: any) => [esc(l.nome || '—'), esc(l.status), br(l.proximo_contato)]))}
    ${tabela('🎯 Follow-ups da prospecção', ['Contato', 'Tentativas', 'Retorno'], follow.map((p: any) => [esc(p.nome), String(p.tentativas || 0), br(p.proximo_contato)]))}
    ${tabela('💰 A receber há mais de 7 dias', ['Processo', 'Cliente', 'Entregue', 'Valor'], receber.map((c: any) => [esc(c.numero_processo || '—'), esc(nomeCli(c.cliente_id)), br(c.data_entrega), brl(c.valor_cobrado)]))}
    ${secaoMonitor(mon.filter((r: any) => r.freq === 'diaria'), '📈 Tráfego pago: avisos de hoje')}
    ${secaoMonitor(mon.filter((r: any) => r.freq === 'mensal'), '📊 Tráfego pago: revisão do mês')}
    ${total ? '' : '<p style="margin:16px 0">Nada pendente para hoje. 🎉</p>'}`;
  return { total, assunto: `${vHoje.length + atrasados.length ? '🔴 ' : ''}Agenda de hoje: ${vHoje.length} prazo(s) hoje, ${vAmanha.length} amanhã, ${atrasados.length} atrasado(s)`, html: molde('Agenda do dia', br(hoje), corpo) };
}

async function semanal() {
  const { calculos, leads, despesas, nomeCli } = await tudo(), hoje = diaSP(), ini = somaDias(hoje, -7), fimProx = somaDias(hoje, 7);
  const mon = await monitorTrafego(leads, despesas, ['semanal']).catch(e => { console.error('monitor', e); return []; });
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
    ${tabela('📅 Prazos dos próximos 7 dias', ['Prazo', 'Processo', 'Cliente', 'Status'], prox.map((c: any) => [br(c.prazo_entrega), esc(c.numero_processo || '—'), esc(nomeCli(c.cliente_id)), esc(c.status)]), 'Nenhum prazo na próxima semana.')}
    ${secaoMonitor(mon, '📈 Tráfego pago: melhorias da semana')}`;
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
