// @ts-nocheck
// Supabase Edge Function: whatsapp-webhook
// Recebe as mensagens do WhatsApp, grava no painel e responde com o robô de atendimento.
// Funciona com DOIS provedores (o que estiver configurado nos Secrets):
//   • Evolution API (WhatsApp Web no seu servidor): EVOLUTION_URL, EVOLUTION_KEY, EVOLUTION_INSTANCIA (padrão "pontes"),
//     EVOLUTION_WEBHOOK_KEY (senha que vai na URL do webhook: ...whatsapp-webhook?k=SENHA)
//   • API oficial da Meta: os secrets abaixo
// (ligado/desligado e textos em Painel > WhatsApp > Atendimento automático).
// IMPORTANTE: ao criar a função, DESLIGUE "Enforce JWT verification" (a Meta não envia login).
//
// Secrets necessários (Edge Functions > Secrets):
//   WA_VERIFY_TOKEN  -> uma senha inventada por você; a mesma vai no painel da Meta
//   WA_APP_SECRET    -> App secret do app na Meta (Configurações do app > Básico)
//   WA_TOKEN         -> token permanente do usuário do sistema (Business Manager)
//   WA_PHONE_NUMBER_ID -> ID do número (para o robô responder)
//   WA_GRAPH_VERSION -> opcional, ex.: v23.0
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.

import { createClient } from 'npm:@supabase/supabase-js@2';

const GRAPH = `https://graph.facebook.com/${Deno.env.get('WA_GRAPH_VERSION') || 'v23.0'}`;
const TOKEN = Deno.env.get('WA_TOKEN') || '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const EVO_URL = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_KEY') || '';
const EVO_INST = Deno.env.get('EVOLUTION_INSTANCIA') || 'pontes';
const usaEvolution = () => !!(EVO_URL && EVO_KEY);
const evo = (caminho: string, corpo?: unknown) => fetch(`${EVO_URL}${caminho}`, {
  method: corpo === undefined ? 'GET' : 'POST', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
  body: corpo === undefined ? undefined : JSON.stringify(corpo)
});

const digitos = (s: string) => String(s || '').replace(/\D/g, '');

// <robo> ===== Atendimento automático do WhatsApp (robô de menu) =====
// Fonte única: site/painel/robo.js. O webhook do Supabase recebe uma cópia
// (rode: node scripts/sincronizar-robo.mjs). Não edite a cópia no webhook.

const ROBO_TEXTOS = {
  boas_vindas: 'Olá, {nome}! 👋 Aqui é a *Pontes Ferreira Cálculos Judiciais*.\nFazemos cálculos trabalhistas no PJe-Calc a partir de R$ 250, com entrega em até 48h.',
  menu: 'Como posso ajudar? Responda com o número:\n\n1️⃣ Pedir orçamento de cálculo\n2️⃣ Preços e prazos\n3️⃣ Acompanhar um cálculo\n4️⃣ Falar com a equipe',
  orcamento: 'Ótimo! Envie aqui o *PDF integral do processo* (baixado do PJe) ou só o *número do processo*, que a gente puxa os autos. 📄\n\nSe houver prazo correndo, me diga a data.',
  recebido: 'Recebido ✅ Já vamos analisar e em até 1 hora útil você recebe o orçamento aqui mesmo.',
  recebido_fora: 'Recebido ✅ Nosso horário é {horario}. Assim que abrirmos, enviamos o orçamento aqui mesmo.',
  precos: '💰 *Preços*\n• Cálculo de 1 autor: a partir de R$ 250\n• Mais de um autor ou caso complexo: sob consulta\n• Entrega: até 48h (urgente: consulte)\n\nVocê recebe o arquivo .PJC, o relatório em PDF e o resumo do que foi deferido.\n\nDigite *1* para enviar o processo ou *4* para falar com a equipe.',
  atendente: 'Certo! Um especialista da equipe vai te responder em instantes. 🙂',
  atendente_fora: 'Certo! Nosso horário é {horario}. Assim que abrirmos, um especialista te responde aqui. Se quiser adiantar, já pode enviar o PDF ou o número do processo.',
  nao_entendi: 'Não entendi 😅 Responda só com o número da opção:',
  aguardando: 'Anotado! Agora é só enviar o *PDF do processo* ou o *número do processo* (ex.: 0001234-56.2024.5.01.0001).',
  arquivo_nao_pdf: 'Recebi o arquivo! Para o orçamento, o ideal é o *PDF integral do processo* ou o *número do processo*.',
  sem_calculo: 'Não encontrei cálculo em andamento para este número. Digite *4* para falar com a equipe.'
};
const ROBO_PADRAO = {
  ativo: false, dias: 'seg-sex', inicio: '08:00', fim: '19:00', sabado_inicio: '', sabado_fim: '',
  pausa_horas: 12, responder_clientes: false, textos: {}
};
const ROBO_STATUS = { recebido: 'Recebido', andamento: 'Em andamento', revisao: 'Em revisão', entregue: 'Entregue' };

function roboNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function roboCnj(s) {
  const m = String(s || '').match(/\d{7}\s*-?\s*\d{2}\s*\.?\s*\d{4}\s*\.?\s*\d\s*\.?\s*\d{2}\s*\.?\s*\d{4}/);
  if (!m) return null;
  const d = m[0].replace(/\D/g, '');
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}
function roboHorarioTexto(cfg) {
  const c = { ...ROBO_PADRAO, ...(cfg || {}) };
  const h = t => String(t || '').replace(/^0/, '').replace(':00', 'h').replace(':', 'h');
  let s = `${c.dias === 'seg-sab' ? 'seg a sáb' : 'seg a sex'}, das ${h(c.inicio)} às ${h(c.fim)}`;
  if (c.dias !== 'seg-sab' && c.sabado_inicio && c.sabado_fim) s += ` e sáb, das ${h(c.sabado_inicio)} às ${h(c.sabado_fim)}`;
  return s;
}
// agora: { diaSemana: 0=dom..6=sáb, hhmm: 'HH:MM' } no fuso de São Paulo
function roboForaDoHorario(cfg, agora) {
  const c = { ...ROBO_PADRAO, ...(cfg || {}) }, d = agora.diaSemana, t = agora.hhmm;
  if (d >= 1 && d <= 5) return !(t >= c.inicio && t < c.fim);
  if (d === 6) {
    if (c.dias === 'seg-sab') return !(t >= c.inicio && t < c.fim);
    if (c.sabado_inicio && c.sabado_fim) return !(t >= c.sabado_inicio && t < c.sabado_fim);
  }
  return true;
}
function roboAgoraSP(data) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(data || new Date());
  const v = k => (p.find(x => x.type === k) || {}).value;
  return { diaSemana: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday')), hhmm: `${String(v('hour')).replace('24', '00')}:${v('minute')}` };
}
function roboOpcao(t) {
  const n = roboNorm(t);
  const m = n.match(/^([1-4])(?:\D{0,12})$/); // "1", "1.", "1️⃣", "opção 1"…
  if (m) return m[1];
  const o = n.match(/^opcao\s*([1-4])$/); if (o) return o[1];
  if (/atendente|humano|pessoa|falar com|ligar|ligacao|especialista|equipe/.test(n)) return '4';
  if (/acompanh|andamento|status|ficou pronto|meu calculo|entrega do calculo/.test(n)) return '3';
  if (/preco|valor|quanto custa|quanto fica|tabela|prazo de entrega/.test(n)) return '2';
  if (/orcamento|calculo|processo|liquidacao|impugnacao|pje|pjc/.test(n)) return '1';
  return null;
}

/* Decide as respostas do robô para UMA mensagem recebida.
   e = { etapa, tipo: 'text'|'document'|'image'|'audio', texto, ehPdf, nome, cfg, foraHorario, calculos: [{numero_processo,status,prazo_entrega}] }
   retorna { respostas: [texto], etapa, humano: bool, numero: 'CNJ'|null } */
function roboDecidir(e) {
  const cfg = { ...ROBO_PADRAO, ...(e.cfg || {}) };
  const T = { ...ROBO_TEXTOS, ...(cfg.textos || {}) };
  const nome = String(e.nome || '').trim().split(/\s+/).filter(p => !/^dra?\.?$/i.test(p))[0] || '';
  const fmt = s => String(s).replace(/,\s*\{nome\}/g, nome ? `, ${nome}` : '').replace(/\{nome\}/g, nome).replace(/\{horario\}/g, roboHorarioTexto(cfg));
  const out = (respostas, etapa, extra) => ({ respostas: respostas.map(fmt), etapa, humano: false, numero: null, ...(extra || {}) });
  const humano = (txt, extra) => out([txt], 'humano', { humano: true, ...(extra || {}) });
  const etapa = e.etapa || null, fora = !!e.foraHorario;
  const numero = roboCnj(e.texto);

  // processo chegou (PDF ou número): confirma e passa para a equipe
  if (e.ehPdf || numero) return humano(fora ? T.recebido_fora : T.recebido, { numero });

  // outros arquivos (imagem, áudio, documento que não é PDF)
  if (e.tipo && e.tipo !== 'text') {
    if (etapa === 'aguardando_processo2' || etapa === 'menu2') return humano(fora ? T.atendente_fora : T.atendente);
    return out([T.arquivo_nao_pdf], etapa === 'aguardando_processo' ? 'aguardando_processo2' : 'aguardando_processo');
  }

  const op = roboOpcao(e.texto);
  const primeira = !etapa;
  const abrir = primeira ? [T.boas_vindas] : [];

  if (op === '1') return out([...abrir, T.orcamento], 'aguardando_processo');
  if (op === '2') return out([...abrir, T.precos], 'menu');
  if (op === '3') {
    const abertos = (e.calculos || []).filter(c => c.status !== 'entregue');
    if (!abertos.length) return out([...abrir, T.sem_calculo], 'menu');
    const dt = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : 'a definir';
    return out([...abrir, '📋 *Seus cálculos em andamento:*\n' + abertos.map(c => `• ${c.numero_processo || 'Processo'}: ${ROBO_STATUS[c.status] || c.status} · entrega até ${dt(c.prazo_entrega)}`).join('\n') + '\n\nDigite *4* se precisar falar com a equipe.'], 'menu');
  }
  if (op === '4') return out([...abrir, fora ? T.atendente_fora : T.atendente], 'humano', { humano: true });

  if (primeira) return out([T.boas_vindas, T.menu], 'menu');
  if (etapa === 'aguardando_processo') return out([T.aguardando], 'aguardando_processo2');
  if (etapa === 'aguardando_processo2' || etapa === 'menu2') return humano(fora ? T.atendente_fora : T.atendente);
  return out([`${T.nao_entendi}\n\n${T.menu}`], 'menu2');
}
// </robo>

/* ---------- robô: envio e decisão ---------- */
let CFG_ROBO: any = null;
async function cfgRobo() {
  if (CFG_ROBO) return CFG_ROBO;
  const { data } = await db.from('ajustes').select('valor').eq('chave', 'atendimento').maybeSingle();
  return (CFG_ROBO = { ...ROBO_PADRAO, ...(data?.valor || {}) });
}
async function enviarTextoRobo(waId: string, texto: string) {
  const r = usaEvolution()
    ? await evo(`/message/sendText/${EVO_INST}`, { number: waId, text: texto })
    : await fetch(`${GRAPH}/${Deno.env.get('WA_PHONE_NUMBER_ID')}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: waId, type: 'text', text: { body: texto, preview_url: false } })
    });
  const out = await r.json().catch(() => ({}));
  await db.from('wa_mensagens').insert({
    wa_id: waId, direcao: 'out', tipo: 'text', texto, bot: true, wamid: out.messages?.[0]?.id || out.key?.id || null,
    status: r.ok ? 'sent' : 'failed', erro: r.ok ? null : (out?.error?.message || 'falha')
  });
  if (!r.ok) throw new Error(out?.error?.message || 'falha ao enviar');
}
async function atendimentoAutomatico(conv: any, m: any, tipo: string, texto: string, arquivo_nome: string | null) {
  const cfg = await cfgRobo();
  if (!cfg.ativo || !(Deno.env.get('WA_PHONE_NUMBER_ID') || usaEvolution())) return;
  if (!['text', 'document', 'image', 'audio'].includes(tipo)) return;
  if (Date.now() - Number(m.timestamp) * 1000 > 10 * 60e3) return;           // mensagem antiga reenviada pela Meta
  if (conv.humano_ate && new Date(conv.humano_ate).getTime() > Date.now()) return; // equipe atendendo
  if (conv.cliente_id && !cfg.responder_clientes) return;
  // a conversa recomeça do menu depois de 12h parada
  const parada = !conv.bot_atualizado_em || Date.now() - new Date(conv.bot_atualizado_em).getTime() > 12 * 3600e3;
  const etapa = parada || conv.bot_etapa === 'humano' ? null : conv.bot_etapa;

  let calculos: any[] = [];
  if (roboOpcao(texto) === '3') {
    let cliId = conv.cliente_id;
    if (!cliId) {
      const { data: clis } = await db.from('clientes').select('id,whatsapp');
      cliId = (clis || []).find((c: any) => ultimos9(c.whatsapp) === ultimos9(conv.wa_id))?.id;
    }
    if (cliId) calculos = (await db.from('calculos').select('numero_processo,status,prazo_entrega').eq('cliente_id', cliId)).data || [];
    if (conv.lead_id) calculos = calculos.concat((await db.from('calculos').select('numero_processo,status,prazo_entrega').eq('lead_id', conv.lead_id)).data || []);
  }
  const r = roboDecidir({
    etapa, tipo, texto, ehPdf: tipo === 'document' && /\.pdf$/i.test(arquivo_nome || ''), nome: conv.nome,
    cfg, foraHorario: roboForaDoHorario(cfg, roboAgoraSP()), calculos
  });
  for (const txt of r.respostas) await enviarTextoRobo(conv.wa_id, txt);
  const agora = new Date().toISOString();
  await db.from('wa_conversas').update({
    bot_etapa: r.etapa, bot_atualizado_em: agora, humano_ate: r.humano ? new Date(Date.now() + (Number(cfg.pausa_horas) || 12) * 3600e3).toISOString() : null,
    ultima_msg: ('🤖 ' + (r.respostas[r.respostas.length - 1] || '')).slice(0, 200), ultima_msg_em: agora
  }).eq('wa_id', conv.wa_id);
  if (conv.lead_id) {
    const patch: any = { ultimo_contato: agora };
    if (r.numero) patch.numero_processo = r.numero;
    await db.from('leads').update(patch).eq('id', conv.lead_id);
    if (r.numero) await db.from('leads').update({ modo: 'numero' }).eq('id', conv.lead_id).is('arquivo_path', null);
  }
}
const ultimos9 = (s: string) => digitos(s).slice(-9);

async function assinaturaValida(req: Request, corpo: string) {
  const segredo = Deno.env.get('WA_APP_SECRET');
  if (!segredo) return true; // sem segredo configurado, aceita (não recomendado)
  const recebida = (req.headers.get('x-hub-signature-256') || '').replace('sha256=', '');
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assin = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo));
  const hex = [...new Uint8Array(assin)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.length === recebida.length && hex === recebida;
}

// Baixa mídia do WhatsApp e guarda no Storage (bucket "processos")
async function guardarMidia(mediaId: string, waId: string, nome: string) {
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then(r => r.json());
  if (!meta.url) throw new Error('mídia sem URL');
  const arq = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const bytes = new Uint8Array(await arq.arrayBuffer());
  const limpo = nome.replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `whatsapp/${waId}/${Date.now()}-${limpo}`;
  const { error } = await db.storage.from('processos').upload(path, bytes, { contentType: meta.mime_type || 'application/octet-stream' });
  if (error) throw error;
  return path;
}

// anúncio de clique para WhatsApp (Meta) manda "referral" na primeira mensagem
function origemAnuncio(ref: any) {
  if (!ref) return { origem: 'WhatsApp direto' };
  return {
    origem: 'Meta Ads', utm_source: 'meta', utm_medium: 'ctwa',
    // mesmo nome da campanha no painel (Tráfego pago > Campanhas prontas); o anúncio vai em utm_content
    utm_campaign: 'meta_topo_reels',
    utm_content: (ref.headline || ref.source_id || '').toString().slice(0, 120) || null, fbclid: ref.ctwa_clid || null
  };
}

async function conversaDe(waId: string, nomePerfil: string, referral?: any, criarLead = true) {
  const { data: existente } = await db.from('wa_conversas').select('*').eq('wa_id', waId).maybeSingle();
  if (existente) return existente;

  // liga ao cliente ou lead que já tem esse telefone; se não houver, cria um lead novo (CRM)
  const fim = ultimos9(waId);
  const { data: clientes } = await db.from('clientes').select('id,nome,whatsapp');
  const cliente = (clientes || []).find(c => ultimos9(c.whatsapp) === fim);
  const { data: leads } = await db.from('leads').select('id,whatsapp,status,created_at').order('created_at', { ascending: false }).limit(2000);
  let lead = (leads || []).find(l => ultimos9(l.whatsapp) === fim);
  if (!lead && !cliente && criarLead) {
    const { data } = await db.from('leads').insert({ nome: nomePerfil || waId, whatsapp: waId, modo: 'whatsapp', status: 'novo', ...origemAnuncio(referral) }).select().single();
    lead = data;
  }
  const { data: nova, error } = await db.from('wa_conversas').insert({
    wa_id: waId, nome: cliente?.nome || nomePerfil || waId, lead_id: lead?.id || null, cliente_id: cliente?.id || null
  }).select().single();
  if (error) throw error;
  return nova;
}

async function processarMensagem(m: any, contatos: any[]) {
  const waId = digitos(m.from);
  const nome = contatos?.find((c: any) => digitos(c.wa_id) === waId)?.profile?.name || '';
  const conv = await conversaDe(waId, nome, m.referral);

  let tipo = 'outro', texto = '', arquivo_path: string | null = null, arquivo_nome: string | null = null;
  try {
    if (m.type === 'text') { tipo = 'text'; texto = m.text?.body || ''; }
    else if (m.type === 'document') {
      tipo = 'document'; arquivo_nome = m.document.filename || 'documento'; texto = m.document.caption || '';
      arquivo_path = await guardarMidia(m.document.id, waId, arquivo_nome!);
    } else if (m.type === 'image') {
      tipo = 'image'; arquivo_nome = 'imagem.jpg'; texto = m.image.caption || '';
      arquivo_path = await guardarMidia(m.image.id, waId, arquivo_nome);
    } else if (m.type === 'audio') {
      tipo = 'audio'; arquivo_nome = 'audio.ogg';
      arquivo_path = await guardarMidia(m.audio.id, waId, arquivo_nome);
    } else if (m.type === 'button') { tipo = 'text'; texto = m.button?.text || ''; }
    else if (m.type === 'interactive') { tipo = 'text'; texto = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''; }
    else { texto = `[${m.type}]`; }
  } catch (e) { texto = (texto ? texto + ' ' : '') + `[falha ao baixar arquivo: ${(e as Error).message}]`; }

  await gravarEntrada(conv, waId, nome, m, { tipo, texto, arquivo_path, arquivo_nome, wamid: m.id, ts: Number(m.timestamp) * 1000 });
}
// grava a mensagem recebida, atualiza conversa e lead, e chama o robô (Meta e Evolution)
async function gravarEntrada(conv: any, waId: string, nome: string, m: any, x: any) {
  const { tipo, texto, arquivo_path, arquivo_nome } = x;
  const { error } = await db.from('wa_mensagens').insert({
    wa_id: waId, direcao: 'in', tipo, texto, arquivo_path, arquivo_nome, wamid: x.wamid, status: 'received',
    created_at: new Date(x.ts || Date.now()).toISOString()
  });
  if (error) { if (String(error.message).includes('duplicate')) return; throw error; } // repetida: não processa de novo

  const resumo = tipo === 'text' ? texto : `📎 ${arquivo_nome || tipo}${texto ? ' · ' + texto : ''}`;
  await db.from('wa_conversas').update({
    ultima_msg: resumo.slice(0, 200), ultima_msg_em: new Date().toISOString(), ultima_entrada_em: new Date().toISOString(),
    nao_lidas: (conv.nao_lidas || 0) + 1, nome: conv.nome || nome
  }).eq('wa_id', waId);

  // PDF recebido vira o processo do lead (se o lead ainda não tiver um)
  if (conv.lead_id && arquivo_path && /\.pdf$/i.test(arquivo_nome || '')) {
    await db.from('leads').update({ arquivo_path }).eq('id', conv.lead_id).is('arquivo_path', null);
  }
  if (conv.lead_id) await db.from('leads').update({ ultimo_contato: new Date().toISOString() }).eq('id', conv.lead_id);

  try { await atendimentoAutomatico(conv, m, tipo, texto, arquivo_nome); } catch (e) { console.error('robô', e); }
}

// Mensagem enviada por você no app WhatsApp Business do celular: grava no painel e cala o robô nessa conversa
async function registrarEcoDoApp(m: any) {
  const waId = digitos(m.to);
  if (!waId) return;
  await gravarSaidaDoCelular(waId, m.text?.body || (m.type ? `[${m.type} enviado pelo celular]` : ''), m.type === 'text' ? 'text' : 'outro', m.id, Number(m.timestamp || Date.now() / 1000) * 1000);
}
async function gravarSaidaDoCelular(waId: string, texto: string, tipo: string, wamid: string, ts: number, criarLead = true) {
  const conv = await conversaDe(waId, '', null, criarLead);
  const { error } = await db.from('wa_mensagens').insert({
    wa_id: waId, direcao: 'out', tipo, texto, wamid, status: 'sent', created_at: new Date(ts || Date.now()).toISOString()
  });
  if (error) { if (String(error.message).includes('duplicate')) return; throw error; }
  const cfg = await cfgRobo();
  await db.from('wa_conversas').update({
    ultima_msg: String(texto).slice(0, 200), ultima_msg_em: new Date().toISOString(), nao_lidas: 0,
    humano_ate: new Date(Date.now() + (Number(cfg.pausa_horas) || 12) * 3600e3).toISOString(), bot_etapa: 'humano'
  }).eq('wa_id', waId);
  if (conv.lead_id) await db.from('leads').update({ ultimo_contato: new Date().toISOString() }).eq('id', conv.lead_id);
}

/* ---------- Evolution API ---------- */
// Regra do CRM (o número também é usado para assuntos pessoais):
//  • nunca importa histórico: mensagens com mais de 10 minutos são ignoradas;
//  • só entra no painel quem já está no CRM: conversa aberta, lead, cliente ou contato da prospecção.
//    Números desconhecidos ficam só no celular. Conversas novas você inicia pelo painel (ou cadastrando o lead).
async function contatoConhecido(waId: string) {
  const fim = ultimos9(waId);
  const { data: conv } = await db.from('wa_conversas').select('id').eq('wa_id', waId).maybeSingle();
  if (conv) return { tipo: 'conversa' };
  for (const [tabela, tipo] of [['leads', 'lead'], ['clientes', 'cliente'], ['prospects', 'prospect']] as const) {
    const { data } = await db.from(tabela).select('id,whatsapp' + (tabela === 'prospects' ? ',status' : '')).not('whatsapp', 'is', null).limit(5000);
    const achou = (data || []).find((x: any) => ultimos9(x.whatsapp) === fim);
    if (achou) return { tipo, registro: achou };
  }
  return null;
}
// número desconhecido com cara de cliente: entra no painel (e o robô pode atender)
const INTENCAO = /c[aá]lculo|calcul|or[cç]amento|processo|liquida[cç]|impugna|pje|pjc|senten[cç]a|ac[oó]rd[aã]o|perit|advoga|escrit[oó]rio|trabalhista|reclamante|reclamada|vim pelo site|pelo site|vi o an[uú]ncio|an[uú]ncio|pontes ferreira|quanto custa|valor do c|honor[aá]rio|tabela de pre/i;
function temIntencao(texto: string, tipo: string, arquivo_nome: string | null, m: any) {
  if (m?.message?.extendedTextMessage?.contextInfo?.externalAdReply || m?.contextInfo?.externalAdReply || m?.referral) return true; // veio de anúncio
  if (tipo === 'document' && /\.pdf$/i.test(arquivo_nome || '')) return true;
  if (roboCnj(texto)) return true;
  return INTENCAO.test(String(texto || ''));
}
async function prospectDoNumero(waId: string) {
  const fim = ultimos9(waId);
  const { data } = await db.from('prospects').select('id,nome,cidade,whatsapp').not('whatsapp', 'is', null).limit(5000);
  return (data || []).find((x: any) => ultimos9(x.whatsapp) === fim) || null;
}
async function prospectRespondeu(waId: string) {
  const fim = ultimos9(waId);
  const { data } = await db.from('prospects').select('id,whatsapp,status').in('status', ['a_contatar', 'contatado']).limit(5000);
  for (const p of (data || []).filter((x: any) => ultimos9(x.whatsapp) === fim))
    await db.from('prospects').update({ status: 'respondeu', proximo_contato: null }).eq('id', p.id);
}
// número do contato a partir do "jid" (ignora grupos, status e canais; resolve o formato @lid)
function numeroDoJid(k: any): string | null {
  let j = String(k.remoteJid || '');
  if (j.endsWith('@lid')) j = String(k.remoteJidAlt || k.senderPn || k.participantAlt || '');
  if (!j.endsWith('@s.whatsapp.net')) return null;
  return digitos(j.split('@')[0]) || null;
}
async function guardarBase64(b64: string, waId: string, nome: string, mime: string) {
  const bytes = Uint8Array.from(atob(b64.replace(/^data:[^,]+,/, '')), c => c.charCodeAt(0));
  const path = `whatsapp/${waId}/${Date.now()}-${nome.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
  const { error } = await db.storage.from('processos').upload(path, bytes, { contentType: mime || 'application/octet-stream' });
  if (error) throw error;
  return path;
}
async function processarEvolution(b: any) {
  const ev = String(b.event || '').toLowerCase().replace('_', '.');
  if (ev === 'connection.update') {
    await db.from('ajustes').upsert({ chave: 'whatsapp_status', publico: false, valor: { state: b.data?.state || null, numero: b.sender ? digitos(b.sender) : null, atualizado: new Date().toISOString() } });
    return;
  }
  if (ev !== 'messages.upsert') return;
  const d = b.data || {};
  const lista = Array.isArray(d) ? d : Array.isArray(d.messages) ? d.messages : [d];
  for (const m of lista) { try { await processarMsgEvolution(m); } catch (e) { console.error('evolution msg', e); } }
}
async function processarMsgEvolution(m: any) {
  const k = m.key || {}, waId = numeroDoJid(k);
  if (!waId) return;
  const msg = m.message || {};
  if (msg.reactionMessage || msg.protocolMessage || msg.senderKeyDistributionMessage && Object.keys(msg).length === 1) return;
  let tipo = 'outro', texto = '', arquivo_nome: string | null = null, mime = '';
  const doc = msg.documentMessage || msg.documentWithCaptionMessage?.message?.documentMessage;
  if (msg.conversation || msg.extendedTextMessage) { tipo = 'text'; texto = msg.conversation || msg.extendedTextMessage?.text || ''; }
  else if (doc) { tipo = 'document'; arquivo_nome = doc.fileName || 'documento.pdf'; texto = doc.caption || ''; mime = doc.mimetype || ''; }
  else if (msg.imageMessage) { tipo = 'image'; arquivo_nome = 'imagem.jpg'; texto = msg.imageMessage.caption || ''; mime = msg.imageMessage.mimetype || 'image/jpeg'; }
  else if (msg.audioMessage) { tipo = 'audio'; arquivo_nome = 'audio.ogg'; mime = msg.audioMessage.mimetype || 'audio/ogg'; }
  else if (msg.buttonsResponseMessage || msg.listResponseMessage || msg.templateButtonReplyMessage) { tipo = 'text'; texto = msg.buttonsResponseMessage?.selectedDisplayText || msg.listResponseMessage?.title || msg.templateButtonReplyMessage?.selectedDisplayText || ''; }
  else texto = `[${m.messageType || Object.keys(msg)[0] || 'mensagem'}]`;
  const ts = Number(m.messageTimestamp || Date.now() / 1000) * 1000;
  if (Date.now() - ts > 10 * 60e3) return;                 // histórico/antigas: não importa
  let conhecido = await contatoConhecido(waId);
  if (!conhecido) {
    // fora do CRM: só entra se for mensagem recebida com cara de cliente (amigos e família ficam só no celular)
    if (k.fromMe || !temIntencao(texto, tipo, arquivo_nome, m)) return;
    conhecido = { tipo: 'novo' };
  }

  if (k.fromMe) { // enviada por você (celular ou painel). Se veio do painel/robô, já está gravada pelo id.
    const { data: ja } = await db.from('wa_mensagens').select('id').eq('wamid', k.id).maybeSingle();
    if (!ja) await gravarSaidaDoCelular(waId, texto || (arquivo_nome ? `📎 ${arquivo_nome}` : ''), tipo === 'text' ? 'text' : 'outro', k.id, ts, conhecido.tipo !== 'prospect'); // abordagem de prospecção não vira lead
    return;
  }

  let arquivo_path: string | null = null;
  if (arquivo_nome) {
    try {
      let b64 = msg.base64 || m.base64 || '';
      if (!b64) { const r = await evo(`/chat/getBase64FromMediaMessage/${EVO_INST}`, { message: { key: k }, convertToMp4: false }); b64 = (await r.json().catch(() => ({}))).base64 || ''; }
      if (b64) arquivo_path = await guardarBase64(b64, waId, arquivo_nome, mime);
    } catch (e) { texto = (texto ? texto + ' ' : '') + `[falha ao baixar arquivo: ${(e as Error).message}]`; }
  }
  const nome = m.pushName || '';
  const conv = await conversaDe(waId, nome, null, false);
  // quem responde e ainda não é lead nem cliente vira lead (origem Prospecção, se veio da lista)
  if (!conv.lead_id && !conv.cliente_id) {
    const prosp = await prospectDoNumero(waId);
    const { data: lead } = await db.from('leads').insert({
      nome: prosp?.nome || nome || waId, whatsapp: waId, modo: 'whatsapp', status: 'novo',
      ...(prosp ? { origem: 'Prospecção', utm_source: 'prospeccao', utm_medium: 'whatsapp', utm_campaign: 'prospeccao_1a1', cidade: prosp.cidade || null }
        : /vim pelo site|pelo site/i.test(texto) ? { origem: 'Site orgânico', utm_source: 'site', utm_medium: 'whatsapp' }
        : /an[uú]ncio/i.test(texto) ? { origem: 'Meta Ads', utm_source: 'meta', utm_medium: 'ctwa', utm_campaign: 'meta_topo_reels' }
        : { origem: 'WhatsApp direto' }),
      numero_processo: roboCnj(texto) || null
    }).select().single();
    if (lead) { await db.from('wa_conversas').update({ lead_id: lead.id }).eq('id', conv.id); conv.lead_id = lead.id; if (prosp) await db.from('prospects').update({ lead_id: lead.id }).eq('id', prosp.id); }
  }
  await gravarEntrada(conv, waId, nome, { timestamp: ts / 1000 }, { tipo, texto, arquivo_path, arquivo_nome, wamid: k.id, ts });
  if (conhecido.tipo === 'prospect' || conhecido.tipo === 'conversa') await prospectRespondeu(waId);
}

Deno.serve(async req => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === Deno.env.get('WA_VERIFY_TOKEN'))
      return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('ok');

  const corpo = await req.text();
  // Evolution API: identificada pela senha na URL (?k=...)
  if (url.searchParams.has('k')) {
    if (!Deno.env.get('EVOLUTION_WEBHOOK_KEY') || url.searchParams.get('k') !== Deno.env.get('EVOLUTION_WEBHOOK_KEY')) return new Response('forbidden', { status: 403 });
    try { await processarEvolution(JSON.parse(corpo)); } catch (e) { console.error('evolution', e); }
    return new Response('ok', { status: 200 });
  }
  if (!(await assinaturaValida(req, corpo))) return new Response('assinatura inválida', { status: 401 });

  try {
    const json = JSON.parse(corpo);
    for (const entry of json.entry || []) for (const ch of entry.changes || []) {
      const v = ch.value || {};
      for (const m of v.messages || []) await processarMensagem(m, v.contacts || []);
      // coexistência: mensagens que você manda pelo app do celular (campo "smb_message_echoes")
      for (const m of v.message_echoes || []) await registrarEcoDoApp(m);
      for (const s of v.statuses || []) {
        await db.from('wa_mensagens').update({ status: s.status, erro: s.errors?.[0]?.title || null }).eq('wamid', s.id);
      }
    }
  } catch (e) { console.error(e); }
  return new Response('ok', { status: 200 }); // sempre 200 para a Meta não reenviar em loop
});
