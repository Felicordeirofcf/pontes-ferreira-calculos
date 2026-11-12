'use strict';
/* =====================================================================
   Painel Pontes Ferreira Cálculos Judiciais
   Leads → Orçamento → Cálculo (entrada/saída) → Pagamento → Analytics
   ===================================================================== */

const CFG = window.PF_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;
const sb = DEMO ? null : window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

const TIPOS = ['Liquidação de sentença', 'Impugnação aos cálculos (reclamante/perito)', 'Cálculo para petição inicial', 'Atualização de cálculo', 'Parecer técnico / assistente', 'Extração de fichas e ponto'];
const STATUS_CALC = { recebido: 'Recebido', andamento: 'Em andamento', revisao: 'Em revisão', entregue: 'Entregue' };
const STATUS_LEAD = { novo: 'Novo', orcamento: 'Orçamento enviado', fechado: 'Fechado', perdido: 'Perdido' };
const CANAIS = ['Google Ads', 'Meta Ads', 'Prospecção', 'Site orgânico', 'Indicação', 'WhatsApp direto', 'Instagram orgânico', 'Outros'];
const CANAIS_DESPESA = ['Google Ads', 'Meta Ads', 'Outros anúncios', 'Software', 'Outros'];
const CANAIS_ADS = ['Google Ads', 'Meta Ads', 'Outros anúncios'];
const PERIODOS = { mes: 'Este mês', '30': 'Últimos 30 dias', '90': 'Últimos 90 dias', ano: 'Este ano', tudo: 'Tudo' };
const MIN_RESPOSTA = 15; // minutos para responder um lead novo
const WA_PAINEL = () => DEMO || !!(window.PF_CONFIG || {}).WA_ATIVO; // false = atendimento manual pelo app do celular

const TABELAS = ['leads', 'calculos', 'clientes', 'despesas', 'atividades', 'wa_conversas', 'prospects'];
const S = {
  leads: [], calculos: [], clientes: [], despesas: [], atividades: [], wa_conversas: [], prospects: [], wa_mensagens: {},
  filtroProsp: { status: '', q: '' }, metricaMapa: localGet('pf_metrica_mapa') || 'visitas', ufMapa: null, mapa: null, buscaProsp: { termo: 'advogado trabalhista', cidade: '' },
  periodo: localGet('pf_periodo') || 'mes', filtroCalc: 'abertos', busca: '',
  vistaLeads: localGet('pf_vista') || 'funil', filtroLeads: { status: '', canal: '', temp: '', q: '' },
  conversa: null, buscaWa: '',
  ajustes: {}, abaTrafego: localGet('pf_aba_trafego') || 'ativacao', rascRast: {},
  utm: { source: 'instagram', medium: 'post', campaign: '', content: '', ancora: '' }
};
const TEMPERATURAS = { quente: '🔥 Quente', morno: '🌤 Morno', frio: '❄ Frio' };
const TIPOS_ATIV = { nota: '📝 Nota', ligacao: '📞 Ligação', whatsapp: '💬 WhatsApp', email: '✉ E-mail', reuniao: '🤝 Reunião', status: '🔄 Status' };
const RESPOSTAS_RAPIDAS = [ // [rótulo, chave em VARIACOES (mensagens.js)]
  ['Apresentação', '__apresentacao__'], ['Saudação', 'saudacao'], ['Nossos serviços', 'servicos'], ['Salvar nosso contato', 'salvar_contato'], ['Obrigado por salvar', 'obrigado_contato'], ['Pedir dados do cadastro', 'pedir_cadastro'], ['Pedir o processo', 'pedir_processo'], ['Orçamento', 'orcamento'],
  ['Vários autores', 'varios_autores'], ['Confirmação', 'confirmacao'], ['Entrega', 'entrega'], ['Cobrança', 'cobranca'], ['Follow-up', 'followup']
];
/* variações: sorteia uma versão diferente da última usada */
const SEP_VAR = /\n-{3,}\n/;
function listaVariacoes(chave) {
  const editadas = (S.ajustes.respostas || {})[chave];
  const l = (editadas ? String(editadas).split(SEP_VAR) : (VARIACOES[chave] || [])).map(x => x.trim()).filter(Boolean);
  return l.length ? l : [''];
}
function sortearVariacao(chave, n) {
  if (n <= 1) return 0;
  const ult = Number(localGet('pf_var_' + chave) ?? -1);
  let i = Math.floor(Math.random() * n); if (i === ult) i = (i + 1) % n;
  localSet('pf_var_' + chave, String(i)); return i;
}


/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0 = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = v => isFinite(v) ? (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%' : '—';
const isoLocal = d => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
const hoje = () => isoLocal(new Date());
const dia = ts => ts ? (ts.length <= 10 ? ts : isoLocal(ts)) : '';
const dataBR = s => s ? dia(s).split('-').reverse().join('/') : '—';
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
const difDias = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const digitos = s => String(s || '').replace(/\D/g, '');
const cnj = s => { const d = digitos(s); return d.length === 20 ? `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}` : (s || ''); };
const soma = (arr, f) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
// No computador abre o WhatsApp Web (sempre na mesma aba); no celular abre o app
const NO_CELULAR = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const waLink = (num, txt = '') => { let d = digitos(num); if (d.length <= 11) d = '55' + d; return NO_CELULAR ? `https://wa.me/${d}${txt ? '?text=' + encodeURIComponent(txt) : ''}` : `https://web.whatsapp.com/send?phone=${d}${txt ? '&text=' + encodeURIComponent(txt) : ''}`; };
const ALVO_WA = NO_CELULAR ? '_blank' : 'whatsapp-web';
// WhatsApp do próprio painel disponível? (Evolution conectada, API da Meta ligada ou demonstração)
const painelWaOk = () => WA_PAINEL() && (!EVOLUTION() || S.waEstado === 'open');
// botão de WhatsApp: abre a conversa DENTRO do painel (texto já escrito) ou, se o painel estiver sem WhatsApp, o WhatsApp Web
function waBotao(num, o = {}) {
  if (!num) return o.vazio ?? '';
  if (painelWaOk()) return `<button type="button" class="${o.classe || 'btn mini sec'}" data-wa-abrir="${esc(num)}" data-wa-nome="${esc(o.nome || '')}" data-wa-txt="${esc(o.texto || '')}" data-wa-lead-id="${esc(o.lead_id || '')}" data-wa-cliente-id="${esc(o.cliente_id || '')}" title="${esc(o.title || 'Abrir a conversa no painel')}">${o.rotulo}</button>`;
  return `<a class="${o.classe || 'btn mini sec'}" href="${esc(waLink(num, o.texto || ''))}" target="${ALVO_WA}" rel="noopener" title="${esc(o.title || 'Abrir no WhatsApp Web')}" onclick="event.stopPropagation()">${o.rotulo}</a>`;
}
function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch { } }
const cliente = id => S.clientes.find(c => c.id === id);
const minutosDesde = ts => (Date.now() - new Date(ts).getTime()) / 6e4;

function toast(msg) {
  const d = document.createElement('div'); d.textContent = msg; $('#toast').appendChild(d);
  setTimeout(() => d.remove(), 4500);
}

function inicioPeriodo(p = S.periodo) {
  const d = new Date();
  if (p === 'mes') return isoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
  if (p === '30') { d.setDate(d.getDate() - 29); return isoLocal(d); }
  if (p === '90') { d.setDate(d.getDate() - 89); return isoLocal(d); }
  if (p === 'ano') return `${d.getFullYear()}-01-01`;
  return '0000-01-01';
}
const noPeriodo = (data, ini = inicioPeriodo()) => !!data && dia(data) >= ini;

function canalLead(l) {
  const o = (l.origem || '').toLowerCase(), u = (l.utm_source || '').toLowerCase();
  if (CANAIS.includes(l.origem)) return l.origem;
  if (/prospec/.test(u)) return 'Prospecção';
  const med = (l.utm_medium || '').toLowerCase();
  if (!l.gclid && !l.fbclid && /organico|seo|bio|post|story|grupo|assinatura/.test(med)) return /instagram|\big\b/.test(u) ? 'Instagram orgânico' : /indicacao/.test(u) ? 'Indicação' : 'Site orgânico';
  if (l.gclid || /google|gads|adwords/.test(u + ' ' + o)) return 'Google Ads';
  if (l.fbclid || /meta|facebook|instagram|\bfb\b|\big\b/.test(u + ' ' + o)) return 'Meta Ads';
  if (!o || o === 'organico' || o === 'site') return 'Site orgânico';
  return 'Outros';
}
const atrasado = c => c.status !== 'entregue' && c.prazo_entrega && c.prazo_entrega < hoje();

/* ---------------- dados (Supabase ou demonstração) ---------------- */
const L = {
  get(t) { try { return JSON.parse(localGet('pf_' + t)) || []; } catch { return []; } },
  set(t, v) { localSet('pf_' + t, JSON.stringify(v)); }
};
const db = {
  async list(t) {
    if (DEMO) return L.get(t);
    // o Supabase devolve no máximo 1000 linhas por consulta: lê em páginas
    let todas = [];
    for (let de = 0; de < 50000; de += 1000) {
      const { data, error } = await sb.from(t).select('*').order('created_at', { ascending: false }).range(de, de + 999);
      if (error) throw error;
      todas = todas.concat(data); if (data.length < 1000) break;
    }
    return todas;
  },
  async insert(t, row) {
    if (DEMO) { const r = { id: uid(), created_at: new Date().toISOString(), ...row }; L.set(t, [r, ...L.get(t)]); return r; }
    const { data, error } = await sb.from(t).insert(row).select().single();
    if (error) throw error; return data;
  },
  async update(t, id, patch) {
    if (DEMO) { const all = L.get(t).map(r => r.id === id ? { ...r, ...patch } : r); L.set(t, all); return all.find(r => r.id === id); }
    const { data, error } = await sb.from(t).update(patch).eq('id', id).select().single();
    if (error) throw error; return data;
  },
  async remove(t, id) {
    if (DEMO) { L.set(t, L.get(t).filter(r => r.id !== id)); return; }
    const { error } = await sb.from(t).delete().eq('id', id);
    if (error) throw error;
  },
  async listBy(t, col, val) {
    if (DEMO) return L.get(t).filter(r => r[col] === val).sort((a, b) => a.created_at.localeCompare(b.created_at));
    // as 1000 mais recentes (limite do Supabase), em ordem cronológica
    const { data, error } = await sb.from(t).select('*').eq(col, val).order('created_at', { ascending: false }).limit(1000);
    if (error) throw error; return data.reverse();
  },
  async upload(path, file) {
    if (DEMO) return path;
    const { error } = await sb.storage.from('processos').upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (error) throw error; return path;
  },
  async arquivoUrl(path) {
    if (DEMO || !path) return null;
    const { data, error } = await sb.storage.from('processos').createSignedUrl(path, 3600);
    if (error) throw error; return data.signedUrl;
  }
};

async function criar(t, row) { const r = await db.insert(t, row); S[t] = [r, ...S[t].filter(x => x.id !== r.id)]; return r; } // o tempo real pode ter trazido a linha antes
async function atualizar(t, id, patch) { const r = await db.update(t, id, patch); S[t] = S[t].map(x => x.id === id ? r : x); return r; }
async function apagar(t, id) { await db.remove(t, id); S[t] = S[t].filter(x => x.id !== id); }
// número digitado no formato brasileiro: "1.500,00", "R$ 300", "250.5" → 1500, 300, 250.5
function numBR(v) {
  let t = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t); return Number.isFinite(n) ? n : NaN;
}
async function seguro(fn) { try { return await fn(); } catch (e) { console.error(e); toast('Erro: ' + (e.message || e)); } }

async function carregar() {
  const dados = await Promise.all(TABELAS.map(t => db.list(t).catch(e => { console.warn(t, e); return []; })));
  TABELAS.forEach((t, i) => S[t] = dados[i]);
  S.ajustes = await ajustesDb.ler().catch(e => { console.warn('ajustes', e); return {}; });
}

/* ---------------- dados de demonstração ---------------- */
function semearDemo() {
  if (localGet('pf_semeado') === '4') return;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const nomes = ['Dra. Ana Lima', 'Dr. Bruno Teixeira', 'Dra. Carla Mendes', 'Dr. Diego Rocha', 'Dra. Elisa Prado', 'Dr. Fábio Nunes', 'Dra. Gabriela Reis', 'Dr. Henrique Alves', 'Dra. Isabela Costa', 'Dr. João Pires', 'Dra. Karen Souza', 'Dr. Lucas Barros'];
  const empresas = ['Transportes Alfa Ltda', 'Supermercado Beta S.A.', 'Construtora Gama', 'Banco Delta', 'Hospital Épsilon', 'Logística Zeta'];
  const clientes = [], leads = [], calculos = [], despesas = [];
  const agora = new Date();
  for (let i = 0; i < 70; i++) {
    const d = new Date(agora); d.setDate(d.getDate() - Math.floor(rnd() * 170)); d.setHours(8 + Math.floor(rnd() * 11), Math.floor(rnd() * 60));
    const canal = pick(['Google Ads', 'Google Ads', 'Google Ads', 'Meta Ads', 'Meta Ads', 'Site orgânico', 'Indicação', 'WhatsApp direto']);
    const nome = pick(nomes);
    const idade = (agora - d) / 864e5;
    const r = rnd();
    const status = idade < 1 ? 'novo' : idade < 4 ? (r < .5 ? 'orcamento' : 'fechado') : (r < .45 ? 'fechado' : r < .75 ? 'perdido' : 'orcamento');
    const proc = Array.from({ length: 20 }, () => Math.floor(rnd() * 10)).join('');
    const l = {
      id: uid(), created_at: d.toISOString(), nome, whatsapp: '2198' + String(1000000 + Math.floor(rnd() * 8999999)),
      tipo: pick(TIPOS.slice(0, 4)), prazo: pick(['Mais de 5 dias', '3 a 5 dias', 'Até 48h (urgente)']), modo: pick(['pdf', 'numero']),
      numero_processo: cnj(proc), origem: canal, gclid: canal === 'Google Ads' ? 'demo' : null, status,
      utm_campaign: canal === 'Google Ads' ? (rnd() < .85 ? 'google_pesquisa_calculo' : 'google_remarketing') : canal === 'Meta Ads' ? pick(['meta_topo_reels', 'meta_topo_reels', 'meta_remarketing']) : null,
      utm_term: canal === 'Google Ads' ? pick(['cálculo de liquidação trabalhista', 'pje calc', 'calculista trabalhista', 'impugnação aos cálculos trabalhista', 'liquidação de sentença trabalhista']) : null,
      valor_orcado: 250 + Math.floor(rnd() * 4) * 50, respondido_em: status === 'novo' ? null : new Date(d.getTime() + (5 + rnd() * 90) * 6e4).toISOString(),
      motivo_perda: status === 'perdido' ? pick(['Preço', 'Fez internamente', 'Sem resposta', 'Prazo']) : null
    };
    leads.push(l);
    if (status === 'fechado') {
      let c = clientes.find(x => x.nome === nome);
      if (!c) { c = { id: uid(), created_at: d.toISOString(), nome, whatsapp: l.whatsapp, oab: 'RJ ' + (100000 + Math.floor(rnd() * 99999)), cidade: pick(['Rio de Janeiro/RJ', 'Niterói/RJ', 'Duque de Caxias/RJ', 'São Paulo/SP']), origem: canal }; clientes.push(c); }
      l.cliente_id = c.id;
      const ent = isoLocal(d), prazo = somaDias(ent, l.prazo.includes('48h') ? 1 : 2);
      const entregue = idade > 3 || rnd() < .3;
      const autores = rnd() < .15 ? 2 + Math.floor(rnd() * 4) : 1;
      calculos.push({
        id: uid(), created_at: d.toISOString(), cliente_id: c.id, lead_id: l.id, numero_processo: l.numero_processo,
        reclamante: pick(['José da Silva', 'Maria Oliveira', 'Paulo Santos', 'Rita Ferreira', 'Carlos Souza']), reclamada: pick(empresas),
        tipo: l.tipo, autores, complexidade: autores > 1 ? 'complexa' : pick(['simples', 'simples', 'média']),
        status: entregue ? 'entregue' : pick(['recebido', 'andamento', 'revisao']), data_entrada: ent, prazo_entrega: prazo,
        data_entrega: entregue ? somaDias(ent, rnd() < .85 ? 1 : 3) : null,
        valor_cobrado: autores > 1 ? 250 * autores * .8 : l.valor_orcado, valor_apurado: Math.round(15000 + rnd() * 120000),
        pago: entregue && rnd() < .8, data_pagamento: null
      });
      const c2 = calculos[calculos.length - 1]; if (c2.pago) c2.data_pagamento = somaDias(c2.data_entrega, Math.floor(rnd() * 6));
    }
  }
  for (let m = 0; m < 6; m++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - m, 5);
    despesas.push({ id: uid(), created_at: d.toISOString(), data: isoLocal(d), canal: 'Google Ads', descricao: 'Campanha Pesquisa', campanha: 'google_pesquisa_calculo', valor: 450 + Math.round(rnd() * 150) });
    despesas.push({ id: uid(), created_at: d.toISOString(), data: isoLocal(d), canal: 'Meta Ads', descricao: 'Reels', campanha: 'meta_topo_reels', valor: 140 + Math.round(rnd() * 60) });
    despesas.push({ id: uid(), created_at: d.toISOString(), data: isoLocal(d), canal: 'Meta Ads', descricao: 'Remarketing', campanha: 'meta_remarketing', valor: 60 + Math.round(rnd() * 40) });
  }
  // CRM: temperatura, próximo contato e histórico
  const atividades = [], wa_conversas = [], wa_mensagens = [];
  leads.forEach(l => {
    l.temperatura = l.status === 'fechado' ? 'quente' : pick(['quente', 'morno', 'morno', 'frio']);
    if (l.status === 'orcamento') l.proximo_contato = somaDias(hoje(), Math.floor(rnd() * 5) - 2);
    if (l.respondido_em) atividades.push({ id: uid(), created_at: l.respondido_em, lead_id: l.id, tipo: 'whatsapp', texto: 'Primeiro contato pelo WhatsApp' });
    if (l.status === 'orcamento' || l.status === 'fechado') atividades.push({ id: uid(), created_at: new Date(new Date(l.respondido_em).getTime() + 36e5).toISOString(), lead_id: l.id, tipo: 'status', texto: `Orçamento enviado: ${brl(l.valor_orcado)}` });
    if (l.status === 'perdido') atividades.push({ id: uid(), created_at: new Date(new Date(l.created_at).getTime() + 2 * 864e5).toISOString(), lead_id: l.id, tipo: 'status', texto: `Perdido: ${l.motivo_perda}` });
  });
  // WhatsApp: conversas dos leads mais recentes
  leads.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).forEach((l, i) => {
    const wa = '55' + digitos(l.whatsapp), t0 = new Date(l.created_at).getTime();
    const primeiro = (l.nome || '').split(' ').slice(0, 2).join(' ');
    const msgs = [
      ['in', `Boa tarde! Preciso de ${(l.tipo || 'liquidação de sentença').toLowerCase()}.${l.prazo && l.prazo.includes('48h') ? 'O prazo vence em 2 dias.' : ''}`],
      ...(l.status !== 'novo' ? [['out', `Olá, ${primeiro}! Aqui é da Pontes Ferreira Cálculos Judiciais. Pode nos enviar o PDF integral do processo?`],
      ['in', '📎 processo_integral.pdf', 'document'],
      ['out', `Analisamos o processo: o cálculo fica em ${brl(l.valor_orcado)}, com entrega em até 48h. Podemos seguir?`]] : []),
      ...(l.status === 'fechado' ? [['in', 'Pode seguir, obrigado!']] : [])
    ];
    let ult = null;
    msgs.forEach(([dir, txt, tipo], j) => {
      const ts = new Date(t0 + j * 9 * 6e4).toISOString();
      wa_mensagens.push({ id: uid(), created_at: ts, wa_id: wa, direcao: dir, tipo: tipo || 'text', texto: tipo ? '' : txt, arquivo_nome: tipo ? 'processo_integral.pdf' : null, status: dir === 'out' ? 'read' : 'received' });
      ult = { ts, txt, dir };
    });
    const entradas = msgs.map((m, j) => m[0] === 'in' ? new Date(t0 + j * 9 * 6e4).toISOString() : null).filter(Boolean);
    wa_conversas.push({ id: uid(), created_at: l.created_at, wa_id: wa, nome: l.nome, ultima_msg: ult.txt, ultima_msg_em: ult.ts, ultima_entrada_em: entradas.pop(), nao_lidas: ult.dir === 'in' && i < 3 ? 1 : 0, lead_id: l.id, cliente_id: l.cliente_id || null });
  });
  const ord = a => a.sort((x, y) => y.created_at.localeCompare(x.created_at));
  L.set('leads', ord(leads)); L.set('calculos', ord(calculos)); L.set('clientes', ord(clientes)); L.set('despesas', ord(despesas));
  const prospects = [
    ['Dra. Juliana Martins', 'Martins Advocacia Trabalhista', 'Niterói/RJ', 'Google Maps'], ['Souza & Lima Advogados Associados', 'Souza & Lima', 'Rio de Janeiro/RJ', 'Google Maps'],
    ['Dr. Rafael Teixeira', 'Teixeira Advocacia', 'Duque de Caxias/RJ', 'Instagram'], ['Dra. Camila Rocha', 'Rocha & Prado Advogados', 'São Gonçalo/RJ', 'LinkedIn'],
    ['Dr. Marcelo Alves', 'Alves Advocacia', 'Nova Iguaçu/RJ', 'Google Maps'], ['Dra. Patrícia Nogueira', 'Nogueira Advogados', 'Petrópolis/RJ', 'Site do escritório'],
    ['Dr. André Barbosa', 'Barbosa & Filhos', 'Rio de Janeiro/RJ', 'Indicação'], ['Dra. Fernanda Lopes', 'Lopes Advocacia', 'Niterói/RJ', 'Instagram']
  ].map(([nome, escritorio, cidade, fonte], i) => ({ id: uid(), created_at: new Date(agora.getTime() - (10 - i) * 864e5).toISOString(), nome, escritorio, cidade, fonte, area: 'Trabalhista',
    whatsapp: '2190000' + String(1000 + i), email: `contato${i}@exemplo.com.br`, site: i % 2 ? '' : 'exemplo.com.br', instagram: i % 3 ? '' : '@exemplo',
    status: ['a_contatar', 'a_contatar', 'a_contatar', 'contatado', 'contatado', 'respondeu', 'cliente', 'sem_interesse'][i], tentativas: [0, 0, 0, 1, 2, 1, 1, 1][i],
    ultimo_contato: i >= 3 ? new Date(agora.getTime() - (i - 2) * 864e5).toISOString() : null, proximo_contato: i === 3 || i === 4 ? somaDias(hoje(), -1) : null }));
  L.set('prospects', ord(prospects));
  L.set('atividades', ord(atividades)); L.set('wa_conversas', ord(wa_conversas)); L.set('wa_mensagens', wa_mensagens);
  localSet('pf_semeado', '4');
}
function limparDemo() {
  if (!confirm('Apagar todos os dados de exemplo deste navegador?')) return;
  [...TABELAS, 'wa_mensagens'].forEach(t => { L.set(t, []); S[t] = []; });
  S.wa_mensagens = {}; S.conversa = null;
  render();
}

/* ---------------- formulário em modal ---------------- */
function abrirForm(titulo, campos, valores = {}, extras = {}) {
  return new Promise(resolve => {
    const fundo = document.createElement('div'); fundo.className = 'modal-fundo';
    const input = f => {
      const v = valores[f.k] ?? f.padrao ?? '';
      const id = 'f_' + f.k;
      if (f.tipo === 'select') return `<select id="${id}" ${f.req ? 'required' : ''}>${f.vazio !== false ? '<option value="">—</option>' : ''}${f.opcoes.map(o => { const [val, rot] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(rot)}</option>`; }).join('')}</select>`;
      if (f.tipo === 'textarea') return `<textarea id="${id}" rows="3">${esc(v)}</textarea>`;
      if (f.tipo === 'checkbox') return `<input type="checkbox" id="${id}" ${v ? 'checked' : ''}>`;
      return `<input id="${id}" type="${f.tipo || 'text'}" ${f.tipo === 'number' ? 'step="0.01"' : ''} value="${esc(v)}" ${f.req ? 'required' : ''} placeholder="${esc(f.ph || '')}">`;
    };
    fundo.innerHTML = `<form class="modal"><h2>${esc(titulo)}</h2><div class="campos">${campos.map(f =>
      f.tipo === 'checkbox' ? `<div class="chk ${f.full ? 'full' : ''}">${input(f)}<label for="f_${f.k}" style="margin:0">${esc(f.rot)}</label></div>`
        : `<div class="${f.full ? 'full' : ''}"><label for="f_${f.k}">${esc(f.rot)}</label>${input(f)}</div>`).join('')}</div>
      <div class="rodape">${extras.apagar ? '<button type="button" class="btn perigo" data-a="apagar" style="margin-right:auto">Excluir</button>' : ''}
      <button type="button" class="btn sec" data-a="cancelar">Cancelar</button><button class="btn">Salvar</button></div></form>`;
    document.body.appendChild(fundo);
    const fechar = r => { fundo.remove(); resolve(r); };
    fundo.addEventListener('click', e => { if (e.target === fundo) fechar(null); });
    $('[data-a=cancelar]', fundo).onclick = () => fechar(null);
    if (extras.apagar) $('[data-a=apagar]', fundo).onclick = () => { if (confirm('Excluir definitivamente?')) fechar('__apagar__'); };
    $('form', fundo).onsubmit = e => {
      e.preventDefault();
      const out = {};
      campos.forEach(f => {
        const el = $('#f_' + f.k, fundo);
        if (f.tipo === 'checkbox') out[f.k] = el.checked;
        else if (f.tipo === 'number') out[f.k] = el.value === '' ? null : Number(el.value);
        else out[f.k] = el.value.trim() === '' ? null : el.value.trim();
      });
      fechar(out);
    };
    setTimeout(() => { const p = $('input,select,textarea', fundo); if (p) p.focus(); }, 30);
  });
}

const camposCliente = () => [
  { k: 'nome', rot: 'Nome (advogado/escritório)', req: true, full: true },
  { k: 'escritorio', rot: 'Escritório' }, { k: 'cpf_cnpj', rot: 'CPF ou CNPJ' },
  { k: 'whatsapp', rot: 'WhatsApp' }, { k: 'email', rot: 'E-mail', tipo: 'email' },
  { k: 'oab', rot: 'OAB' }, { k: 'cidade', rot: 'Cidade/UF' },
  { k: 'origem', rot: 'Como chegou', tipo: 'select', opcoes: CANAIS },
  { k: 'obs', rot: 'Observações', tipo: 'textarea', full: true }
];
const camposLead = () => [
  { k: 'nome', rot: 'Nome', req: true }, { k: 'whatsapp', rot: 'WhatsApp', req: true },
  { k: 'tipo', rot: 'Tipo de cálculo', tipo: 'select', opcoes: TIPOS },
  { k: 'prazo', rot: 'Prazo processual', tipo: 'select', opcoes: ['Mais de 5 dias', '3 a 5 dias', 'Até 48h (urgente)'] },
  { k: 'numero_processo', rot: 'Nº do processo' },
  { k: 'origem', rot: 'Origem', tipo: 'select', opcoes: CANAIS, padrao: 'WhatsApp direto' },
  { k: 'status', rot: 'Status', tipo: 'select', opcoes: Object.entries(STATUS_LEAD), vazio: false, padrao: 'novo' },
  { k: 'valor_orcado', rot: 'Valor orçado (R$)', tipo: 'number' },
  { k: 'temperatura', rot: 'Temperatura', tipo: 'select', opcoes: Object.entries(TEMPERATURAS) },
  { k: 'proximo_contato', rot: 'Próximo contato', tipo: 'date' },
  { k: 'tags', rot: 'Etiquetas (separe por vírgula)', ph: 'escritório grande, reclamada, CEF…' },
  { k: 'motivo_perda', rot: 'Motivo da perda', tipo: 'select', opcoes: ['Preço', 'Fez internamente', 'Sem resposta', 'Prazo', 'Outro'] },
  { k: 'obs', rot: 'Observações', tipo: 'textarea', full: true }
];
const camposCalculo = () => [
  { k: 'cliente_id', rot: 'Cliente', tipo: 'select', opcoes: [...S.clientes].sort((a, b) => a.nome.localeCompare(b.nome)).map(c => [c.id, c.nome]), full: true },
  { k: 'numero_processo', rot: 'Nº do processo' },
  { k: 'tipo', rot: 'Tipo', tipo: 'select', opcoes: TIPOS },
  { k: 'reclamante', rot: 'Reclamante(s)' }, { k: 'reclamada', rot: 'Reclamada' },
  { k: 'autores', rot: 'Nº de autores', tipo: 'number', padrao: 1 },
  { k: 'complexidade', rot: 'Complexidade', tipo: 'select', opcoes: ['simples', 'média', 'complexa'], vazio: false, padrao: 'simples' },
  { k: 'status', rot: 'Status', tipo: 'select', opcoes: Object.entries(STATUS_CALC), vazio: false, padrao: 'recebido' },
  { k: 'data_entrada', rot: 'Entrada', tipo: 'date', padrao: hoje(), req: true },
  { k: 'prazo_entrega', rot: 'Prazo de entrega', tipo: 'date', padrao: somaDias(hoje(), 2) },
  { k: 'data_entrega', rot: 'Entregue em', tipo: 'date' },
  { k: 'valor_cobrado', rot: 'Valor cobrado (R$)', tipo: 'number', padrao: 250 },
  { k: 'valor_apurado', rot: 'Valor apurado no cálculo (R$)', tipo: 'number' },
  { k: 'pago', rot: 'Pago', tipo: 'checkbox' }, { k: 'data_pagamento', rot: 'Pago em', tipo: 'date' },
  { k: 'obs', rot: 'Observações', tipo: 'textarea', full: true }
];
const camposDespesa = () => [
  { k: 'data', rot: 'Data', tipo: 'date', padrao: hoje(), req: true },
  { k: 'canal', rot: 'Categoria', tipo: 'select', opcoes: CANAIS_DESPESA, req: true, vazio: false },
  { k: 'valor', rot: 'Valor (R$)', tipo: 'number', req: true },
  { k: 'campanha', rot: 'Campanha (anúncios)', tipo: 'select', opcoes: campanhasConhecidas() },
  { k: 'descricao', rot: 'Descrição', full: true }
];
function normalizarCalculo(v) {
  if (v.status === 'entregue' && !v.data_entrega) v.data_entrega = hoje();
  if (v.status !== 'entregue') v.data_entrega = null;
  if (v.pago && !v.data_pagamento) v.data_pagamento = hoje();
  if (!v.pago) v.data_pagamento = null;
  if (v.numero_processo) v.numero_processo = cnj(v.numero_processo);
  v.autores = v.autores || 1;
  return v;
}

/* ---------------- ações ---------------- */
async function editarCalculo(c) {
  const v = await abrirForm(c ? 'Editar cálculo' : 'Novo cálculo', camposCalculo(), c || {}, { apagar: !!c });
  if (!v) return;
  await seguro(async () => {
    if (v === '__apagar__') { await apagar('calculos', c.id); toast('Cálculo excluído'); }
    else if (c) { await atualizar('calculos', c.id, normalizarCalculo(v)); toast('Cálculo atualizado'); }
    else { await criar('calculos', normalizarCalculo(v)); toast('Cálculo registrado'); }
    render();
  });
}
async function editarLead(l) {
  const v = await abrirForm(l ? 'Editar lead' : 'Novo lead', camposLead(), l || {}, { apagar: !!l });
  if (!v) return;
  await seguro(async () => {
    if (v === '__apagar__') { await apagar('leads', l.id); }
    else {
      if (v.status !== 'novo' && !(l && l.respondido_em)) v.respondido_em = new Date().toISOString();
      if (v.numero_processo) v.numero_processo = cnj(v.numero_processo);
      if (l) {
        if (v.status !== l.status) await registrar(l.id, 'status', `${STATUS_LEAD[l.status]} → ${STATUS_LEAD[v.status]}`);
        await atualizar('leads', l.id, v);
      } else { const n = await criar('leads', { modo: 'manual', ...v }); await registrar(n.id, 'status', 'Lead cadastrado manualmente'); }
    }
    render();
  });
}
async function registrar(lead_id, tipo, texto, cliente_id = null) {
  try { return await criar('atividades', { lead_id, cliente_id, tipo, texto }); } catch (e) { console.warn(e); }
}
async function moverLead(l, status) {
  const patch = { status };
  if (status !== 'novo' && !l.respondido_em) patch.respondido_em = new Date().toISOString();
  if (status === 'perdido' && !l.motivo_perda) {
    const m = prompt('Motivo da perda (Preço, Fez internamente, Sem resposta, Prazo…):', 'Sem resposta');
    if (m === null) return render(); patch.motivo_perda = m;
  }
  if (status === 'orcamento' && !l.valor_orcado) {
    const primeiroDaProsp = canalLead(l) === 'Prospecção' && !S.calculos.some(c => c.lead_id === l.id || (l.cliente_id && c.cliente_id === l.cliente_id));
    const v = prompt(primeiroDaProsp && valorOferta() ? `Valor orçado (R$) · 1º cálculo de cliente da prospecção, com a oferta:` : 'Valor orçado (R$):', String(primeiroDaProsp && valorOferta() || 250));
    if (v) patch.valor_orcado = numBR(v) || null;
  }
  await seguro(async () => {
    await atualizar('leads', l.id, patch);
    await registrar(l.id, 'status', `${STATUS_LEAD[l.status]} → ${STATUS_LEAD[status]}${patch.valor_orcado ? ` (${brl(patch.valor_orcado)})` : ''}${patch.motivo_perda ? ` · ${patch.motivo_perda}` : ''}`);
    render();
  });
}
async function leadParaCalculo(l) {
  let cli = S.clientes.find(c => (l.cliente_id && c.id === l.cliente_id) || (digitos(c.whatsapp) && digitos(c.whatsapp).slice(-9) === digitos(l.whatsapp).slice(-9)));
  const v = await abrirForm('Converter lead em cálculo', camposCalculo().filter(f => f.k !== 'cliente_id'), {
    numero_processo: l.numero_processo, tipo: l.tipo, valor_cobrado: l.valor_orcado || 250,
    prazo_entrega: somaDias(hoje(), (l.prazo || '').includes('48h') ? 1 : 2)
  });
  if (!v) return;
  await seguro(async () => {
    if (!cli) cli = await criar('clientes', { nome: l.nome || 'Sem nome', whatsapp: l.whatsapp, origem: canalLead(l) });
    await criar('calculos', normalizarCalculo({ ...v, cliente_id: cli.id, lead_id: l.id, arquivo_path: l.arquivo_path || null }));
    await atualizar('leads', l.id, { status: 'fechado', cliente_id: cli.id, respondido_em: l.respondido_em || new Date().toISOString(), valor_orcado: l.valor_orcado || v.valor_cobrado, proximo_contato: null });
    await registrar(l.id, 'status', `Fechado · cálculo criado (${brl(v.valor_cobrado)})`, cli.id);
    const conv = S.wa_conversas.find(c => c.lead_id === l.id);
    if (conv && !conv.cliente_id) await atualizar('wa_conversas', conv.id, { cliente_id: cli.id });
    toast(`Cálculo criado para ${cli.nome}`);
    render();
  });
}
async function abrirPdf(path) {
  await seguro(async () => { const u = await db.arquivoUrl(path); if (u) window.open(u, '_blank'); else toast('PDF disponível só com o Supabase conectado'); });
}
async function editarCliente(c) {
  const v = await abrirForm(c ? 'Editar cliente' : 'Novo cliente', camposCliente(), c || {}, { apagar: !!c });
  if (!v) return;
  await seguro(async () => {
    if (v === '__apagar__') await apagar('clientes', c.id);
    else if (c) await atualizar('clientes', c.id, v); else await criar('clientes', v);
    render();
  });
}
async function editarDespesa(d) {
  const v = await abrirForm(d ? 'Editar despesa' : 'Lançar despesa / investimento', camposDespesa(), d || {}, { apagar: !!d });
  if (!v) return;
  await seguro(async () => {
    if (v === '__apagar__') await apagar('despesas', d.id);
    else if (d) await atualizar('despesas', d.id, v); else await criar('despesas', v);
    render();
  });
}

/* Importa arquivos .PJC do PJe-Calc: marca como entregue o cálculo do processo, ou cria o registro */
function importarPJC() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pjc,.PJC';
  inp.onchange = () => seguro(async () => {
    const re = /PROCESSO_(\d{20})_CALCULO_(\d+)_DATA_(\d{2})(\d{2})(\d{4})_HORA_(\d{6})/i;
    const porProc = {};
    [...inp.files].forEach(f => {
      const m = f.name.match(re); if (!m) return;
      const data = `${m[5]}-${m[4]}-${m[3]}`, chave = data + m[6];
      if (!porProc[m[1]] || porProc[m[1]].chave < chave) porProc[m[1]] = { data, chave, calc: m[2], arquivo: f };
    });
    let entregues = 0, novos = 0, jaEstavam = 0;
    for (const [proc, info] of Object.entries(porProc)) {
      const doProc = S.calculos.filter(c => digitos(c.numero_processo) === proc);
      const aberto = doProc.find(c => c.status !== 'entregue');
      let alvo = null;
      if (aberto) { alvo = await atualizar('calculos', aberto.id, { status: 'entregue', data_entrega: info.data }); entregues++; }
      else if (doProc.length) jaEstavam++;
      else { alvo = await criar('calculos', { numero_processo: cnj(proc), status: 'entregue', data_entrada: info.data, data_entrega: info.data, prazo_entrega: info.data, autores: 1, complexidade: 'simples', valor_cobrado: null, pago: false, obs: `Importado do PJe-Calc (cálculo nº ${info.calc}). Defina cliente e valor.` }); novos++; }
      if (alvo && !(alvo.arquivos || []).some(a => a.nome === info.arquivo.name)) await anexarEntregas(alvo.id, [info.arquivo]).catch(e => console.warn('anexar .PJC', e));
    }
    const tot = Object.keys(porProc).length;
    toast(tot ? `${tot} processo(s): ${entregues} marcado(s) como entregue, ${novos} novo(s), ${jaEstavam} já registrado(s).` : 'Nenhum arquivo .PJC com nome no padrão do PJe-Calc.');
    render();
  });
  inp.click();
}

/* ---------------- gráficos (SVG simples, com tooltip) ---------------- */
function meses(n = 6) {
  const out = [], d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push({ chave: isoLocal(x).slice(0, 7), rot: x.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') }); }
  return out;
}
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return ''; r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function tetoBonito(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v); }
/* colunas: [{rot, valores:[..], tips:[..]}], series:[{nome, cor}] */
function graficoColunas(colunas, series, fmt = v => v) {
  const W = 600, H = 230, E = 52, B = 26, T = 10, Dd = 8;
  const max = tetoBonito(Math.max(...colunas.flatMap(c => c.valores), 0));
  const larg = (W - E - Dd) / colunas.length, gap = 2, bw = Math.min(28, (larg * .6 - gap * (series.length - 1)) / series.length);
  const y = v => T + (H - T - B) * (1 - v / max);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = y(v); s += `<line x1="${E}" x2="${W - Dd}" y1="${yy}" y2="${yy}" stroke="${i ? 'var(--grid)' : 'var(--axis)'}" stroke-width="1"/><text x="${E - 6}" y="${yy + 4}" text-anchor="end">${esc(fmt(v))}</text>`; }
  colunas.forEach((c, i) => {
    const cx = E + larg * i + larg / 2, grupo = bw * series.length + gap * (series.length - 1);
    c.valores.forEach((v, j) => { const x = cx - grupo / 2 + j * (bw + gap); s += `<path d="${barPath(x, y(v), bw, y(0) - y(v))}" fill="${series[j].cor}"/>`; });
    const tip = `${c.rot}\n` + series.map((se, j) => `${se.nome}: ${fmt(c.valores[j])}`).join('\n');
    s += `<rect x="${E + larg * i}" y="${T}" width="${larg}" height="${H - T - B}" fill="transparent" data-tip="${esc(tip)}"/>`;
    s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(c.rot)}</text>`;
  });
  return s + '</svg>';
}
function barrasH(linhas, fmt = v => v, cor = 'var(--s1)') {
  if (!linhas.length) return '<div class="vazio">Sem dados no período</div>';
  const max = Math.max(...linhas.map(l => l.valor), 1);
  return linhas.map(l => `<div class="hb" data-tip="${esc(l.tip || `${l.rot}: ${fmt(l.valor)}`)}"><span>${esc(l.rot)}</span><div class="barra"><div style="width:${(l.valor / max * 100).toFixed(1)}%;background:${l.cor || cor}"></div></div><span class="num">${esc(fmt(l.valor))}</span></div>`).join('');
}
document.addEventListener('mousemove', e => {
  const t = e.target.closest && e.target.closest('[data-tip]'), tip = $('#tip');
  if (!t) { tip.style.opacity = 0; return; }
  tip.textContent = t.dataset.tip; tip.style.opacity = 1;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = x + 'px'; tip.style.top = (e.clientY + 14) + 'px';
});

/* ---------------- métricas ---------------- */
function metricas() {
  const ini = inicioPeriodo();
  const leadsP = S.leads.filter(l => noPeriodo(l.created_at, ini));
  const fechadosP = leadsP.filter(l => l.status === 'fechado');
  const orcadosP = leadsP.filter(l => l.status !== 'novo');
  const entradasP = S.calculos.filter(c => noPeriodo(c.data_entrada, ini));
  const saidasP = S.calculos.filter(c => c.status === 'entregue' && noPeriodo(c.data_entrega, ini));
  const abertos = S.calculos.filter(c => c.status !== 'entregue');
  const atrasados = abertos.filter(atrasado);
  const faturado = soma(saidasP, c => c.valor_cobrado);
  const recebido = soma(S.calculos.filter(c => c.pago && noPeriodo(c.data_pagamento, ini)), c => c.valor_cobrado);
  const aReceberLista = S.calculos.filter(c => c.status === 'entregue' && !c.pago);
  const despesasP = S.despesas.filter(d => noPeriodo(d.data, ini));
  const gastoAds = soma(despesasP.filter(d => CANAIS_ADS.includes(d.canal)), d => d.valor);
  const gastoTotal = soma(despesasP, d => d.valor);
  const clientesNovos = S.clientes.filter(c => noPeriodo(c.created_at, ini));
  const clientesAds = clientesNovos.filter(c => ['Google Ads', 'Meta Ads'].includes(c.origem));
  const respondidos = leadsP.filter(l => l.respondido_em);
  const tempoResp = respondidos.length ? soma(respondidos, l => (new Date(l.respondido_em) - new Date(l.created_at)) / 6e4) / respondidos.length : null;
  const prazosEntrega = saidasP.filter(c => c.data_entrada && c.data_entrega).map(c => difDias(c.data_entrada, c.data_entrega));
  const noPrazo = saidasP.filter(c => !c.prazo_entrega || c.data_entrega <= c.prazo_entrega).length;
  return {
    ini, leadsP, fechadosP, orcadosP, entradasP, saidasP, abertos, atrasados, faturado, recebido, aReceberLista,
    aReceber: soma(aReceberLista, c => c.valor_cobrado), gastoAds, gastoTotal, despesasP, clientesNovos, clientesAds,
    conv: leadsP.length ? fechadosP.length / leadsP.length : NaN,
    cac: clientesAds.length ? gastoAds / clientesAds.length : (clientesNovos.length ? gastoAds / clientesNovos.length : NaN),
    ticket: saidasP.length ? faturado / saidasP.length : NaN,
    tempoResp, mediaEntrega: prazosEntrega.length ? soma(prazosEntrega, x => x) / prazosEntrega.length : null,
    pctNoPrazo: saidasP.length ? noPrazo / saidasP.length : NaN,
    novosSemResposta: S.leads.filter(semResposta),
    retornosHoje: S.leads.filter(retornoPendente)
  };
}
const fmtMin = m => m == null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1).replace('.', ',')} h` : `${(m / 1440).toFixed(1).replace('.', ',')} dias`;

/* ---------------- telas ---------------- */
const kpi = (rot, val, sub = '', alerta = false) => `<div class="kpi ${alerta ? 'alerta' : ''}"><div class="rot">${rot}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
const seletorPeriodo = () => `<select class="f" id="periodo">${Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${k === S.periodo ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
const tagStatus = c => {
  if (atrasado(c)) return `<span class="tag t-crit">⚠ Atrasado</span>`;
  return { recebido: '<span class="tag t-neutro">● Recebido</span>', andamento: '<span class="tag t-azul">◐ Em andamento</span>', revisao: '<span class="tag t-warn">◑ Em revisão</span>', entregue: '<span class="tag t-good">✔ Entregue</span>' }[c.status] || esc(c.status);
};

function telaPainel() {
  carregarMapa();
  const m = metricas();
  const ms = meses(6);
  const porMes = (arr, campo, f) => ms.map(x => soma(arr.filter(c => (c[campo] || '').slice(0, 7) === x.chave), f));
  const entrad = porMes(S.calculos, 'data_entrada', () => 1);
  const saida = porMes(S.calculos.filter(c => c.status === 'entregue'), 'data_entrega', () => 1);
  const fat = porMes(S.calculos.filter(c => c.status === 'entregue'), 'data_entrega', c => c.valor_cobrado);
  const porCanal = {};
  m.leadsP.forEach(l => { const k = canalLead(l); (porCanal[k] = porCanal[k] || { n: 0, f: 0 }); porCanal[k].n++; if (l.status === 'fechado') porCanal[k].f++; });
  const canais = Object.entries(porCanal).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => ({ rot: k, valor: v.n, tip: `${k}\n${v.n} leads · ${v.f} fechados (${pct(v.f / v.n)})` }));
  const funil = [
    { rot: 'Leads', valor: m.leadsP.length, cor: '#86b6ef' },
    { rot: 'Respondidos', valor: m.orcadosP.length, cor: '#5598e7' },
    { rot: 'Fechados', valor: m.fechadosP.length, cor: '#256abf' }
  ];
  const proximos = [...m.abertos].sort((a, b) => (a.prazo_entrega || '9').localeCompare(b.prazo_entrega || '9')).slice(0, 8);
  const novos = m.novosSemResposta;

  return `
  <div class="topo"><h1>Painel</h1><div class="acoes">${seletorPeriodo()}<button class="btn sec" data-acao="novoLead">+ Lead</button><button class="btn" data-acao="novoCalculo">+ Cálculo</button></div></div>
  ${novos.length ? `<div class="demo" style="background:#fbe3e3;border-color:var(--crit)"><span>⚠ <b>${novos.length} lead(s) sem resposta</b>, o mais antigo há ${fmtMin(Math.max(...novos.map(l => minutosDesde(l.created_at))))}. Quem responde primeiro fecha.</span><a class="btn mini" href="#leads" data-vista="retornos">Responder agora</a></div>` : ''}
  ${m.retornosHoje.length ? `<div class="demo"><span>⏰ <b>${m.retornosHoje.length} retorno(s) agendado(s)</b> para hoje ou atrasados.</span><a class="btn mini" href="#leads" data-vista="retornos">Ver retornos</a></div>` : ''}
  ${soma(S.wa_conversas, c => c.nao_lidas) ? `<div class="demo" style="background:#e3f6ea;border-color:#1f8a5b"><span>💬 <b>${soma(S.wa_conversas, c => c.nao_lidas)} mensagem(ns) não lida(s)</b> no WhatsApp.</span><a class="btn mini" href="#whatsapp">Abrir WhatsApp</a></div>` : ''}
  <div class="kpis">
    ${kpi('Leads', m.leadsP.length, `${m.fechadosP.length} fechados`)}
    ${kpi('Conversão', pct(m.conv), 'leads → cliente')}
    ${kpi('Tempo de resposta', fmtMin(m.tempoResp), `meta: até ${MIN_RESPOSTA} min`, m.tempoResp > MIN_RESPOSTA)}
    ${kpi('Cálculos que entraram', m.entradasP.length, `${m.abertos.length} abertos agora`)}
    ${kpi('Cálculos entregues', m.saidasP.length, `${pct(m.pctNoPrazo)} no prazo · média ${m.mediaEntrega == null ? '—' : m.mediaEntrega.toFixed(1).replace('.', ',') + ' dias'}`)}
    ${kpi('Atrasados', m.atrasados.length, 'prazo de entrega vencido', m.atrasados.length > 0)}
    ${kpi('Faturado', brl0(m.faturado), `ticket médio ${isFinite(m.ticket) ? brl0(m.ticket) : '—'}`)}
    ${kpi('Recebido', brl0(m.recebido), `a receber: ${brl0(m.aReceber)}`)}
    ${kpi('Investido em anúncios', brl0(m.gastoAds), `CAC ${isFinite(m.cac) ? brl0(m.cac) : '—'} por cliente`)}
    ${kpi('Retorno sobre anúncios', m.gastoAds ? (m.faturado / m.gastoAds).toFixed(1).replace('.', ',') + 'x' : '—', 'faturado ÷ investido')}
  </div>
  <div class="grade">
    <div class="card"><h2>Cálculos: entrada × saída</h2><div class="desc">Quantidade por mês, últimos 6 meses</div>
      <div class="legenda"><span><i style="background:var(--s1)"></i>Entraram</span><span><i style="background:var(--s2)"></i>Entregues</span></div>
      ${graficoColunas(ms.map((x, i) => ({ rot: x.rot, valores: [entrad[i], saida[i]] })), [{ nome: 'Entraram', cor: 'var(--s1)' }, { nome: 'Entregues', cor: 'var(--s2)' }])}</div>
    <div class="card"><h2>Faturamento por mês</h2><div class="desc">Valor dos cálculos entregues, últimos 6 meses</div>
      ${graficoColunas(ms.map((x, i) => ({ rot: x.rot, valores: [fat[i]] })), [{ nome: 'Faturado', cor: 'var(--s1)' }], v => v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : brl0(v))}</div>
    <div class="card"><h2>Leads por canal</h2><div class="desc">${PERIODOS[S.periodo]} · passe o mouse para ver a conversão</div>${barrasH(canais)}</div>
    <div class="card"><h2>Funil de vendas</h2><div class="desc">${PERIODOS[S.periodo]}</div>${barrasH(funil, v => v)}
      <div class="desc" style="margin-top:10px">Perdas: ${(() => { const p = {}; m.leadsP.filter(l => l.status === 'perdido').forEach(l => p[l.motivo_perda || 'Sem motivo'] = (p[l.motivo_perda || 'Sem motivo'] || 0) + 1); const e = Object.entries(p).sort((a, b) => b[1] - a[1]); return e.length ? e.map(([k, v]) => `${esc(k)} (${v})`).join(' · ') : 'nenhuma'; })()}</div></div>
    <div class="card"><div class="linha" style="justify-content:space-between"><h2>Onde estão procurando</h2><a class="btn mini sec" href="#mapa">Ver mapa →</a></div><div class="desc">Visitas ao site por estado · ${PERIODOS[S.periodo]}</div>
      ${(() => { const por = (S.mapa?.dados?.por_uf || []).filter(x => x.visitas && UF_NOME[x.uf]).sort((x, y) => y.visitas - x.visitas).slice(0, 6); return por.length ? barrasH(por.map(x => ({ rot: `${x.uf} · ${UF_NOME[x.uf]}`, valor: x.visitas, tip: `${UF_NOME[x.uf]}\n${x.visitas} visitas · ${x.whatsapp} WhatsApp · ${x.pedidos} pedidos` }))) : `<div class="vazio">${S.mapa?.carregando ? 'Carregando…' : 'As visitas aparecem aqui assim que o monitoramento estiver ligado.'}</div>`; })()}</div>
    <div class="card larga"><h2>Próximas entregas</h2><div class="desc">Cálculos em aberto, por prazo</div>
      ${proximos.length ? `<div class="tabela"><table><tr><th>Prazo</th><th>Processo</th><th>Cliente</th><th>Tipo</th><th>Status</th></tr>
      ${proximos.map(c => `<tr class="clic" data-calc="${c.id}"><td>${dataBR(c.prazo_entrega)}</td><td>${esc(c.numero_processo || '—')}</td><td>${esc(cliente(c.cliente_id)?.nome || '—')}</td><td>${esc(c.tipo || '—')}</td><td>${tagStatus(c)}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Nenhum cálculo em aberto 🎉</div>'}</div>
  </div>`;
}

/* ---------------- CRM de leads ---------------- */
const semResposta = l => l.status === 'novo' && !l.respondido_em;
const ativo = l => !['fechado', 'perdido'].includes(l.status);
const retornoPendente = l => ativo(l) && l.proximo_contato && l.proximo_contato <= hoje();
const conversaDoLead = l => S.wa_conversas.find(c => c.lead_id === l.id) || (l.whatsapp ? S.wa_conversas.find(c => digitos(c.wa_id).slice(-9) === digitos(l.whatsapp).slice(-9)) : null);
const tagTemp = l => l.temperatura ? `<span class="tag ${l.temperatura === 'quente' ? 't-crit' : l.temperatura === 'morno' ? 't-warn' : 't-azul'}">${TEMPERATURAS[l.temperatura]}</span>` : '';
const tagProx = l => {
  if (!l.proximo_contato || !ativo(l)) return '';
  const d = difDias(hoje(), l.proximo_contato);
  if (d < 0) return `<span class="tag t-crit">⏰ Retorno atrasado ${-d}d</span>`;
  if (d === 0) return `<span class="tag t-warn">⏰ Retornar hoje</span>`;
  return `<span class="tag t-neutro">⏰ ${dataBR(l.proximo_contato)}</span>`;
};
const tagsLead = l => (l.tags || '').split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="tag t-neutro">#${esc(t)}</span>`).join(' ');
const botaoWa = l => l.whatsapp ? `<button class="btn mini ouro" data-wa-lead="${l.id}">💬 WhatsApp</button>` : '';

function filtrarLeads() {
  const f = S.filtroLeads, q = f.q.toLowerCase();
  return S.leads.filter(l => (!f.status || l.status === f.status) && (!f.canal || canalLead(l) === f.canal) && (!f.temp || l.temperatura === f.temp)
    && (!q || [l.nome, l.whatsapp, l.numero_processo, l.tipo, l.tags, l.obs].join(' ').toLowerCase().includes(q)));
}

function telaLeads() {
  const cols = Object.keys(STATUS_LEAD);
  const retornos = S.leads.filter(l => retornoPendente(l) || semResposta(l));
  const vistas = { funil: 'Funil', lista: 'Lista', retornos: `Retornos${retornos.length ? ` (${retornos.length})` : ''}` };
  const topo = `<div class="topo"><h1>Leads · CRM</h1><div class="acoes">
    <div class="seg">${Object.entries(vistas).map(([k, v]) => `<button class="${S.vistaLeads === k ? 'on' : ''}" data-vista="${k}">${v}</button>`).join('')}</div>
    <button class="btn" data-acao="novoLead">+ Lead</button></div></div>`;

  if (S.vistaLeads === 'lista') {
    const f = S.filtroLeads, lista = filtrarLeads();
    const sel = (id, atual, opcoes, vazio) => `<select class="f" id="${id}"><option value="">${vazio}</option>${opcoes.map(([v, r]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>`;
    return topo + `<div class="acoes" style="margin-bottom:12px">
      <input class="f" id="buscaLeads" placeholder="Buscar nome, telefone, processo, etiqueta…" value="${esc(f.q)}" style="width:280px">
      ${sel('fStatus', f.status, Object.entries(STATUS_LEAD), 'Todos os status')}
      ${sel('fCanal', f.canal, CANAIS.map(c => [c, c]), 'Todos os canais')}
      ${sel('fTemp', f.temp, Object.entries(TEMPERATURAS), 'Qualquer temperatura')}</div>
      <div class="card"><div class="tabela">${lista.length ? `<table><tr><th>Entrada</th><th>Nome</th><th>Tipo</th><th>Canal</th><th>Status</th><th>Temp.</th><th class="n">Orçado</th><th>Próx. contato</th><th>Último contato</th></tr>
      ${lista.map(l => `<tr class="clic" data-ficha="${l.id}"><td>${dataBR(l.created_at)}</td><td><b>${esc(l.nome || '—')}</b> ${tagsLead(l)}</td><td>${esc(l.tipo || '—')}</td><td>${esc(canalLead(l))}</td>
        <td>${esc(STATUS_LEAD[l.status] || l.status)}</td><td>${tagTemp(l)}</td><td class="n">${l.valor_orcado ? brl(l.valor_orcado) : '—'}</td><td>${tagProx(l) || '—'}</td><td>${l.ultimo_contato ? dataBR(l.ultimo_contato) : (l.respondido_em ? dataBR(l.respondido_em) : '—')}</td></tr>`).join('')}</table>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">${lista.length} lead(s) · ${brl(soma(lista, l => l.valor_orcado))} orçados</p>` : '<div class="vazio">Nenhum lead com esses filtros</div>'}</div></div>`;
  }

  if (S.vistaLeads === 'retornos') {
    const ordem = [...retornos].sort((a, b) => (semResposta(b) - semResposta(a)) || (a.proximo_contato || '').localeCompare(b.proximo_contato || ''));
    return topo + `<div class="card"><h2>O que fazer hoje</h2><div class="desc">Leads sem resposta e retornos agendados para hoje ou atrasados</div>
      ${ordem.length ? ordem.map(l => `<div class="retorno">
        <div><b class="link" data-ficha="${l.id}">${esc(l.nome || 'Sem nome')}</b> ${tagTemp(l)} ${semResposta(l) ? `<span class="tag t-crit">Sem resposta há ${fmtMin(minutosDesde(l.created_at))}</span>` : tagProx(l)}
          <div class="meta">${esc(STATUS_LEAD[l.status])} · ${esc(l.tipo || '—')}${l.valor_orcado ? ' · ' + brl(l.valor_orcado) : ''}${ultimaAtividade(l) ? ' · último: ' + esc(ultimaAtividade(l)) : ''}</div></div>
        <div class="linha">${botaoWa(l)}
          <button class="btn mini sec" data-adiar="${l.id}" data-dias="1">Amanhã</button><button class="btn mini sec" data-adiar="${l.id}" data-dias="3">+3 dias</button>
          <button class="btn mini sec" data-ficha="${l.id}">Abrir ficha</button></div></div>`).join('') : '<div class="vazio">Nenhum retorno pendente 🎉</div>'}</div>`;
  }

  const lim = new Date(); lim.setDate(lim.getDate() - 60);
  const visiveis = S.leads.filter(l => ativo(l) || new Date(l.created_at) >= lim);
  const card = l => {
    const urg = semResposta(l) && minutosDesde(l.created_at) > MIN_RESPOSTA;
    return `<div class="lead ${urg ? 'urgente' : ''}" draggable="true" data-arrastar="${l.id}" title="Arraste para outra coluna">
      <div class="lead-topo"><b class="link" data-ficha="${l.id}">${esc(l.nome || 'Sem nome')}</b><button class="lead-excluir" data-excluir-lead="${l.id}" title="Excluir este lead" aria-label="Excluir lead">🗑</button></div>
      <div class="meta">${esc(l.tipo || '—')}<br>${l.numero_processo ? '⚖ ' + esc(l.numero_processo) + '<br>' : ''}${esc(canalLead(l))} · ${dataBR(l.created_at)} ${new Date(l.created_at).toTimeString().slice(0, 5)}
      ${l.valor_orcado ? `<br>Orçado: ${brl(l.valor_orcado)}` : ''}${l.status === 'perdido' && l.motivo_perda ? `<br>Motivo: ${esc(l.motivo_perda)}` : ''}</div>
      <div class="linha" style="margin-bottom:6px">${tagTemp(l)}${l.prazo && l.prazo.includes('48h') && ativo(l) ? '<span class="tag t-crit">Prazo urgente</span>' : ''}${urg ? `<span class="tag t-crit">Sem resposta há ${fmtMin(minutosDesde(l.created_at))}</span>` : ''}${tagProx(l)}</div>
      <div class="linha">
        ${botaoWa(l)}
        ${l.arquivo_path ? `<button class="btn mini sec" data-pdf="${esc(l.arquivo_path)}">PDF</button>` : ''}
        ${l.status !== 'fechado' ? `<button class="btn mini" data-converter="${l.id}">→ Cálculo</button>` : ''}
        <select class="f" style="padding:3px 6px;font-size:12px" data-mover="${l.id}">${cols.map(s => `<option value="${s}" ${s === l.status ? 'selected' : ''}>${STATUS_LEAD[s]}</option>`).join('')}</select>
      </div></div>`;
  };
  return topo + `<div class="kanban">${cols.map(s => { const ls = visiveis.filter(l => l.status === s); return `<div class="col" data-coluna="${s}"><h3><span>${STATUS_LEAD[s]}</span><span>${ls.length} · ${brl0(soma(ls, l => l.valor_orcado))}</span></h3>${ls.map(card).join('') || '<div class="vazio">—</div>'}</div>`; }).join('')}</div>
  <p class="desc" style="margin-top:10px;color:var(--muted);font-size:12px">Arraste os cards entre as colunas para mudar o status. Clique no nome para abrir a ficha completa. Fechados e perdidos dos últimos 60 dias.</p>`;
}
function ultimaAtividade(l) { const a = S.atividades.filter(x => x.lead_id === l.id).sort((x, y) => y.created_at.localeCompare(x.created_at))[0]; return a ? `${dataBR(a.created_at)} ${a.texto || ''}`.slice(0, 60) : ''; }

/* Ficha do lead (CRM) */
let fichaId = null;
function abrirFicha(id) { fichaId = id; renderFicha(); }
function fecharFicha() { fichaId = null; $('#ficha')?.remove(); }
function renderFicha() {
  const l = S.leads.find(x => x.id === fichaId);
  $('#ficha')?.remove();
  if (!l) return;
  const conv = conversaDoLead(l), cli = cliente(l.cliente_id);
  const ativs = S.atividades.filter(a => a.lead_id === l.id || (l.cliente_id && a.cliente_id === l.cliente_id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const calcs = l.cliente_id ? S.calculos.filter(c => c.cliente_id === l.cliente_id) : S.calculos.filter(c => c.lead_id === l.id);
  const linha = (r, v) => v ? `<div class="dado"><span>${r}</span><b>${v}</b></div>` : '';
  const el = document.createElement('div'); el.className = 'modal-fundo'; el.id = 'ficha';
  el.innerHTML = `<div class="modal ficha">
    <div class="ficha-topo"><div><h2 style="margin:0">${esc(l.nome || 'Sem nome')}</h2><div class="linha" style="margin-top:6px">${tagTemp(l)} ${tagProx(l)} ${tagsLead(l)}</div></div>
      <button class="btn sec mini" data-fechar-ficha>✕</button></div>
    <div class="ficha-grade">
      <div>
        <div class="campos" style="grid-template-columns:1fr 1fr;margin-bottom:12px">
          <div><label>Status</label><select id="fichaStatus">${Object.entries(STATUS_LEAD).map(([k, v]) => `<option value="${k}" ${k === l.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div><label>Temperatura</label><select id="fichaTemp"><option value="">—</option>${Object.entries(TEMPERATURAS).map(([k, v]) => `<option value="${k}" ${k === l.temperatura ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        </div>
        ${linha('WhatsApp', esc(l.whatsapp))}${linha('Processo', esc(l.numero_processo))}${linha('Tipo', esc(l.tipo))}${linha('Prazo informado', esc(l.prazo))}
        ${linha('Canal', esc(canalLead(l)) + (l.utm_campaign ? ' · ' + esc(l.utm_campaign) : ''))}${linha('Entrou em', dataBR(l.created_at) + ' ' + new Date(l.created_at).toTimeString().slice(0, 5))}
        ${linha('Tempo de resposta', l.respondido_em ? fmtMin((new Date(l.respondido_em) - new Date(l.created_at)) / 6e4) : '<span style="color:var(--crit)">sem resposta</span>')}
        ${linha('Valor orçado', l.valor_orcado ? brl(l.valor_orcado) : '')}${linha('Cliente', cli ? esc(cli.nome) : '')}${linha('Motivo da perda', esc(l.motivo_perda))}
        ${l.obs ? `<p class="obs">${esc(l.obs)}</p>` : ''}
        <div class="linha" style="margin-top:12px">${botaoWa(l)}${conv ? `<span class="desc" style="margin:0">${conv.nao_lidas ? `<b style="color:var(--crit)">${conv.nao_lidas} não lida(s)</b>` : ''}</span>` : ''}
          ${l.arquivo_path ? `<button class="btn mini sec" data-pdf="${esc(l.arquivo_path)}">PDF do processo</button>` : ''}
          ${l.status !== 'fechado' ? `<button class="btn mini" data-converter="${l.id}">→ Cálculo</button>` : ''}
          <button class="btn mini sec" data-lead="${l.id}">✎ Editar dados</button></div>
        ${calcs.length ? `<h3 class="sub">Cálculos</h3>${calcs.map(c => `<div class="dado clic" data-calc="${c.id}"><span>${dataBR(c.data_entrada)} · ${esc(c.numero_processo || '—')}</span><b>${tagStatus(c)} ${c.valor_cobrado != null ? brl(c.valor_cobrado) : ''}</b></div>`).join('')}` : ''}
      </div>
      <div>
        <label class="rotulo">Próximo contato</label>
        <div class="linha" style="margin-bottom:12px"><input type="date" class="f" id="fichaProx" value="${l.proximo_contato || ''}">
          <button class="btn mini sec" data-prox="1">Amanhã</button><button class="btn mini sec" data-prox="3">+3 dias</button><button class="btn mini sec" data-prox="7">+7 dias</button>${l.proximo_contato ? '<button class="btn mini sec" data-prox="0">Limpar</button>' : ''}</div>
        <label class="rotulo">Registrar interação</label>
        <div class="nova-ativ"><select id="ativTipo">${Object.entries(TIPOS_ATIV).filter(([k]) => k !== 'status').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <textarea id="ativTexto" rows="2" placeholder="Ex.: Liguei, pediu desconto para 3 processos; retornar sexta."></textarea>
          <button class="btn mini" data-acao="addAtividade">Adicionar</button></div>
        <h3 class="sub">Histórico</h3>
        <div class="timeline">${ativs.length ? ativs.map(a => `<div class="ativ"><span class="quando">${dataBR(a.created_at)} ${new Date(a.created_at).toTimeString().slice(0, 5)}</span><b>${TIPOS_ATIV[a.tipo] || esc(a.tipo)}</b> ${esc(a.texto || '')}</div>`).join('') : '<div class="vazio">Nenhuma interação registrada</div>'}
          <div class="ativ"><span class="quando">${dataBR(l.created_at)} ${new Date(l.created_at).toTimeString().slice(0, 5)}</span><b>✨ Entrada</b> via ${esc(canalLead(l))}${l.modo === 'pdf' ? ' (enviou PDF)' : l.modo === 'numero' ? ' (informou o nº)' : ''}</div></div>
      </div>
    </div></div>`;
  el.addEventListener('click', e => { if (e.target === el) fecharFicha(); });
  document.body.appendChild(el);
}
async function atualizarLeadFicha(patch, log) {
  const l = S.leads.find(x => x.id === fichaId); if (!l) return;
  await seguro(async () => { await atualizar('leads', l.id, patch); if (log) await registrar(l.id, 'status', log); render(); renderFicha(); });
}

/* ---------------- WhatsApp ---------------- */
const fmtTel = w => { const d = digitos(w).replace(/^55/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : w; };
const EVOLUTION = () => !DEMO && (window.PF_CONFIG || {}).WA_PROVEDOR === 'evolution';
const janelaAberta = c => EVOLUTION() ? !!c : (c && c.ultima_entrada_em && (Date.now() - new Date(c.ultima_entrada_em).getTime()) < 24 * 36e5);
const convAtiva = () => S.wa_conversas.find(c => c.wa_id === S.conversa);
const leadDaConversa = c => c && (S.leads.find(l => l.id === c.lead_id) || S.leads.find(l => l.whatsapp && digitos(l.whatsapp).slice(-9) === digitos(c.wa_id).slice(-9)));
S.rascunhos = {};
const hora = ts => new Date(ts).toTimeString().slice(0, 5);
const quandoCurto = ts => { if (!ts) return ''; const d = dia(ts); return d === hoje() ? hora(ts) : d === somaDias(hoje(), -1) ? 'ontem' : dataBR(ts).slice(0, 5); };
const ticks = m => m.direcao !== 'out' ? '' : ({ sent: '✓', delivered: '✓✓', read: '<span style="color:#34b7f1">✓✓</span>', failed: `<span style="color:var(--crit)" title="${esc(m.erro || '')}">⚠ falhou</span>` }[m.status] || '🕓');

const iniciais = n => { const p = String(n || '').replace(/^(dra?\.?|dr\.?)\s+/i, '').trim().split(/\s+/).filter(x => /\p{L}/u.test(x)); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
const CORES_AV = ['#0f2a5c', '#1c4f95', '#7a5408', '#14632f', '#5b2a86', '#8f1f1f', '#0b5e6b', '#3d4a66'];
const corAv = s => CORES_AV[[...String(s || '')].reduce((t, ch) => (t * 31 + ch.charCodeAt(0)) >>> 0, 7) % CORES_AV.length];
const avatar = (nome, chave, cls = '') => `<span class="wa-av ${cls}" style="background:${corAv(chave || nome)}">${esc(iniciais(nome))}</span>`;
const ICO = {
  enviar: '<svg viewBox="0 0 24 24"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>',
  clipe: '<svg viewBox="0 0 24 24"><path d="M21 11.5 12.5 20a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.4-8.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  trocar: '<svg viewBox="0 0 24 24"><path d="M4 7h13l-3-3M20 17H7l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  busca: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};
function telaWhatsapp() {
  const q = S.buscaWa.toLowerCase();
  const fw = S.filtroWa || 'todas';
  const convs = [...S.wa_conversas].filter(c => !q || [c.nome, c.wa_id, c.ultima_msg].join(' ').toLowerCase().includes(q))
    .filter(c => fw === 'todas' || (fw === 'naolidas' ? c.nao_lidas > 0 : fw === 'clientes' ? !!c.cliente_id : fw === 'leads' ? !!leadDaConversa(c) && !c.cliente_id : true))
    .sort((a, b) => (b.ultima_msg_em || b.created_at).localeCompare(a.ultima_msg_em || a.created_at));
  const c = convAtiva(), l = leadDaConversa(c);
  const msgs = c ? (S.wa_mensagens[c.wa_id] || null) : null;
  let corpo = `<div class="wa-vazio"><img src="/img/marca.svg" alt="" width="84" height="84"><b>Suas conversas</b><span>Escolha uma conversa à esquerda ou comece uma nova.</span><button class="btn mini ouro" data-acao="novaConversa">+ Nova conversa</button></div>`;
  if (c) {
    let ultDia = '';
    const bolhas = msgs === null ? '<div class="vazio">Carregando…</div>' : msgs.length ? msgs.map(m => {
      const d = dia(m.created_at), sep = d !== ultDia ? `<div class="wa-dia">${d === hoje() ? 'Hoje' : dataBR(d)}</div>` : ''; ultDia = d;
      const arq = m.arquivo_nome ? `<div class="wa-arq">📎 ${esc(m.arquivo_nome)} ${m.arquivo_path ? `<button class="btn mini sec" data-pdf="${esc(m.arquivo_path)}">Abrir</button>` : ''}${m.arquivo_path && m.direcao === 'in' && l ? `<button class="btn mini sec" data-usar-pdf="${esc(m.arquivo_path)}" title="Definir como PDF do processo do lead">Usar no lead</button>` : ''}</div>` : '';
      return `${sep}<div class="wa-msg ${m.direcao} ${m.bot ? 'bot' : ''}">${m.bot ? '<span class="wa-bot">🤖 robô</span>' : ''}${arq}${m.texto ? `<div>${fmtWa(m.texto)}</div>` : ''}<span class="wa-hora">${hora(m.created_at)} ${ticks(m)}</span></div>`;
    }).join('') : '<div class="vazio">Nenhuma mensagem ainda</div>';
    const aberta = janelaAberta(c);
    const fimJanela = aberta && c.ultima_entrada_em ? new Date(new Date(c.ultima_entrada_em).getTime() + 24 * 36e5) : new Date();
    const cliC = c.cliente_id && cliente(c.cliente_id);
    corpo = `<div class="wa-cab"><div class="wa-quem">${avatar(c.nome || c.wa_id, c.wa_id, 'g')}<div><b>${esc(c.nome || fmtTel(c.wa_id))}</b><div class="wa-sub">${fmtTel(c.wa_id)}${cliC ? ' · <span class="tag t-good">Cliente</span>' : l ? ` · <span class="tag t-azul">${esc(STATUS_LEAD[l.status])}</span>` : ''}${l?.temperatura ? ' ' + tagTemp(l) : ''}</div></div></div>
        <div class="wa-acoes"><button class="btn mini sec" data-cadastro="${c.wa_id}" title="Preencher o cadastro com os dados da conversa">📋 Cadastro</button>${l ? `<button class="btn mini sec" data-ficha="${l.id}">Ficha</button>` : ''}${l && l.status !== 'fechado' ? `<button class="btn mini ouro" data-converter="${l.id}">→ Cálculo</button>` : ''}<a class="btn mini sec" target="${ALVO_WA}" href="${waLink(c.wa_id)}" title="Abrir no WhatsApp Web">WhatsApp Web ↗</a></div></div>
      ${EVOLUTION() ? '' : `<div class="wa-janela ${aberta ? 'ok' : 'fechada'}">${aberta ? `✔ Conversa aberta: pode responder livremente até ${fimJanela.toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR') ? 'hoje' : 'amanhã'} às ${hora(fimJanela)}.`
        : `⏸ O cliente não escreve há mais de 24h. Pela regra do WhatsApp, só dá para enviar um <b>modelo aprovado</b> para retomar a conversa. <button class="btn mini" data-acao="waModelo">Enviar modelo "${esc(CFG.WA_TEMPLATE || 'retomar_contato')}"</button>`}</div>`}
      ${cfgRobo().ativo ? `<div class="wa-janela ${roboEmSilencio(c) ? 'fechada' : 'ok'}">${roboEmSilencio(c)
        ? `👤 Equipe atendendo: o robô está quieto até ${new Date(c.humano_ate).toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR') ? '' : dataBR(c.humano_ate) + ' '}${hora(c.humano_ate)}. <button class="btn mini sec" data-robo-devolver="${c.wa_id}">Devolver ao robô</button>`
        : `🤖 O robô responde esta conversa. Ao enviar uma mensagem, você assume. <button class="btn mini sec" data-robo-assumir="${c.wa_id}">Assumir agora</button>`}</div>` : ''}
      ${faixaCadastro(c)}
      <div class="wa-msgs" id="waMsgs">${bolhas}</div>
      <div class="wa-compor">
        <div class="wa-rapidas"><select id="waRapida" title="Respostas rápidas"><option value="">⚡ Respostas rápidas</option>${RESPOSTAS_RAPIDAS.map(([r], i) => `<option value="${i}">${r}</option>`).join('')}</select>
          <button class="wa-ico" data-acao="outraVersao" title="Outra versão da última resposta rápida" ${S.ultRapida && S.ultRapida.wa === c.wa_id ? '' : 'disabled'}>${ICO.trocar}</button></div>
        <div class="wa-campo">
          <button class="wa-ico" data-acao="waAnexar" title="Enviar arquivo (relatório PDF, .PJC…)" ${aberta ? '' : 'disabled'}>${ICO.clipe}</button>
          <textarea id="waTexto" rows="1" placeholder="${aberta ? 'Escreva uma mensagem…' : 'Fora da janela de 24h: envie o modelo acima'}" ${aberta ? '' : 'disabled'}>${esc(S.rascunhos[c.wa_id] || '')}</textarea>
          <button class="wa-enviar" data-acao="waEnviar" title="Enviar (Enter) · Shift+Enter quebra linha" ${aberta ? '' : 'disabled'}>${ICO.enviar}</button>
        </div>
      </div>`;
  }
  const rb = cfgRobo();
  return `<div class="topo"><h1>WhatsApp</h1><div class="acoes">
    <div class="grupo-btn"><button class="btn sec" data-acao="configRespostas" title="Editar as respostas rápidas">⚡ Respostas</button><button class="btn sec" data-acao="configurarRobo" title="Atendimento automático">🤖 Robô <span class="ponto-st ${rb.ativo ? 'on' : ''}"></span></button><button class="btn sec" data-acao="testarRobo" title="Testar o robô">🧪</button></div>
    <button class="btn ouro" data-acao="novaConversa">+ Nova conversa</button></div></div>
  ${EVOLUTION() ? faixaConexao() : DEMO ? '' : (CFG.WA_ATIVO ? '' : '<div class="demo">O WhatsApp ainda não está conectado à API oficial. Veja o passo 5 do <b>COMO_ATIVAR.md</b>. Até lá, use o botão "Abrir no app ↗".</div>')}
  <div class="wa">
    <div class="wa-lista"><div class="wa-busca">${ICO.busca}<input id="buscaWa" placeholder="Buscar nome, número ou mensagem" value="${esc(S.buscaWa)}"></div>
      <div class="wa-filtros">${[['todas', 'Todas'], ['naolidas', `Não lidas${soma(S.wa_conversas, c => c.nao_lidas > 0 ? 1 : 0) ? ' · ' + soma(S.wa_conversas, c => c.nao_lidas > 0 ? 1 : 0) : ''}`], ['leads', 'Leads'], ['clientes', 'Clientes']].map(([k, v]) => `<button class="${k === fw ? 'on' : ''}" data-filtro-wa="${k}">${v}</button>`).join('')}</div>
      <div class="wa-itens">${convs.length ? convs.map(x => { const lx = leadDaConversa(x); return `<div class="wa-item ${x.wa_id === S.conversa ? 'on' : ''} ${x.nao_lidas ? 'nl' : ''}" data-conv="${x.wa_id}">
        ${avatar(x.nome || x.wa_id, x.wa_id)}<div class="wa-corpo">
        <div class="wa-l1"><b>${esc(x.nome || fmtTel(x.wa_id))}</b><span>${quandoCurto(x.ultima_msg_em)}</span></div>
        <div class="wa-l2"><span>${esc((x.ultima_msg || '').slice(0, 80))}</span>${x.nao_lidas ? `<i>${x.nao_lidas}</i>` : ''}</div>
        ${lx || x.cliente_id || x.bot_etapa ? `<div class="wa-l3">${x.cliente_id ? 'Cliente' : lx ? esc(STATUS_LEAD[lx.status]) : ''}${lx?.temperatura ? ' · ' + TEMPERATURAS[lx.temperatura] : ''}${cfgRobo().ativo && !x.cliente_id ? (roboEmSilencio(x) ? ' · 👤 equipe' : x.bot_etapa ? ' · 🤖 robô' : '') : ''}</div>` : ''}</div></div>`; }).join('') : `<div class="vazio">${q || fw !== 'todas' ? 'Nada neste filtro' : 'Nenhuma conversa ainda'}</div>`}</div>
    </div>
    <div class="wa-chat">${corpo}</div>
  </div>`;
}

/* editar as variações das respostas rápidas (separe as versões com uma linha ---) */
async function configRespostas() {
  const chaves = RESPOSTAS_RAPIDAS.filter(([, k]) => k !== '__apresentacao__');
  const v = await abrirForm('⚙ Respostas rápidas (variações)', [
    ...chaves.map(([rot, k], n) => ({ k, rot: `${rot} (${listaVariacoes(k).length} versões)${n === 0 ? ' · separe as versões com uma linha ---; marcadores {nome}, {valor}, {prazo}. A Apresentação é editada em Prospecção > ⚙ Mensagens' : ''}`, tipo: 'textarea', full: true }))
  ], Object.fromEntries(chaves.map(([, k]) => [k, listaVariacoes(k).join('\n---\n')])));
  if (!v) return;
  const novo = {};
  chaves.forEach(([, k]) => { const t = (v[k] || '').trim(); if (t && t !== (VARIACOES[k] || []).join('\n---\n')) novo[k] = t; });
  await seguro(async () => { await ajustesDb.salvar('respostas', novo); S.ajustes.respostas = novo; toast('Respostas rápidas salvas'); render(); });
}

/* conexão com a Evolution API (QR code) */
async function chamarConexao(acao, extra = {}) {
  const { data, error } = await sb.functions.invoke('whatsapp-conexao', { body: { acao, ...extra } });
  if (error) { let det = {}; try { det = await error.context.json(); } catch { } throw new Error(det.mensagem || error.message); }
  return data;
}
async function atualizarEstadoWa(silencioso) {
  if (!EVOLUTION()) return;
  try { const r = await chamarConexao('status'); S.waEstado = r.estado; S.waNumero = r.numero; S.waNome = r.nome; S.waErro = null; }
  catch (e) { S.waEstado = 'erro'; S.waErro = e.message; if (!silencioso) toast('WhatsApp: ' + e.message); }
  if (rota() === 'whatsapp' || rota() === 'painel') render();
}
function faixaConexao() {
  const st = S.waEstado;
  if (st === 'open') return `<div class="wa-conexao ok"><span>🟢 <b>WhatsApp conectado</b>${S.waNumero ? ` · ${esc(fmtTel(S.waNumero))}` : ''}${S.waNome ? ` (${esc(S.waNome)})` : ''}. As conversas chegam aqui e o app do celular continua funcionando.</span><button class="btn mini sec" data-acao="waDesconectar">Desconectar</button></div>`;
  if (st === undefined) return '<div class="wa-conexao"><span>Verificando a conexão do WhatsApp…</span></div>';
  if (st === 'erro') return `<div class="wa-conexao alerta"><span>⚠ Não foi possível falar com o servidor do WhatsApp: ${esc(S.waErro || '')}. Confira se a Evolution API está no ar e os Secrets no Supabase.</span><button class="btn mini sec" data-acao="waStatus">Tentar de novo</button></div>`;
  return `<div class="wa-conexao alerta"><span>📵 <b>WhatsApp desconectado.</b> Conecte o (21) 98770-8652 escaneando um QR code com o celular. Enquanto isso, os botões abrem o WhatsApp do aparelho.</span><button class="btn ouro" data-acao="waConectar">Conectar WhatsApp</button></div>`;
}
let qrTimer = null;
async function conectarWhatsapp(modo = 'qr', numero = '') {
  let f = $('#qrWa');
  if (!f) { f = document.createElement('div'); f.className = 'modal-fundo'; f.id = 'qrWa'; document.body.appendChild(f); f.addEventListener('click', e => { if (e.target === f) fecharQr(); }); }
  f.innerHTML = '<div class="modal qr-modal"><h2>Conectar WhatsApp</h2><div class="vazio">Gerando o código…</div></div>';
  try {
    const r = await chamarConexao(modo === 'codigo' ? 'codigo' : 'conectar', { numero });
    if (r.estado === 'open') { fecharQr(); toast('WhatsApp já está conectado'); return atualizarEstadoWa(true); }
    f.innerHTML = `<div class="modal qr-modal"><div class="linha" style="justify-content:space-between"><h2 style="margin:0">Conectar WhatsApp</h2><button class="btn mini sec" data-qr="fechar">Fechar</button></div>
      ${modo === 'codigo' && r.codigo ? `<p class="desc">No celular: WhatsApp Business > ⋮ > <b>Aparelhos conectados</b> > Conectar um aparelho > <b>Conectar com número de telefone</b> e digite:</p><div class="qr-codigo">${esc(r.codigo)}</div>`
        : r.qrcode ? `<ol class="qr-passos"><li>No celular, abra o <b>WhatsApp Business</b> do (21) 98770-8652</li><li>Toque em ⋮ (ou Configurações) > <b>Aparelhos conectados</b> > <b>Conectar um aparelho</b></li><li>Aponte a câmera para este código</li></ol><img class="qr-img" src="${r.qrcode}" alt="QR code para conectar o WhatsApp">`
        : '<div class="vazio">O servidor não devolveu o código. Tente de novo em alguns segundos.</div>'}
      <div class="linha" style="justify-content:space-between;margin-top:12px"><span class="desc">O código muda a cada ~40 segundos; esta tela atualiza sozinha.</span>
      ${modo === 'codigo' ? '<button class="btn mini sec" data-qr="qr">Usar QR code</button>' : '<button class="btn mini sec" data-qr="codigo">Estou no celular: conectar com código</button>'}</div></div>`;
    f.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => {
      if (b.dataset.qr === 'fechar') return fecharQr();
      if (b.dataset.qr === 'qr') return conectarWhatsapp('qr');
      const n = prompt('Número do WhatsApp que vai conectar (com DDD):', '21987708652'); if (n) conectarWhatsapp('codigo', n);
    });
    clearInterval(qrTimer); let voltas = 0;
    qrTimer = setInterval(async () => {
      voltas++;
      try {
        const st = await chamarConexao('status');
        if (st.estado === 'open') { fecharQr(); S.waEstado = 'open'; S.waNumero = st.numero; S.waNome = st.nome; toast('✅ WhatsApp conectado!'); render(); return; }
      } catch { }
      if (voltas % 10 === 0 && $('#qrWa')) conectarWhatsapp(modo, numero); // código novo a cada ~40s
      if (voltas > 75) fecharQr();
    }, 4000);
  } catch (e) { f.innerHTML = `<div class="modal qr-modal"><h2>Conectar WhatsApp</h2><p style="color:var(--crit)">${esc(e.message)}</p><div class="rodape"><button class="btn sec" onclick="document.getElementById('qrWa').remove()">Fechar</button></div></div>`; }
}
function fecharQr() { clearInterval(qrTimer); qrTimer = null; $('#qrWa')?.remove(); }

async function abrirConversa(waId) {
  S.conversa = waId;
  if (location.hash !== '#whatsapp') location.hash = '#whatsapp'; else render();
  await seguro(async () => {
    if (!S.wa_mensagens[waId]) { S.wa_mensagens[waId] = await db.listBy('wa_mensagens', 'wa_id', waId); }
    const c = S.wa_conversas.find(x => x.wa_id === waId);
    if (c && c.nao_lidas) await atualizar('wa_conversas', c.id, { nao_lidas: 0 });
    render();
  });
}
/* atendimento manual: abre o WhatsApp do celular/computador com a saudação pronta e registra o contato no CRM */
async function whatsManual(l) {
  const nome = (l.nome || '').split(' ').slice(0, 2).join(' ');
  const proc = l.numero_processo ? ` do processo ${l.numero_processo}` : '';
  const txt = `Olá, ${nome}! Aqui é da Pontes Ferreira Cálculos Judiciais. Recebemos seu pedido de cálculo${proc} e já vamos analisar. 😊`;
  window.open(waLink(l.whatsapp, txt), ALVO_WA);
  const agora = new Date().toISOString();
  await atualizar('leads', l.id, { ultimo_contato: agora, ...(l.respondido_em ? {} : { respondido_em: agora }) });
  await registrar(l.id, 'whatsapp', 'Contato pelo WhatsApp (app)', l.cliente_id || null);
  render(); if (fichaId) renderFicha();
}
async function excluirLead(id) {
  const l = S.leads.find(x => x.id === id); if (!l) return;
  const calcs = S.calculos.filter(c => c.lead_id === id).length;
  if (!confirm(`Excluir o lead "${l.nome || 'sem nome'}"?${calcs ? `\n\nOs ${calcs} cálculo(s) ligados a ele continuam cadastrados.` : ''}\nO histórico do lead também é apagado. Esta ação não pode ser desfeita.`)) return;
  await seguro(async () => {
    await apagar('leads', id);
    S.atividades = S.atividades.filter(a => a.lead_id !== id);
    S.wa_conversas.forEach(c => { if (c.lead_id === id) c.lead_id = null; });
    S.calculos.forEach(c => { if (c.lead_id === id) c.lead_id = null; });
    if (fichaId === id) fecharFicha();
    toast('Lead excluído'); render();
  });
}
async function abrirNoPainel(num, nome, texto = '', vinc = {}) {
  let wa = digitos(num); if (wa.length <= 11) wa = '55' + wa;
  if (wa.length < 12) return toast('Número inválido');
  await seguro(async () => {
    let c = S.wa_conversas.find(x => x.wa_id === wa);
    if (!c) c = await criar('wa_conversas', { wa_id: wa, nome: nome || fmtTel(wa), lead_id: vinc.lead_id || null, cliente_id: vinc.cliente_id || null, nao_lidas: 0 });
    if (texto) S.rascunhos[wa] = texto;
    fecharFicha();
    await abrirConversa(wa);
    setTimeout(() => { const t = $('#waTexto'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 150);
  });
}
async function conversaParaLead(l) {
  if (!WA_PAINEL() || (EVOLUTION() && S.waEstado !== 'open')) return whatsManual(l);
  let c = conversaDoLead(l);
  if (!c) {
    let wa = digitos(l.whatsapp); if (wa.length <= 11) wa = '55' + wa;
    c = S.wa_conversas.find(x => x.wa_id === wa) || await criar('wa_conversas', { wa_id: wa, nome: l.nome, lead_id: l.id, cliente_id: l.cliente_id || null, nao_lidas: 0 });
  }
  if (!l.respondido_em && !S.rascunhos[c.wa_id]) {
    const nome = (l.nome || '').split(' ').slice(0, 2).join(' ');
    S.rascunhos[c.wa_id] = `Olá, ${nome}! Aqui é da Pontes Ferreira Cálculos Judiciais. Recebemos seu pedido de cálculo${l.numero_processo ? ` do processo ${l.numero_processo}` : ''} e já vamos analisar. 😊`;
  }
  fecharFicha();
  abrirConversa(c.wa_id);
}
async function novaConversa() {
  const contatos = [
    ...S.clientes.filter(c => c.whatsapp).map(c => ['cli:' + c.id, `${c.nome} (cliente)`]),
    ...S.leads.filter(l => l.whatsapp && !l.cliente_id).map(l => ['lead:' + l.id, `${l.nome || l.whatsapp} (lead · ${STATUS_LEAD[l.status]})`])
  ];
  const v = await abrirForm('Nova conversa', [
    { k: 'contato', rot: 'Contato já cadastrado', tipo: 'select', opcoes: contatos, full: true },
    { k: 'numero', rot: 'Ou digite o número', ph: '(21) 99999-9999' }, { k: 'nome', rot: 'Nome (se for número novo)' }
  ]);
  if (!v) return;
  await seguro(async () => {
    let lead = null, cli = null, num = v.numero, nome = v.nome;
    if (v.contato) { const [t, id] = v.contato.split(':'); if (t === 'cli') { cli = cliente(id); num = cli.whatsapp; nome = cli.nome; } else { lead = S.leads.find(x => x.id === id); num = lead.whatsapp; nome = lead.nome; } }
    let wa = digitos(num); if (wa.length <= 11) wa = '55' + wa;
    if (wa.length < 12) return toast('Número inválido');
    let c = S.wa_conversas.find(x => x.wa_id === wa);
    if (!c) c = await criar('wa_conversas', { wa_id: wa, nome: nome || fmtTel(wa), lead_id: lead?.id || null, cliente_id: cli?.id || lead?.cliente_id || null, nao_lidas: 0 });
    abrirConversa(wa);
  });
}
// Nome usado nas respostas rápidas: só nome de pessoa. Nome de escritório/empresa ("Especialistas em Direito…",
// "Saraiva e Almeida Advogados", "Dra. Ingrid | Advogada") não entra, e a mensagem sai sem nome ("Olá!").
function nomeParaMensagem(n) {
  let t = String(n || '').split(/[|(\-–,]/)[0].replace(/^(dra?\.?|dr\.?|doutora?)\s+/i, '').trim();
  if (!t || /advoga|advocacia|escrit[oó]rio|sociedade|associad|consultori|jur[ií]dic|direito|especialist|c[aá]lculo|empresa|ltda|\bme\b|eireli|&|\d|@/i.test(t)) return '';
  const p = t.split(/\s+/); if (p.length > 3) return '';
  return (p[1] && !/^(d[aeo]s?|em|e)$/i.test(p[1]) ? p.slice(0, 2) : p.slice(0, 1)).join(' ');
}
// sem nome: "Olá, {nome}!" → "Olá!", "Perfeito, {nome}, obrigado!" → "Perfeito, obrigado!"
const tirarNome = t => t.replace(/,\s*\{nome\}/g, '').replace(/\{nome\},?\s*/g, '');
function preencherRapida(i) {
  const c = convAtiva(), l = leadDaConversa(c);
  const calc = l ? S.calculos.filter(x => x.lead_id === l.id || (l.cliente_id && x.cliente_id === l.cliente_id)).sort((a, b) => (b.data_entrada || '').localeCompare(a.data_entrada || ''))[0] : null;
  const nome = nomeParaMensagem(c && c.nome);
  const chave = RESPOSTAS_RAPIDAS[i][1];
  S.ultRapida = { wa: c.wa_id, i };
  if (chave === '__apresentacao__') {
    const prosp = S.prospects.find(p => p.whatsapp && digitos(p.whatsapp).slice(-9) === digitos(c.wa_id).slice(-9));
    S.rascunhos[c.wa_id] = textoProsp(prosp || { nome: c.nome || '' }, 'primeiro'); render();
    const t = $('#waTexto'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    return;
  }
  const lista = listaVariacoes(chave), modelo = lista[sortearVariacao('rap_' + chave, lista.length)];
  const txt = (nome ? modelo : tirarNome(modelo)).replace(/\{nome\}/g, () => nome).replace(/\{valor\}/g, ((calc && calc.valor_cobrado) || (l && l.valor_orcado) || 250).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
    .replace(/\{prazo\}/g, calc && calc.prazo_entrega ? dataBR(calc.prazo_entrega) : 'em até 48h');
  S.rascunhos[c.wa_id] = txt; render();
  const t = $('#waTexto'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
}
async function waEnviar(opts) {
  const c = convAtiva(); if (!c) return;
  const l = leadDaConversa(c);
  let msg;
  if (DEMO) {
    if (!opts.template && !janelaAberta(c)) return toast('Fora da janela de 24h: envie o modelo.');
    msg = await db.insert('wa_mensagens', { wa_id: c.wa_id, direcao: 'out', tipo: opts.template ? 'template' : opts.arquivo_nome ? 'document' : 'text', texto: opts.template ? `[modelo: ${opts.template}]` : (opts.texto || ''), arquivo_path: opts.arquivo_path || null, arquivo_nome: opts.arquivo_nome || null, status: 'sent' });
  } else {
    const { data, error } = await sb.functions.invoke('whatsapp-enviar', { body: { wa_id: c.wa_id, nome: c.nome, lead_id: c.lead_id, ...opts } });
    if (error) { let det = {}; try { det = await error.context.json(); } catch { } throw new Error(det.mensagem || error.message); }
    msg = data.mensagem;
  }
  const lista = (S.wa_mensagens[c.wa_id] = S.wa_mensagens[c.wa_id] || []);
  if (!lista.some(x => x.id === msg.id)) lista.push(msg); // o tempo real pode já ter mostrado
  if (S.prospPendente && digitos(c.wa_id).slice(-8) === S.prospPendente.chave) { // abordagem de prospecção enviada: agora conta
    const pr = S.prospects.find(x => x.id === S.prospPendente.id); S.prospPendente = null;
    if (pr) await marcarContatado(pr).catch(e => console.warn('prospecção', e));
  }
  const resumo = msg.tipo === 'document' ? `📎 ${msg.arquivo_nome}` : msg.texto;
  await atualizar('wa_conversas', c.id, { ultima_msg: (resumo || '').slice(0, 200), ultima_msg_em: msg.created_at, nao_lidas: 0, humano_ate: new Date(Date.now() + (Number(cfgRobo().pausa_horas) || 12) * 36e5).toISOString(), bot_etapa: 'humano' });
  if (l) {
    const patch = { ultimo_contato: new Date().toISOString() };
    if (!l.respondido_em) patch.respondido_em = patch.ultimo_contato;
    await atualizar('leads', l.id, patch);
  }
  render();
}
let waEnviando = false;
async function waEnviarTexto() {
  if (waEnviando) return; // Enter apertado duas vezes não envia em dobro
  const c = convAtiva(), t = $('#waTexto'); if (!c || !t) return;
  const texto = t.value.trim(); if (!texto) return;
  const btn = $('[data-acao=waEnviar]'); if (btn) btn.disabled = true;
  waEnviando = true;
  try { await seguro(async () => { await waEnviar({ texto }); S.rascunhos[c.wa_id] = ''; render(); $('#waTexto')?.focus(); }); }
  finally { waEnviando = false; const b = $('[data-acao=waEnviar]'); if (b) b.disabled = false; }
}
function waAnexar() {
  const c = convAtiva(); if (!c) return;
  const inp = document.createElement('input'); inp.type = 'file';
  inp.onchange = () => seguro(async () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 50 * 1048576) return toast('Arquivo maior que 50 MB');
    toast(`Enviando ${f.name}…`);
    const path = await db.upload(`enviados/${c.wa_id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`, f);
    const legenda = ($('#waTexto')?.value || '').trim();
    await waEnviar({ arquivo_path: path, arquivo_nome: f.name, texto: legenda });
    S.rascunhos[c.wa_id] = ''; render();
  });
  inp.click();
}

/* ---------------- Atendimento automático (robô) ---------------- */
const ROBO_ROTULOS = {
  boas_vindas: 'Boas-vindas (primeira mensagem)', menu: 'Menu de opções', orcamento: 'Opção 1 · pedir o processo', recebido: 'Processo recebido (no horário)',
  recebido_fora: 'Processo recebido (fora do horário)', precos: 'Opção 2 · preços e prazos', atendente: 'Opção 4 · chamar a equipe (no horário)',
  atendente_fora: 'Opção 4 · chamar a equipe (fora do horário)', nao_entendi: 'Quando não entende', aguardando: 'Esperando o processo',
  arquivo_nao_pdf: 'Recebeu arquivo que não é PDF', sem_calculo: 'Opção 3 · nenhum cálculo em andamento'
};
const cfgRobo = () => ({ ...ROBO_PADRAO, ...(S.ajustes.atendimento || {}) });
const roboEmSilencio = c => c && c.humano_ate && new Date(c.humano_ate).getTime() > Date.now();
async function configurarRobo() {
  const c = cfgRobo(), tx = { ...ROBO_TEXTOS, ...(c.textos || {}) };
  const v = await abrirForm('🤖 Atendimento automático', [
    { k: 'ativo', rot: 'Robô ligado (responde sozinho quem escrever no WhatsApp)', tipo: 'checkbox', full: true },
    { k: 'dias', rot: 'Dias de atendimento da equipe', tipo: 'select', opcoes: [['seg-sex', 'Segunda a sexta'], ['seg-sab', 'Segunda a sábado']], vazio: false },
    { k: 'pausa_horas', rot: 'Depois que a equipe responde, o robô fica quieto por (horas)', tipo: 'number' },
    { k: 'inicio', rot: 'Abre às', tipo: 'time' }, { k: 'fim', rot: 'Fecha às', tipo: 'time' },
    { k: 'sabado_inicio', rot: 'Sábado abre às (opcional)', tipo: 'time' }, { k: 'sabado_fim', rot: 'Sábado fecha às (opcional)', tipo: 'time' },
    { k: 'responder_clientes', rot: 'Responder também quem já é cliente (senão, cliente fala direto com a equipe)', tipo: 'checkbox', full: true },
    ...Object.entries(ROBO_ROTULOS).map(([k, rot]) => ({ k: 't_' + k, rot: `Texto · ${rot}`, tipo: 'textarea', full: true }))
  ], { ...c, ...Object.fromEntries(Object.entries(tx).map(([k, val]) => ['t_' + k, val])) });
  if (!v) return;
  const textos = {};
  Object.keys(ROBO_ROTULOS).forEach(k => { const val = v['t_' + k]; if (val && val !== ROBO_TEXTOS[k]) textos[k] = val; delete v['t_' + k]; });
  const novo = { ...ROBO_PADRAO, ...v, pausa_horas: v.pausa_horas || 12, textos };
  await seguro(async () => { await ajustesDb.salvar('atendimento', novo); S.ajustes.atendimento = novo; toast(novo.ativo ? 'Robô LIGADO' : 'Robô desligado'); render(); });
}
async function roboAssumir(waId, assumir) {
  const c = S.wa_conversas.find(x => x.wa_id === waId); if (!c) return;
  const patch = assumir ? { humano_ate: new Date(Date.now() + (Number(cfgRobo().pausa_horas) || 12) * 36e5).toISOString(), bot_etapa: 'humano' } : { humano_ate: null, bot_etapa: null };
  await seguro(async () => { await atualizar('wa_conversas', c.id, patch); toast(assumir ? 'Você assumiu a conversa; o robô fica quieto' : 'Conversa devolvida ao robô'); render(); });
}
/* simulador: conversa de teste no próprio painel, sem enviar nada para o WhatsApp */
const SIM = { etapa: null, msgs: [], nome: 'Dra. Teste' };
function simular(entrada) {
  const c = cfgRobo();
  SIM.msgs.push({ dir: 'in', texto: entrada.texto || `📎 ${entrada.arquivo}` });
  if (SIM.etapa === 'humano') { SIM.msgs.push({ dir: 'info', texto: 'Robô em silêncio: a conversa foi passada para a equipe. Clique em "Recomeçar" para testar de novo.' }); return renderSimulador(); }
  const r = roboDecidir({ etapa: SIM.etapa, tipo: entrada.tipo || 'text', texto: entrada.texto || '', ehPdf: !!entrada.pdf, nome: SIM.nome, cfg: c,
    foraHorario: SIM.fora ?? roboForaDoHorario(c, roboAgoraSP()), calculos: S.calculos.slice(0, 2) });
  r.respostas.forEach(t => SIM.msgs.push({ dir: 'out', texto: t }));
  if (r.numero) SIM.msgs.push({ dir: 'info', texto: `Nº do processo ${r.numero} seria gravado no lead.` });
  if (r.humano) SIM.msgs.push({ dir: 'info', texto: `👤 Passou para a equipe: o lead aparece no painel e o robô fica quieto por ${c.pausa_horas || 12}h.` });
  SIM.etapa = r.etapa; renderSimulador();
}
const fmtWa = t => esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
function renderSimulador() {
  let f = $('#simulador');
  if (!f) { f = document.createElement('div'); f.className = 'modal-fundo'; f.id = 'simulador'; document.body.appendChild(f); f.addEventListener('click', e => { if (e.target === f) f.remove(); }); }
  const c = cfgRobo(), fora = SIM.fora ?? roboForaDoHorario(c, roboAgoraSP());
  f.innerHTML = `<div class="modal" style="width:min(460px,100%);display:flex;flex-direction:column;gap:10px">
    <div class="linha" style="justify-content:space-between"><h2 style="margin:0">🧪 Testar o robô</h2><button class="btn mini sec" data-sim="fechar">Fechar</button></div>
    <div class="desc">Simulação: nada é enviado. Você é o cliente "${esc(SIM.nome)}". ${c.ativo ? '' : '<b>O robô está desligado</b>: ligue em "Atendimento automático" para valer de verdade.'}</div>
    <div class="linha"><label class="linha"><input type="checkbox" data-sim="fora" ${fora ? 'checked' : ''}> Simular fora do horário</label></div>
    <div class="wa-msgs" id="simMsgs" style="height:360px;flex:none">${SIM.msgs.length ? SIM.msgs.map(m => m.dir === 'info' ? `<div class="sim-info">${esc(m.texto)}</div>` : `<div class="wa-msg ${m.dir}">${m.dir === 'out' ? '<span class="wa-bot">🤖 robô</span>' : ''}<div>${fmtWa(m.texto)}</div></div>`).join('') : '<div class="vazio">Escreva como se fosse um cliente (ex.: "Boa tarde", "1", "quanto custa?")</div>'}</div>
    <form class="linha" id="simForm"><input class="f" id="simTexto" style="flex:1" placeholder="Mensagem do cliente…" autocomplete="off"><button class="btn">Enviar</button></form>
    <div class="linha"><button class="btn mini sec" data-sim="pdf">📎 Mandar PDF de teste</button><button class="btn mini sec" data-sim="foto">🖼 Mandar foto</button><button class="btn mini sec" data-sim="num">Nº de processo</button><button class="btn mini sec" data-sim="reset" style="margin-left:auto">Recomeçar</button></div></div>`;
  $('#simForm').onsubmit = e => { e.preventDefault(); const t = $('#simTexto').value.trim(); if (t) simular({ texto: t }); };
  f.querySelectorAll('[data-sim]').forEach(b => b.addEventListener(b.type === 'checkbox' ? 'change' : 'click', () => {
    const a = b.dataset.sim;
    if (a === 'fechar') return f.remove();
    if (a === 'fora') { SIM.fora = b.checked; return; }
    if (a === 'reset') { SIM.etapa = null; SIM.msgs = []; return renderSimulador(); }
    if (a === 'pdf') return simular({ tipo: 'document', pdf: true, arquivo: 'processo_integral.pdf' });
    if (a === 'foto') return simular({ tipo: 'image', arquivo: 'foto.jpg' });
    if (a === 'num') return simular({ texto: '0020521-60.2026.5.04.0731' });
  }));
  const box = $('#simMsgs'); box.scrollTop = box.scrollHeight;
  setTimeout(() => $('#simTexto')?.focus(), 20);
}

function telaCalculos() {
  const filtros = { abertos: 'Em aberto', atrasados: 'Atrasados', entregues: 'Entregues', receber: 'Entregues não pagos', todos: 'Todos' };
  const q = S.busca.toLowerCase();
  let lista = S.calculos.filter(c => ({
    abertos: c.status !== 'entregue', atrasados: atrasado(c), entregues: c.status === 'entregue', receber: c.status === 'entregue' && !c.pago, todos: true
  })[S.filtroCalc]);
  if (q) lista = lista.filter(c => [c.numero_processo, digitos(c.numero_processo), c.reclamante, c.reclamada, cliente(c.cliente_id)?.nome, c.tipo].join(' ').toLowerCase().includes(q));
  lista.sort((a, b) => S.filtroCalc === 'abertos' || S.filtroCalc === 'atrasados' ? (a.prazo_entrega || '9').localeCompare(b.prazo_entrega || '9') : (b.data_entrada || '').localeCompare(a.data_entrada || ''));
  return `<div class="topo"><h1>Cálculos</h1><div class="acoes">
    <input class="f" id="busca" placeholder="Buscar processo, parte, cliente…" value="${esc(S.busca)}" style="width:240px">
    <select class="f" id="filtroCalc">${Object.entries(filtros).map(([k, v]) => `<option value="${k}" ${k === S.filtroCalc ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <button class="btn sec" data-acao="importarPJC" title="Selecione os arquivos .PJC gerados no PJe-Calc">Importar .PJC</button>
    <button class="btn" data-acao="novoCalculo">+ Cálculo</button></div></div>
  <div class="card"><div class="tabela">${lista.length ? `<table><tr><th>Entrada</th><th>Processo</th><th>Cliente</th><th>Tipo</th><th class="n">Autores</th><th>Prazo</th><th>Status</th><th class="n">Valor</th><th>Pago</th></tr>
  ${lista.map(c => `<tr class="clic" data-calc="${c.id}"><td>${dataBR(c.data_entrada)}</td><td>${esc(c.numero_processo || '—')}${c.arquivo_path ? ` <button class="btn mini sec" data-pdf="${esc(c.arquivo_path)}">PDF</button>` : ''} <button class="btn mini sec" data-entregas="${c.id}" title="Arquivos que o cliente baixa no portal">📎 ${(c.arquivos || []).length || ''}</button></td>
    <td>${esc(cliente(c.cliente_id)?.nome || '—')}</td><td>${esc(c.tipo || '—')}</td><td class="n">${c.autores || 1}</td>
    <td>${dataBR(c.prazo_entrega)}</td><td>${tagStatus(c)}</td>
    <td class="n">${c.valor_cobrado == null ? '<span class="tag t-warn">definir</span>' : brl(c.valor_cobrado)}</td>
    <td>${c.status === 'entregue' ? (c.pago ? '<span class="tag t-good">✔ Pago</span>' : `<button class="btn mini sec" data-pagar="${c.id}">Marcar pago</button>`) : '—'}</td></tr>`).join('')}</table>
  <p style="color:var(--muted);font-size:12px;margin-top:8px">${lista.length} cálculo(s) · ${brl(soma(lista, c => c.valor_cobrado))}</p>` : '<div class="vazio">Nenhum cálculo neste filtro</div>'}</div></div>`;
}

function telaClientes() {
  const linhas = S.clientes.map(c => {
    const cs = S.calculos.filter(x => x.cliente_id === c.id);
    return { c, n: cs.length, fat: soma(cs.filter(x => x.status === 'entregue'), x => x.valor_cobrado), ult: cs.map(x => x.data_entrada).sort().pop(), aberto: soma(cs.filter(x => x.status === 'entregue' && !x.pago), x => x.valor_cobrado) };
  }).sort((a, b) => b.fat - a.fat);
  return `<div class="topo"><h1>Clientes</h1><div class="acoes"><button class="btn" data-acao="novoCliente">+ Cliente</button></div></div>
  <div class="card"><div class="tabela">${linhas.length ? `<table><tr><th>Cliente</th><th>WhatsApp</th><th>OAB</th><th>Cidade</th><th>Origem</th><th class="n">Cálculos</th><th class="n">Faturado</th><th class="n">Em aberto</th><th>Último</th><th></th></tr>
  ${linhas.map(({ c, n, fat, ult, aberto }) => `<tr class="clic" data-cliente="${c.id}"><td><b>${esc(c.nome)}</b></td><td>${waBotao(c.whatsapp, { classe: 'link-wa', nome: c.nome, cliente_id: c.id, rotulo: esc(c.whatsapp), vazio: '—' })}</td>
  <td>${esc(c.oab || '—')}</td><td>${esc(c.cidade || '—')}</td><td>${esc(c.origem || '—')}</td><td class="n">${n}</td><td class="n">${brl(fat)}</td><td class="n">${aberto ? brl(aberto) : '—'}</td><td>${dataBR(ult)}</td><td><button class="btn mini sec" data-portal="${c.id}" title="Link do painel do cliente">🔗 Portal</button></td></tr>`).join('')}</table>` : '<div class="vazio">Nenhum cliente ainda. Eles são criados ao converter um lead em cálculo.</div>'}</div></div>`;
}

function telaFinanceiro() {
  const abaFin = `<div class="seg" style="margin-bottom:16px">${[['geral', 'Visão geral'], ['caixa', 'Fluxo de caixa']].map(([k, v]) => `<button class="${(S.abaFin || 'geral') === k ? 'on' : ''}" data-aba-fin="${k}">${v}</button>`).join('')}</div>`;
  if (S.abaFin === 'caixa') return `<div class="topo"><h1>Financeiro</h1><div class="acoes"><button class="btn" data-acao="novaDespesa">+ Despesa / anúncio</button></div></div>${abaFin}${telaFluxoCaixa()}`;
  const m = metricas();
  const porCanal = CANAIS.map(k => {
    const leads = m.leadsP.filter(l => canalLead(l) === k);
    const clis = S.clientes.filter(c => c.origem === k).map(c => c.id);
    const fat = soma(m.saidasP.filter(c => clis.includes(c.cliente_id)), c => c.valor_cobrado);
    const gasto = soma(m.despesasP.filter(d => d.canal === k), d => d.valor);
    const novos = m.clientesNovos.filter(c => c.origem === k).length;
    return { k, leads: leads.length, fech: leads.filter(l => l.status === 'fechado').length, novos, fat, gasto };
  }).filter(r => r.leads || r.fat || r.gasto);
  const cobrar = [...m.aReceberLista].sort((a, b) => (a.data_entrega || '').localeCompare(b.data_entrega || ''));
  return `<div class="topo"><h1>Financeiro</h1><div class="acoes">${seletorPeriodo()}<button class="btn" data-acao="novaDespesa">+ Despesa / anúncio</button></div></div>
  ${abaFin}
  <div class="kpis">
    ${kpi('Faturado', brl0(m.faturado), 'cálculos entregues')}
    ${kpi('Recebido', brl0(m.recebido), 'pagamentos no período')}
    ${kpi('A receber', brl0(m.aReceber), `${cobrar.length} cálculo(s) entregues`, cobrar.some(c => difDias(c.data_entrega, hoje()) > 7))}
    ${kpi('Despesas', brl0(m.gastoTotal), `anúncios: ${brl0(m.gastoAds)}`)}
    ${kpi('Resultado', brl0(m.recebido - m.gastoTotal), 'recebido − despesas', m.recebido - m.gastoTotal < 0)}
  </div>
  <div class="grade">
    <div class="card larga"><h2>Retorno por canal</h2><div class="desc">${PERIODOS[S.periodo]} · faturamento dos clientes que vieram de cada canal</div>
    ${porCanal.length ? `<div class="tabela"><table><tr><th>Canal</th><th class="n">Leads</th><th class="n">Fechados</th><th class="n">Conversão</th><th class="n">Investido</th><th class="n">Custo por lead</th><th class="n">CAC</th><th class="n">Faturado</th><th class="n">Retorno</th></tr>
    ${porCanal.map(r => `<tr><td>${esc(r.k)}</td><td class="n">${r.leads}</td><td class="n">${r.fech}</td><td class="n">${r.leads ? pct(r.fech / r.leads) : '—'}</td><td class="n">${r.gasto ? brl0(r.gasto) : '—'}</td>
    <td class="n">${r.gasto && r.leads ? brl0(r.gasto / r.leads) : '—'}</td><td class="n">${r.gasto && r.novos ? brl0(r.gasto / r.novos) : '—'}</td><td class="n">${brl0(r.fat)}</td><td class="n">${r.gasto ? (r.fat / r.gasto).toFixed(1).replace('.', ',') + 'x' : '—'}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Sem dados no período</div>'}</div>
    <div class="card"><h2>A receber</h2><div class="desc">Entregues e ainda não pagos, mais antigos primeiro</div>
    ${cobrar.length ? `<div class="tabela"><table><tr><th>Entregue</th><th>Cliente</th><th class="n">Valor</th><th></th></tr>
    ${cobrar.map(c => { const cl = cliente(c.cliente_id); const d = difDias(c.data_entrega, hoje()); return `<tr><td>${dataBR(c.data_entrega)} ${d > 7 ? `<span class="tag t-crit">${d} dias</span>` : ''}</td><td>${esc(cl?.nome || '—')}</td><td class="n">${c.valor_cobrado == null ? '—' : brl(c.valor_cobrado)}</td>
      <td style="white-space:nowrap">${waBotao(cl?.whatsapp, { nome: cl?.nome, cliente_id: cl?.id, rotulo: 'Cobrar', texto: `Olá, ${cl?.nome}! Tudo bem? Passando para lembrar do pagamento do cálculo do processo ${c.numero_processo || ''}, no valor de ${brl(c.valor_cobrado)}. Obrigado!` })} <button class="btn mini" data-pagar="${c.id}">Pago</button></td></tr>`; }).join('')}</table></div>` : '<div class="vazio">Nada a receber 🎉</div>'}</div>
    <div class="card"><h2>Despesas</h2><div class="desc">${PERIODOS[S.periodo]}</div>
    ${m.despesasP.length ? `<div class="tabela"><table><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="n">Valor</th></tr>
    ${[...m.despesasP].sort((a, b) => b.data.localeCompare(a.data)).map(d => `<tr class="clic" data-despesa="${d.id}"><td>${dataBR(d.data)}</td><td>${esc(d.canal)}</td><td>${esc(d.descricao || '')}</td><td class="n">${brl(d.valor)}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Nenhuma despesa lançada</div>'}</div>
  </div>`;
}

/* ---------------- Mapa do Brasil (demanda por estado e cidade) ---------------- */
// grid de quadrados: cada estado do mesmo tamanho, na posição aproximada do mapa
const UF_GRID = {
  RR: [2, 0], AP: [4, 0], AM: [2, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [1, 2], RO: [2, 2], MT: [3, 2], TO: [4, 2], PI: [5, 2], PB: [6, 2],
  MS: [2, 3], GO: [3, 3], DF: [4, 3], BA: [5, 3], PE: [6, 3],
  SP: [3, 4], MG: [4, 4], ES: [5, 4], AL: [6, 4],
  PR: [3, 5], RJ: [4, 5], SE: [6, 5], SC: [3, 6], RS: [3, 7]
};
const UF_NOME = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
const UF_CAPITAL = { AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus', BA: 'Salvador', CE: 'Fortaleza', DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande', MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba', PE: 'Recife', PI: 'Teresina', RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista', SC: 'Florianópolis', SP: 'São Paulo', SE: 'Aracaju', TO: 'Palmas' };
const UF_TRT = { RJ: 1, SP: 2, MG: 3, RS: 4, BA: 5, PE: 6, CE: 7, PA: 8, AP: 8, PR: 9, DF: 10, TO: 10, AM: 11, RR: 11, SC: 12, PB: 13, RO: 14, AC: 14, MA: 16, ES: 17, GO: 18, AL: 19, SE: 20, RN: 21, PI: 22, MT: 23, MS: 24 };
// escala sequencial de um tom (azul): claro = pouco, escuro = muito; cinza = sem dados
const RAMPA_MAPA = ['#cde2fb', '#9ec5f4', '#5598e7', '#256abf', '#0d366b'];
const METRICAS_MAPA = {
  visitas: ['Visitas ao site', 'pessoas que abriram o site'], whatsapp: ['Cliques no WhatsApp', 'botões de WhatsApp do site'],
  pedidos: ['Pedidos pelo site', 'formulários enviados'], leads: ['Leads', 'leads no CRM (todas as origens)'],
  clientes: ['Clientes', 'clientes cadastrados'], prospects: ['Prospecção', 'contatos na lista de prospecção']
};
const ufDe = txt => { const m = String(txt || '').toUpperCase().match(/(?:\/|-|,|\s)\s*([A-Z]{2})\s*$/); return m && UF_NOME[m[1]] ? m[1] : null; };

/* busca o resumo agregado no banco (ou gera um de exemplo no modo demonstração) */
async function carregarMapa(forcar) {
  const ini = inicioPeriodo();
  if (!forcar && S.mapa && S.mapa.ini === ini) return;
  S.mapa = { ini, carregando: true, dados: null };
  try {
    let dados;
    if (DEMO) dados = demoMapa();
    else {
      const { data, error } = await sb.rpc('resumo_eventos', { desde: ini + 'T00:00:00-03:00' });
      if (error) throw error; dados = data || {};
    }
    S.mapa = { ini, carregando: false, dados };
  } catch (e) { console.warn('mapa', e); S.mapa = { ini, carregando: false, dados: null, erro: e.message || String(e) }; }
  if (rota() === 'mapa' || rota() === 'painel') render();
}
function demoMapa() {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const peso = { SP: 30, RJ: 26, MG: 14, RS: 8, PR: 7, BA: 6, PE: 5, SC: 4, DF: 4, GO: 4, CE: 4, ES: 3, PA: 2, AM: 2, MA: 2, MT: 2, MS: 2, PB: 1.5, RN: 1.2, AL: 1, SE: 1, PI: 1, RO: .6, TO: .5, AC: .3, AP: .2, RR: .2 };
  const por_uf = Object.entries(peso).map(([uf, p]) => { const v = Math.round(p * (6 + rnd() * 4)); return { uf, visitas: v, whatsapp: Math.round(v * (.08 + rnd() * .1)), cliques: Math.round(v * 1.8), pedidos: Math.round(v * (.03 + rnd() * .05)) }; });
  const cidades = [['SP', 'São Paulo'], ['RJ', 'Rio de Janeiro'], ['RJ', 'Niterói'], ['MG', 'Belo Horizonte'], ['SP', 'Campinas'], ['RS', 'Porto Alegre'], ['PR', 'Curitiba'], ['RJ', 'Duque de Caxias'], ['BA', 'Salvador'], ['PE', 'Recife'], ['DF', 'Brasília'], ['SP', 'Santos'], ['CE', 'Fortaleza'], ['GO', 'Goiânia'], ['RJ', 'Nova Iguaçu']];
  const por_cidade = cidades.map(([uf, cidade], i) => { const v = Math.round((60 - i * 3.5) * (0.8 + rnd() * .4)); return { uf, cidade, visitas: v, whatsapp: Math.round(v * .12), pedidos: Math.round(v * .05) }; });
  const alvos = [['/', 'hero', 'Enviar e receber orçamento', 'clique', 96], ['/', 'hero', 'form_numero', 'clique', 71], ['/', '', 'flutuante', 'whatsapp', 64], ['/', 'precos', 'plano_avulso', 'whatsapp', 38], ['/', 'hero', '🔢 Informar o nº', 'clique', 52], ['/', 'header', 'header', 'whatsapp', 21], ['/', 'faq', 'Quanto custa?', 'clique', 33], ['/portfolio.html', 'hero', 'Enviar um processo para orçamento', 'clique', 18], ['/', 'precos', 'plano_pacote', 'whatsapp', 12], ['/', 'final', 'final', 'whatsapp', 15]]
    .map(([pagina, secao, alvo, tipo, n]) => ({ pagina, secao, alvo, tipo, n }));
  return {
    por_uf, por_cidade, alvos, fora_br: 6,
    origens: [['google', 312], ['direto', 140], ['meta', 98], ['instagram', 41], ['prospeccao', 37], ['jusbrasil.com.br', 12]].map(([origem, sessoes]) => ({ origem, sessoes })),
    dispositivos: [{ dispositivo: 'celular', sessoes: 402 }, { dispositivo: 'computador', sessoes: 238 }],
    paginas: [{ pagina: '/', sessoes: 590 }, { pagina: '/portfolio.html', sessoes: 61 }, { pagina: '/privacidade.html', sessoes: 9 }],
    rolagem: [['25%', 560], ['50%', 410], ['75%', 260], ['100%', 150]].map(([alvo, sessoes]) => ({ alvo, sessoes }))
  };
}

/* junta o que veio do site (eventos) com o que está no painel (leads, clientes, prospecção) */
function dadosPorUF() {
  const d = S.mapa?.dados || {}, ini = inicioPeriodo(), por = {};
  Object.keys(UF_NOME).forEach(uf => por[uf] = { uf, visitas: 0, whatsapp: 0, cliques: 0, pedidos: 0, leads: 0, clientes: 0, prospects: 0, fechados: 0 });
  (d.por_uf || []).forEach(r => { if (por[r.uf]) Object.assign(por[r.uf], { visitas: r.visitas, whatsapp: r.whatsapp, cliques: r.cliques, pedidos: r.pedidos }); });
  S.leads.filter(l => noPeriodo(l.created_at, ini)).forEach(l => { const uf = (l.uf || '').toUpperCase() || ufDe(cliente(l.cliente_id)?.cidade); if (por[uf]) { por[uf].leads++; if (l.status === 'fechado') por[uf].fechados++; } });
  S.clientes.forEach(c => { const uf = ufDe(c.cidade); if (por[uf]) por[uf].clientes++; });
  S.prospects.forEach(p => { const uf = ufDe(p.cidade); if (por[uf]) por[uf].prospects++; });
  return por;
}
function corMapa(v, max) {
  if (!v) return { bg: '#f0efec', fg: 'var(--muted)' };
  const i = Math.min(RAMPA_MAPA.length - 1, Math.floor(Math.sqrt(v / max) * RAMPA_MAPA.length - 1e-9)); // raiz: separa melhor os estados médios
  return { bg: RAMPA_MAPA[i], fg: i >= 2 ? '#fff' : 'var(--ink)' };
}
function mapaBrasil(por, metrica) {
  const max = Math.max(1, ...Object.values(por).map(r => r[metrica] || 0)), T = 54, G = 4;
  const cel = Object.entries(UF_GRID).map(([uf, [c, r]]) => {
    const x = por[uf], v = x[metrica] || 0, cor = corMapa(v, max), sel = S.ufMapa === uf;
    const tip = `${UF_NOME[uf]} (${uf}) · TRT ${UF_TRT[uf]}\nVisitas: ${x.visitas} · WhatsApp: ${x.whatsapp} · Pedidos: ${x.pedidos}\nLeads: ${x.leads} (${x.fechados} fechados) · Clientes: ${x.clientes} · Prospecção: ${x.prospects}`;
    return `<g class="uf-cel" data-uf-mapa="${uf}" data-tip="${esc(tip)}" style="cursor:pointer">
      <rect x="${c * (T + G)}" y="${r * (T + G)}" width="${T}" height="${T}" rx="8" fill="${cor.bg}" stroke="${sel ? 'var(--ink)' : 'transparent'}" stroke-width="2"/>
      <text x="${c * (T + G) + T / 2}" y="${r * (T + G) + 23}" text-anchor="middle" font-weight="700" font-size="13" fill="${cor.fg}">${uf}</text>
      <text x="${c * (T + G) + T / 2}" y="${r * (T + G) + 41}" text-anchor="middle" font-size="12" fill="${cor.fg}">${v || ''}</text></g>`;
  }).join('');
  const passos = `<span>menos</span>${RAMPA_MAPA.map(c => `<i class="sw" style="background:${c}"></i>`).join('')}<span>mais (até ${max})</span>`;
  return `<svg viewBox="0 0 ${7 * (T + G)} ${8 * (T + G)}" class="mapa-br" role="img" aria-label="Mapa do Brasil por estado: ${METRICAS_MAPA[metrica][0]}">${cel}</svg>
    <div class="legenda escala"><span><i style="background:#f0efec"></i>sem dados</span>${passos}</div>`;
}

function telaMapa() {
  carregarMapa();
  const m = S.metricaMapa, por = dadosPorUF(), d = S.mapa?.dados || {};
  const linhas = Object.values(por).filter(r => r.visitas || r.leads || r.clientes || r.prospects || r.whatsapp).sort((a, b) => (b[m] - a[m]) || (b.visitas - a.visitas));
  const total = k => soma(Object.values(por), r => r[k]);
  const top = linhas[0], comDados = linhas.filter(r => r[m] > 0).length;
  const sel = S.ufMapa && por[S.ufMapa] ? por[S.ufMapa] : null;
  const cidades = (d.por_cidade || []).filter(c => !sel || c.uf === sel.uf).slice(0, 15);
  const visTot = total('visitas'), pedTot = total('pedidos');
  const foraRJ = visTot ? 1 - (por.RJ.visitas / visTot) : NaN;
  const alvos = (d.alvos || []).slice(0, 12);
  const rol = d.rolagem || [], r25 = (rol.find(x => x.alvo === '25%') || {}).sessoes || 0;
  const disp = d.dispositivos || [], dispTot = soma(disp, x => x.sessoes);
  const trends = t => `https://trends.google.com.br/trends/explore?geo=BR&q=${encodeURIComponent(t)}`;
  const aviso = S.mapa?.carregando ? '<div class="demo"><span>Carregando dados do site…</span></div>'
    : S.mapa?.erro ? `<div class="demo" style="background:#fff1cf"><span>Os dados de visitas ainda não chegaram. Rode o <b>schema.sql</b> atualizado no Supabase para criar o monitoramento (${esc(S.mapa.erro).slice(0, 80)}).</span></div>` : '';
  return `<div class="topo"><h1>Mapa do Brasil</h1><div class="acoes">${seletorPeriodo()}
    <div class="seg">${Object.entries(METRICAS_MAPA).map(([k, [rot]]) => `<button class="${k === m ? 'on' : ''}" data-metrica-mapa="${k}">${rot}</button>`).join('')}</div>
    <button class="btn sec" data-acao="atualizarMapa" title="Atualizar">↻</button></div></div>
  ${aviso}
  <div class="kpis">
    ${kpi('Pessoas no site', visTot, `${comDados} estados com ${METRICAS_MAPA[m][0].toLowerCase()}`)}
    ${kpi('Estado que mais procura', top && top[m] ? `${top.uf} · ${top[m]}` : '—', top && top[m] ? UF_NOME[top.uf] : 'sem dados ainda')}
    ${kpi('Fora do RJ', isFinite(foraRJ) ? pct(foraRJ) : '—', 'das visitas: alcance nacional')}
    ${kpi('Visita → pedido', visTot ? pct(pedTot / visTot) : '—', `${pedTot} pedidos pelo site`)}
    ${kpi('Cliques no WhatsApp', total('whatsapp'), `${d.fora_br || 0} visitas de fora do Brasil`)}
  </div>
  <div class="grade">
    <div class="card"><h2>${METRICAS_MAPA[m][0]} por estado</h2><div class="desc">${PERIODOS[S.periodo]} · ${METRICAS_MAPA[m][1]} · clique num estado para ver as cidades</div>${mapaBrasil(por, m)}</div>
    <div class="card"><div class="linha" style="justify-content:space-between"><h2>${sel ? `${UF_NOME[sel.uf]} (${sel.uf})` : 'Cidades que mais procuram'}</h2>${sel ? '<button class="btn mini sec" data-uf-mapa="">Ver Brasil</button>' : ''}</div>
      ${sel ? `<div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:8px 0">${kpi('Visitas', sel.visitas)}${kpi('Pedidos', sel.pedidos)}${kpi('Leads', sel.leads, `${sel.fechados} fechados`)}</div>
        <div class="linha" style="margin-bottom:8px"><button class="btn mini ouro" data-prospectar-uf="${sel.uf}">🎯 Prospectar em ${UF_CAPITAL[sel.uf]}</button><a class="btn mini sec" target="_blank" href="${trends('cálculo trabalhista')}">📈 Google Trends</a><span class="desc">TRT da ${UF_TRT[sel.uf]}ª Região</span></div>` : ''}
      ${cidades.length ? `<div class="tabela"><table><tr><th>Cidade</th><th>UF</th><th class="n">Visitas</th><th class="n">WhatsApp</th><th class="n">Pedidos</th></tr>${cidades.map(c => `<tr><td>${esc(c.cidade)}</td><td>${esc(c.uf)}</td><td class="n">${c.visitas}</td><td class="n">${c.whatsapp}</td><td class="n">${c.pedidos}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Sem visitas registradas aqui no período</div>'}</div>
    <div class="card larga"><h2>Por estado</h2><div class="desc">Site (visitas, WhatsApp, pedidos) + painel (leads, clientes, prospecção) · ordenado por ${METRICAS_MAPA[m][0].toLowerCase()}</div>
      ${linhas.length ? `<div class="tabela"><table><tr><th>Estado</th><th class="n">Visitas</th><th class="n">WhatsApp</th><th class="n">Pedidos</th><th class="n">Visita→pedido</th><th class="n">Leads</th><th class="n">Fechados</th><th class="n">Clientes</th><th class="n">Na prospecção</th><th></th></tr>
      ${linhas.map(r => `<tr class="clic" data-uf-mapa="${r.uf}"><td><b>${r.uf}</b> · ${UF_NOME[r.uf]}</td><td class="n">${r.visitas}</td><td class="n">${r.whatsapp}</td><td class="n">${r.pedidos}</td><td class="n">${r.visitas ? pct(r.pedidos / r.visitas) : '—'}</td><td class="n">${r.leads}</td><td class="n">${r.fechados}</td><td class="n">${r.clientes}</td><td class="n">${r.prospects}</td>
        <td>${r.visitas && !r.prospects ? `<button class="btn mini sec" data-prospectar-uf="${r.uf}">🎯 Prospectar</button>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Ainda sem dados. Eles aparecem assim que as pessoas visitarem o site.</div>'}</div>
    <div class="card"><h2>Onde clicam no site</h2><div class="desc">Botões e links mais clicados · ${PERIODOS[S.periodo]}</div>
      ${alvos.length ? barrasH(alvos.map(a => ({ rot: `${a.tipo === 'whatsapp' ? '💬 ' : ''}${a.alvo}`, valor: a.n, tip: `${a.alvo}\n${a.tipo === 'whatsapp' ? 'WhatsApp' : 'clique'} · seção: ${a.secao || '—'} · página: ${a.pagina}\n${a.n} cliques` }))) : '<div class="vazio">Sem cliques registrados</div>'}
      <div class="desc" style="margin-top:10px">Para ver o <b>mapa de calor</b> e a gravação das visitas, ligue o <a href="#trafego" data-aba-trafego="ativacao">Microsoft Clarity</a> (grátis).</div></div>
    <div class="card"><h2>Até onde leem a página</h2><div class="desc">Das pessoas que começaram a rolar o site</div>
      ${rol.length ? barrasH(['25%', '50%', '75%', '100%'].map(k => { const v = (rol.find(x => x.alvo === k) || {}).sessoes || 0; return { rot: `chegaram a ${k}`, valor: v, tip: `${v} pessoas (${r25 ? pct(v / r25) : '—'})` }; }), v => v) : '<div class="vazio">Sem dados de rolagem</div>'}
      <h3 class="sub">Aparelho</h3>${disp.length ? barrasH(disp.map(x => ({ rot: x.dispositivo === 'celular' ? '📱 Celular' : '💻 Computador', valor: x.sessoes, tip: `${x.sessoes} visitas (${pct(x.sessoes / dispTot)})` }))) : '<div class="vazio">—</div>'}</div>
    <div class="card"><h2>De onde vêm</h2><div class="desc">Origem das visitas (campanha ou site que mandou)</div>
      ${(d.origens || []).length ? barrasH(d.origens.map(o => ({ rot: o.origem, valor: o.sessoes }))) : '<div class="vazio">Sem dados</div>'}</div>
    <div class="card"><h2>Procura no Google, por estado</h2><div class="desc">O Google Trends mostra em quais estados mais se pesquisa cada termo. Use para escolher onde anunciar e onde prospectar.</div>
      <div class="linha" style="margin-top:10px">${['cálculo trabalhista', 'pje calc', 'calculista trabalhista', 'liquidação de sentença', 'impugnação de cálculos'].map(t => `<a class="btn mini sec" target="_blank" rel="noopener" href="${trends(t)}">📈 ${t}</a>`).join('')}</div>
      <div class="desc" style="margin-top:10px">No Google Ads, use o <b>Planejador de palavras-chave</b> com "Local: Brasil" e "dividir por estado" para ver o volume de buscas mensais.</div></div>
  </div>`;
}
function prospectarUF(uf) {
  S.buscaProsp.cidade = `${UF_CAPITAL[uf]} ${uf}`;
  location.hash = 'prospeccao';
  toast(`Busca de prospecção pronta para ${UF_CAPITAL[uf]}/${uf}`);
}

/* ---------------- Prospecção (abordagem 1 a 1) ---------------- */
const STATUS_PROSP = { a_contatar: 'A contatar', contatado: 'Contatado', respondeu: 'Respondeu', interessado: 'Interessado', cliente: 'Virou cliente', sem_interesse: 'Sem interesse', nao_contatar: 'Não contatar' };
const TAG_PROSP = { a_contatar: 't-neutro', contatado: 't-azul', respondeu: 't-warn', interessado: 't-warn', cliente: 't-good', sem_interesse: 't-neutro', nao_contatar: 't-crit' };
// abas da lista: quem já foi abordado sai de "A contatar" e vai para "Contatados"
const ABAS_PROSP = { a_contatar: ['A contatar', ['a_contatar']], contatados: ['Contatados', ['contatado']], responderam: ['Responderam', ['respondeu', 'interessado']],
  clientes: ['Clientes', ['cliente']], encerrados: ['Encerrados', ['sem_interesse', 'nao_contatar']], todos: ['Todos', null] };
const FONTES_PROSP = ['Google Maps', 'Instagram', 'LinkedIn', 'Site do escritório', 'Jusbrasil', 'Indicação', 'Evento / OAB', 'Outros'];
const PROSP_PADRAO = {
  meta_dia: 20, dias_follow1: 3, dias_follow2: 7, max_tentativas: 3, remetente: '',
  oferta: 'No primeiro cálculo você tem 20% de desconto: sai por R$ 200.', // entra no 1º contato no lugar de {oferta}
  textos: { // padrão: as 15 variações de mensagens.js (separadas por ---)
    primeiro: VARIACOES.primeiro.join('\n---\n'), follow1: VARIACOES.follow1.join('\n---\n'), follow2: VARIACOES.follow2.join('\n---\n'),
    email_assunto: 'Cálculos trabalhistas no PJe-Calc para o seu escritório'
  },

};
const cfgProsp = () => { const a = S.ajustes.prospeccao || {}; return { ...PROSP_PADRAO, ...a, textos: { ...PROSP_PADRAO.textos, ...(a.textos || {}) } }; };
const linkPortfolio = p => p?.id ? `https://pontesferreiracalculos.com/?r=${String(p.id).slice(0, 8)}${!p.whatsapp && p.email ? '&m=e' : ''}` : 'https://pontesferreiracalculos.com/'; // link do site; o ?r= marca a origem Prospecção (rastro.js)
const primeiroNome = n => { const partes = String(n || '').trim().split(/\s+/).filter(x => !/^(dra?\.?|adv\.?|escrit[oó]rio)$/i.test(x)); return partes[0] || ''; };
const pessoaOuEscritorio = p => /advoga|associad|escrit|sociedade|&|ltda|s\/s/i.test(p.nome || '') ? '' : primeiroNome(p.nome);
const etapaProsp = p => (p.tentativas || 0) === 0 ? 'primeiro' : p.tentativas === 1 ? 'follow1' : 'follow2';
function textoProsp(p, etapa = etapaProsp(p), idx) {
  const c = cfgProsp(), nome = pessoaOuEscritorio(p);
  const lista = String(c.textos[etapa] || '').split(SEP_VAR).map(x => x.trim()).filter(Boolean);
  const i = idx === undefined ? sortearVariacao('prosp_' + etapa, lista.length) : ((idx % lista.length) + lista.length) % lista.length;
  S.varAbordagem = { etapa, i, n: lista.length };
  // funções no replace: um "$&" no nome do contato não é expandido
  return String(lista[i] || '').replace(/\{,\s*nome\}/g, () => nome ? `, ${nome}` : '').replace(/\{nome\}/g, () => nome)
    .replace(/\{eu\}/g, () => c.remetente ? `Aqui é ${c.remetente}, ` : 'Aqui é ').replace(/\{escritorio\}/g, () => p.escritorio || 'seu escritório').replace(/\{link\}/g, () => linkPortfolio(p))
    .replace(/\s*\{oferta\}/g, () => c.oferta ? ' ' + c.oferta : '') // sem oferta configurada, o marcador some
    .replace(/^([\s\S]*?)(\n\n[^\n]*$)/, (t, corpo, fim) => etapa === 'primeiro' && c.oferta && !t.includes(c.oferta) ? `${corpo}\n\n${c.oferta}${fim}` : t); // textos próprios sem {oferta}: a oferta entra antes do último parágrafo
}
// valor do 1º cálculo com a oferta (lido do texto: "sai por R$ 200")
function valorOferta() { const m = String(cfgProsp().oferta || '').match(/R\$\s*([\d.,]+)/); return m ? numBR(m[1]) || null : null; }
const contatavel = p => !['cliente', 'sem_interesse', 'nao_contatar', 'respondeu', 'interessado'].includes(p.status) && (p.whatsapp || p.email);
// nota do Google guardada pela busca automática ("Google: ★ 4.8 (52 avaliações)")
function notaGoogle(p) { const m = String(p.obs || '').match(/★\s*([\d.,]+)\s*\((\d+)/); return m ? { nota: Number(m[1].replace(',', '.')), av: Number(m[2]) } : null; }
// escritório ativo e com clientes primeiro: nota alta com muitas avaliações vale mais que 5,0 com 1 avaliação
const scoreProsp = p => { const g = notaGoogle(p); return g ? g.nota * Math.log10(g.av + 1) : 0; };
const prioritario = p => { const g = notaGoogle(p); return !!g && g.nota >= 4 && g.av >= 5; };
const seloNota = p => { const g = notaGoogle(p); return g ? `<span class="tag ${prioritario(p) ? 't-good' : 't-neutro'}" title="${prioritario(p) ? 'Prioridade: escritório bem avaliado e com clientes no Google' : 'Nota no Google'}">${prioritario(p) ? '⭐' : '★'} ${String(g.nota).replace('.', ',')} (${g.av})</span>` : ''; };
function filaProsp() {
  const c = cfgProsp(), h = hoje();
  const followups = S.prospects.filter(p => contatavel(p) && p.status === 'contatado' && (p.tentativas || 0) < c.max_tentativas && p.proximo_contato && p.proximo_contato <= h)
    .sort((a, b) => a.proximo_contato.localeCompare(b.proximo_contato));
  // novos: primeiro os bem avaliados no Google (mais clientes = mais cálculos), depois por ordem de chegada
  const novos = S.prospects.filter(p => contatavel(p) && p.status === 'a_contatar' && !(p.tentativas > 0)).sort((a, b) => scoreProsp(b) - scoreProsp(a) || a.created_at.localeCompare(b.created_at));
  return [...followups, ...novos];
}
const contatadosHoje = () => S.prospects.filter(p => p.ultimo_contato && dia(p.ultimo_contato) === hoje()).length;
const linkExt = (url, rot) => url ? `<a class="btn mini sec" href="${esc(/^https?:/.test(url) ? url : 'https://' + url)}" target="${ALVO_WA}" rel="noopener">${rot}</a>` : '';
const linkInsta = h => h ? (/^https?:/.test(h) ? h : `https://instagram.com/${h.replace(/^@/, '')}`) : '';

function telaProspeccao() {
  const c = cfgProsp(), fila = filaProsp(), feitosHoje = contatadosHoje();
  const f = S.filtroProsp, q = (f.q || '').toLowerCase(), hj = hoje();
  const cidadeDe = p => (p.cidade || '').split('/')[0].trim() || '(sem cidade)';
  const ORDENS = { prioridade: (a, b) => scoreProsp(b) - scoreProsp(a) || (b.ultimo_contato || b.created_at).localeCompare(a.ultimo_contato || a.created_at), recentes: (a, b) => (b.ultimo_contato || b.created_at).localeCompare(a.ultimo_contato || a.created_at), novos: (a, b) => b.created_at.localeCompare(a.created_at),
    retorno: (a, b) => (a.proximo_contato || '9999').localeCompare(b.proximo_contato || '9999'), nome: (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'), cidade: (a, b) => cidadeDe(a).localeCompare(cidadeDe(b), 'pt-BR') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR') };
  const aba = ABAS_PROSP[f.aba] ? f.aba : 'a_contatar', grupoAba = ABAS_PROSP[aba][1];
  const naAba = p => !grupoAba || grupoAba.includes(p.status || 'a_contatar');
  const filtrada = S.prospects.filter(p => naAba(p) && (!q || [p.nome, p.escritorio, p.cidade, p.email, p.whatsapp, p.obs].join(' ').toLowerCase().includes(q))
      && (!f.cidade || cidadeDe(p) === f.cidade) && (!f.fonte || (p.fonte || '(sem origem)') === f.fonte)
      && (!f.tel || (f.tel === 'sem' ? !digitos(p.whatsapp) : tipoTel(p.whatsapp) === f.tel))
      && (!f.retorno || (f.retorno === 'vencido' ? contatavel(p) && p.proximo_contato && p.proximo_contato <= hj : f.retorno === 'semana' ? contatavel(p) && p.proximo_contato && p.proximo_contato <= somaDias(hj, 7) : !p.tentativas))
      && (!f.nota || (f.nota === 'top' ? prioritario(p) : f.nota === 'com' ? !!notaGoogle(p) : !notaGoogle(p))))
    .sort(ORDENS[f.ordem] || (aba === 'contatados' ? ORDENS.retorno : aba === 'a_contatar' || aba === 'todos' ? ORDENS.prioridade : ORDENS.recentes));
  const POR_PAG = 20, paginas = Math.max(1, Math.ceil(filtrada.length / POR_PAG)), pag = Math.min(Math.max(1, f.pag || 1), paginas);
  const lista = filtrada.slice((pag - 1) * POR_PAG, pag * POR_PAG);
  const contaPor = fn => { const m = {}; S.prospects.forEach(p => { const k = fn(p); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')); };
  const opt = (v, rot, atual) => `<option value="${esc(v)}" ${v === (atual || '') ? 'selected' : ''}>${esc(rot)}</option>`;
  const filtrosAtivos = ['q', 'cidade', 'fonte', 'tel', 'retorno', 'nota'].filter(k => f[k]).length;
  const contaAba = k => S.prospects.filter(p => !ABAS_PROSP[k][1] || ABAS_PROSP[k][1].includes(p.status || 'a_contatar')).length;
  const numsPag = (() => { const out = []; for (let i = 1; i <= paginas; i++) if (i === 1 || i === paginas || Math.abs(i - pag) <= 2) out.push(i); else if (out[out.length - 1] !== '…') out.push('…'); return out; })();
  const paginacao = paginas > 1 ? `<div class="linha" style="justify-content:space-between;margin-top:12px;flex-wrap:wrap;gap:8px">
      <span class="desc">Mostrando ${(pag - 1) * POR_PAG + 1}–${Math.min(pag * POR_PAG, filtrada.length)} de ${filtrada.length}</span>
      <div class="linha" style="gap:4px"><button class="btn mini sec" data-pag-prosp="${pag - 1}" ${pag === 1 ? 'disabled' : ''}>‹ Anterior</button>
      ${numsPag.map(n => n === '…' ? '<span class="desc">…</span>' : `<button class="btn mini ${n === pag ? '' : 'sec'}" data-pag-prosp="${n}">${n}</button>`).join('')}
      <button class="btn mini sec" data-pag-prosp="${pag + 1}" ${pag === paginas ? 'disabled' : ''}>Próxima ›</button></div></div>` : '';
  const cont = k => S.prospects.filter(p => p.status === k).length;
  const respostas = S.prospects.filter(p => ['respondeu', 'interessado', 'cliente'].includes(p.status)).length;
  const abordados = S.prospects.filter(p => p.tentativas > 0).length;
  const cidade = S.buscaProsp.cidade, termo = S.buscaProsp.termo;
  const busca = (url, rot) => `<a class="btn mini sec" target="_blank" rel="noopener" href="${esc(url)}">${rot}</a>`;
  const qBusca = encodeURIComponent(`${termo} ${cidade}`.trim());
  return `<div class="topo"><h1>Prospecção</h1><div class="acoes">
    <button class="btn sec" data-acao="configProsp">⚙ Mensagens</button><button class="btn sec" data-acao="colarProsp">📋 Colar lista</button>
    <button class="btn sec" data-acao="exportProsp">⬇ Exportar</button><button class="btn sec" data-acao="novoProsp">+ Contato</button>
    <button class="btn" data-acao="proximoProsp" ${fila.length ? '' : 'disabled'}>▶ Próximo da fila (${fila.length})</button></div></div>
  ${feitosHoje >= c.meta_dia ? `<div class="demo"><span>✅ Meta do dia batida: <b>${feitosHoje}</b> abordagens. Passar de ~30 por dia no mesmo número aumenta o risco de o WhatsApp bloquear por spam.</span></div>` : ''}
  <div class="kpis">
    ${kpi('Na lista', S.prospects.length, `${cont('a_contatar')} a contatar`)}
    ${kpi('Abordados hoje', `${feitosHoje}/${c.meta_dia}`, 'meta diária', false)}
    ${kpi('Na fila agora', fila.length, `${fila.filter(p => p.tentativas > 0).length} follow-ups vencidos`)}
    ${kpi('Responderam', respostas, `taxa ${abordados ? pct(respostas / abordados) : '—'} dos abordados`)}
    ${kpi('Viraram clientes', cont('cliente'), `${cont('interessado')} interessados`)}
  </div>
  <div class="grade">
    ${cardBuscaAuto(termo, cidade, qBusca, busca)}
    <div class="card larga"><div class="linha" style="justify-content:space-between"><h2>Lista</h2>
      <div class="linha"><span class="desc">${filtrada.length} de ${contaAba(aba)} em "${ABAS_PROSP[aba][0]}"</span>${filtrosAtivos ? '<button class="btn mini sec" data-acao="limparFiltroProsp">✕ Limpar filtros</button>' : ''}</div></div>
      <div class="seg" style="margin:12px 0 4px;flex-wrap:wrap">${Object.entries(ABAS_PROSP).map(([k, [rot]]) => `<button class="${k === aba ? 'on' : ''}" data-aba-prosp="${k}">${rot} <span class="desc">(${contaAba(k)})</span></button>`).join('')}</div>
      <div class="linha" style="flex-wrap:wrap;gap:8px;margin:10px 0 4px">
      <input class="f" id="buscaProsp" placeholder="Buscar nome, telefone, obs…" value="${esc(f.q || '')}" style="flex:1;min-width:200px">
      <select class="f" data-filtro-prosp="cidade">${opt('', 'Todas as cidades', f.cidade)}${contaPor(cidadeDe).map(([c, n]) => opt(c, `${c} (${n})`, f.cidade)).join('')}</select>
      <select class="f" data-filtro-prosp="tel">${opt('', 'Qualquer telefone', f.tel)}${opt('celular', '📱 Celular (WhatsApp)', f.tel)}${opt('fixo', '☎ Fixo', f.tel)}${opt('sem', 'Sem telefone', f.tel)}</select>
      <select class="f" data-filtro-prosp="retorno">${opt('', 'Qualquer retorno', f.retorno)}${opt('vencido', '⏰ Retorno vencido/hoje', f.retorno)}${opt('semana', 'Retorno nos próximos 7 dias', f.retorno)}${opt('nunca', 'Nunca abordados', f.retorno)}</select>
      <select class="f" data-filtro-prosp="fonte">${opt('', 'Qualquer origem', f.fonte)}${contaPor(p => p.fonte || '(sem origem)').map(([c, n]) => opt(c, `${c} (${n})`, f.fonte)).join('')}</select>
      <select class="f" data-filtro-prosp="nota">${opt('', 'Qualquer avaliação', f.nota)}${opt('top', '⭐ Nota 4+ e 5+ avaliações', f.nota)}${opt('com', 'Com nota no Google', f.nota)}${opt('sem', 'Sem nota', f.nota)}</select>
      <select class="f" data-filtro-prosp="ordem">${opt('', aba === 'contatados' ? 'Ordem: retorno mais próximo' : aba === 'a_contatar' || aba === 'todos' ? 'Ordem: prioridade (nota Google)' : 'Ordem: último contato', f.ordem)}${aba === 'a_contatar' || aba === 'todos' ? '' : opt('prioridade', 'Ordem: prioridade (nota Google)', f.ordem)}${opt('recentes', 'Ordem: último contato', f.ordem)}${opt('novos', 'Ordem: adicionados por último', f.ordem)}${opt('retorno', 'Ordem: retorno mais próximo', f.ordem)}${opt('nome', 'Ordem: nome A–Z', f.ordem)}${opt('cidade', 'Ordem: cidade', f.ordem)}</select></div>
      ${lista.length ? `<div class="tabela"><table><tr><th>Contato</th><th>Cidade</th><th>Telefone</th><th>Links</th><th>Status</th><th>Último contato</th><th>Retorno</th><th></th></tr>
      ${lista.map(p => `<tr><td><b class="link" data-prosp="${p.id}">${esc(p.nome)}</b> ${seloNota(p)}${p.escritorio && p.escritorio !== p.nome ? `<div class="desc" style="margin:0">${esc(p.escritorio)}</div>` : ''}</td>
        <td>${esc(p.cidade || '—')}</td>
        <td style="white-space:nowrap">${celTelefone(p)}</td>
        <td style="white-space:nowrap">${linkExt(p.site, '🌐')}${linkExt(linkInsta(p.instagram), '📸')}${linkExt(p.linkedin, '💼')}${linkExt(p.maps, '📍')}</td>
        <td><span class="tag ${TAG_PROSP[p.status] || 't-neutro'}">${STATUS_PROSP[p.status] || p.status}</span>${p.tentativas ? ` <span class="desc">${p.tentativas}×</span>` : ''}</td>
        <td>${p.ultimo_contato ? dataBR(p.ultimo_contato) : '—'}</td>
        <td>${p.proximo_contato && contatavel(p) ? `<span class="${p.proximo_contato <= hoje() ? 'tag t-warn' : ''}">${dataBR(p.proximo_contato)}</span>` : '—'}</td>
        <td style="white-space:nowrap">${contatavel(p) ? `<button class="btn mini ouro" data-abordar="${p.id}">📲 Abordar</button>` : ''}</td></tr>`).join('')}</table></div>`
      : `<div class="vazio">${S.prospects.length ? 'Nada com esse filtro' : 'Lista vazia. Comece pesquisando acima e adicionando contatos.'}</div>`}${paginacao}</div>
  </div>`;
}

const WA_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.6c-2 0-4-.5-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.7 8.7 0 0 1-4.3-3.7c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8.9 3.8.8a3.2 3.2 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3z"/></svg>';
const ROT_ETAPA = { primeiro: '1º contato', follow1: '2º contato', follow2: '3º contato (último)' };
function celTelefone(p) {
  if (!p.whatsapp && !p.email) return '<span class="desc">sem contato</span>';
  const tel = p.whatsapp ? `<span class="mono tel">${esc(fmtTel(digitos(p.whatsapp).length <= 11 ? '55' + digitos(p.whatsapp) : p.whatsapp))}</span>` : '';
  let wa = '';
  if (p.whatsapp && p.status !== 'nao_contatar') wa = contatavel(p)
    ? `<button class="wa-bolha" data-wa-prosp="${p.id}" title="Enviar a mensagem do ${ROT_ETAPA[etapaProsp(p)]} no WhatsApp">${WA_SVG}</button>`
    : waBotao(p.whatsapp, { classe: 'wa-bolha conversa', nome: p.nome, lead_id: p.lead_id, rotulo: WA_SVG, title: 'Abrir a conversa (sem mensagem pronta)' });
  const mail = p.email && p.status !== 'nao_contatar' ? `<button class="mail-bolha" data-mail-prosp="${p.id}" title="Enviar por e-mail: ${esc(p.email)}">✉</button>` : '';
  return `<div class="tel-cel">${tel}${wa}${mail}</div>`;
}
/* envia direto da lista, com a mensagem da etapa, e registra a abordagem */
async function registrarAbordagem(p, canal, txt) {
  const c = cfgProsp();
  if (canal === 'wa') {
    if (painelWaOk()) { // pelo WhatsApp do painel: só conta quando a mensagem for enviada de fato (waEnviar)
      abrirNoPainel(p.whatsapp, p.nome, txt);
      if (contatavel(p)) { S.prospPendente = { id: p.id, chave: digitos(p.whatsapp).slice(-8) }; toast('Revise e envie a mensagem: o contato é registrado quando ela sair.'); }
      return;
    }
    window.open(waLink(p.whatsapp, txt), ALVO_WA);
  }
  else window.open(`mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(c.textos.email_assunto)}&body=${encodeURIComponent(txt.replace(/\*/g, ''))}`, '_blank');
  await marcarContatado(p);
}
// conta a tentativa de prospecção (1º contato, lembrete, último) e agenda o próximo retorno
async function marcarContatado(p) {
  if (!contatavel(p)) return;
  const c = cfgProsp(), agora = new Date().toISOString();
  const t = (p.tentativas || 0) + 1, prox = t >= c.max_tentativas ? null : somaDias(hoje(), t === 1 ? c.dias_follow1 : c.dias_follow2 - c.dias_follow1);
  await atualizar('prospects', p.id, { status: 'contatado', tentativas: t, ultimo_contato: agora, proximo_contato: prox });
  toast(`${ROT_ETAPA[t === 1 ? 'primeiro' : t === 2 ? 'follow1' : 'follow2']} registrado · ${prox ? 'retorno em ' + dataBR(prox) : 'última tentativa'}`);
}
async function enviarDiretoProsp(id, canal) {
  const p = S.prospects.find(x => x.id === id); if (!p) return;
  if (contatadosHoje() >= cfgProsp().meta_dia) toast(`Meta do dia batida (${contatadosHoje()}). Vá com calma para não ser bloqueado.`);
  await seguro(async () => { await registrarAbordagem(p, canal, textoProsp(p)); render(); });
}

/* cartão de abordagem: um contato por vez */
let abordagemId = null;
function abrirAbordagem(id) {
  abordagemId = id;
  const p = S.prospects.find(x => x.id === id); if (!p) return;
  const etapa = etapaProsp(p), rotEtapa = { primeiro: '1º contato', follow1: '2º contato (lembrete)', follow2: '3º contato (último)' }[etapa];
  let f = $('#abordagem');
  if (!f) { f = document.createElement('div'); f.className = 'modal-fundo'; f.id = 'abordagem'; document.body.appendChild(f); f.addEventListener('click', e => { if (e.target === f) fecharAbordagem(); }); }
  const fila = filaProsp(), pos = fila.findIndex(x => x.id === id);
  f.innerHTML = `<div class="modal" style="width:min(620px,100%)">
    <div class="linha" style="justify-content:space-between"><h2 style="margin:0">📲 ${esc(p.nome)}</h2><span class="desc">${pos >= 0 ? `${pos + 1} de ${fila.length} na fila · ` : ''}hoje: ${contatadosHoje()}/${cfgProsp().meta_dia}</span></div>
    <div class="desc">${[p.escritorio !== p.nome ? p.escritorio : '', p.cidade, p.area, p.oab ? 'OAB ' + p.oab : '', p.fonte ? 'fonte: ' + p.fonte : ''].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="linha" style="margin:8px 0">${linkExt(p.site, '🌐 Site')}${linkExt(linkInsta(p.instagram), '📸 Instagram')}${linkExt(p.linkedin, '💼 LinkedIn')}${linkExt(p.maps, '📍 Maps')}
      <span class="tag t-azul">${rotEtapa}</span>${p.ultimo_contato ? `<span class="desc">último: ${dataBR(p.ultimo_contato)}</span>` : ''}</div>
    ${p.obs ? `<div class="obs">${esc(p.obs)}</div>` : ''}
    <label class="rotulo" style="margin-top:8px">Mensagem (pode editar antes de enviar)</label>
    <textarea id="abTexto" rows="9" style="width:100%;border:1px solid var(--axis);border-radius:8px;padding:10px;font:inherit">${esc(textoProsp(p, etapa))}</textarea>
    <div class="linha" style="margin-top:6px;justify-content:space-between"><span class="desc" id="abVar">versão ${S.varAbordagem.i + 1} de ${S.varAbordagem.n}</span><button class="btn mini sec" data-ab="variar">🔀 Outra versão</button></div>
    <div class="linha" style="margin-top:10px">
      ${p.whatsapp ? `<button class="btn ouro" data-ab="wa">📲 Enviar no WhatsApp</button>` : ''}
      ${p.email ? `<button class="btn sec" data-ab="email">✉ Enviar por e-mail</button>` : ''}
      <button class="btn sec" data-ab="pular">Pular ⏭</button></div>
    <div class="linha" style="margin-top:10px;border-top:1px solid var(--grid);padding-top:10px">
      <span class="desc">Já teve retorno?</span>
      <button class="btn mini sec" data-ab="respondeu">💬 Respondeu</button><button class="btn mini sec" data-ab="interessado">⭐ Interessado</button>
      <button class="btn mini sec" data-ab="lead">→ Virar lead</button><button class="btn mini sec" data-ab="sem_interesse">Sem interesse</button>
      <button class="btn mini perigo" data-ab="nao_contatar">🚫 Não contatar</button>
      <button class="btn mini sec" data-ab="editar" style="margin-left:auto">✏ Editar</button><button class="btn mini sec" data-ab="fechar">Fechar</button></div></div>`;
  f.querySelectorAll('[data-ab]').forEach(b => b.addEventListener('click', () => acaoAbordagem(b.dataset.ab)));
}
function fecharAbordagem() { abordagemId = null; $('#abordagem')?.remove(); render(); }
function proximoDaFila(depoisDe) {
  const fila = filaProsp().filter(p => p.id !== depoisDe);
  if (!fila.length) { fecharAbordagem(); return toast('Fila vazia 🎉 Adicione mais contatos.'); }
  if (contatadosHoje() >= cfgProsp().meta_dia) toast(`Meta do dia batida (${contatadosHoje()}). Pode continuar, mas com moderação.`);
  abrirAbordagem(fila[0].id);
}
let abordando = false;
async function acaoAbordagem(a) {
  if (abordando) return; abordando = true; setTimeout(() => { abordando = false; }, 1500); // clique duplo não conta duas tentativas
  const p = S.prospects.find(x => x.id === abordagemId); if (!p) return;
  const c = cfgProsp(), txt = ($('#abTexto')?.value || '').trim(), agora = new Date().toISOString();
  await seguro(async () => {
    if (a === 'wa' || a === 'email') { await registrarAbordagem(p, a, txt); if (a === 'wa' && painelWaOk()) { $('#abordagem')?.remove(); abordagemId = null; return; } return proximoDaFila(p.id); }
    if (a === 'variar') { const v = S.varAbordagem; $('#abTexto').value = textoProsp(p, v.etapa, v.i + 1); $('#abVar').textContent = `versão ${S.varAbordagem.i + 1} de ${S.varAbordagem.n}`; return; }
    if (a === 'pular') return proximoDaFila(p.id);
    if (a === 'fechar') return fecharAbordagem();
    if (a === 'editar') { const id = p.id; fecharAbordagem(); return editarProsp(S.prospects.find(x => x.id === id)); }
    if (a === 'lead') {
      const l = await criar('leads', { nome: p.nome, whatsapp: p.whatsapp, origem: 'Prospecção', utm_source: 'prospeccao', utm_campaign: 'prospeccao_1a1', status: 'orcamento', respondido_em: agora, obs: [p.escritorio, p.cidade, p.email, p.obs].filter(Boolean).join(' · ') || null, modo: 'manual' });
      await atualizar('prospects', p.id, { status: 'interessado', lead_id: l.id });
      toast('Lead criado no CRM (Orçamento enviado)'); return fecharAbordagem();
    }
    await atualizar('prospects', p.id, { status: a, proximo_contato: null });
    toast(`Marcado: ${STATUS_PROSP[a]}`);
    return proximoDaFila(p.id);
  });
}

const camposProsp = () => [
  { k: 'nome', rot: 'Nome (advogado ou escritório)', req: true, full: true },
  { k: 'escritorio', rot: 'Escritório' }, { k: 'cidade', rot: 'Cidade/UF' },
  { k: 'whatsapp', rot: 'WhatsApp' }, { k: 'email', rot: 'E-mail', tipo: 'email' },
  { k: 'site', rot: 'Site' }, { k: 'instagram', rot: 'Instagram (@ ou link)' },
  { k: 'linkedin', rot: 'LinkedIn (link)' }, { k: 'maps', rot: 'Google Maps (link)' },
  { k: 'oab', rot: 'OAB' }, { k: 'area', rot: 'Área', padrao: 'Trabalhista' },
  { k: 'fonte', rot: 'Onde achou', tipo: 'select', opcoes: FONTES_PROSP },
  { k: 'status', rot: 'Status', tipo: 'select', opcoes: Object.entries(STATUS_PROSP), vazio: false, padrao: 'a_contatar' },
  { k: 'proximo_contato', rot: 'Próximo contato', tipo: 'date' },
  { k: 'obs', rot: 'Observações (o que viu no perfil, gancho para a conversa)', tipo: 'textarea', full: true }
];
const chaveDup = p => [digitos(p.whatsapp).slice(-9), (p.email || '').toLowerCase().trim(), `${(p.nome || '').toLowerCase().trim()}|${(p.cidade || '').toLowerCase().trim()}`];
function duplicado(p, ignorar) {
  const [w, e, n] = chaveDup(p);
  return S.prospects.find(x => x.id !== ignorar && ((w && digitos(x.whatsapp).slice(-9) === w) || (e && (x.email || '').toLowerCase() === e) || `${(x.nome || '').toLowerCase().trim()}|${(x.cidade || '').toLowerCase().trim()}` === n));
}
/* ---------------- Prospecção: busca automática (Google Maps / Places API) ---------------- */
const TERMOS_PROSP = ['advogado trabalhista', 'escritório de advocacia trabalhista', 'advocacia trabalhista', 'advogada trabalhista', 'sociedade de advogados', 'advogado previdenciário', 'advocacia empresarial'];
const CIDADES_PROSP = ['Rio de Janeiro', 'Niterói', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu', 'Campos dos Goytacazes', 'Petrópolis', 'Volta Redonda', 'Macaé', 'São Paulo', 'Campinas', 'Santos', 'Belo Horizonte', 'Vitória', 'Curitiba', 'Porto Alegre', 'Salvador', 'Recife', 'Fortaleza', 'Brasília', 'Goiânia', 'Florianópolis', 'Belém', 'Manaus'];
// "21 99606-5441" → celular (WhatsApp); "21 2222-3333" → fixo
const urlExt = u => /^https?:\/\//i.test(u) ? u : 'https://' + u;
function tipoTel(t) { let d = digitos(t); if (d.startsWith('55') && d.length >= 12) d = d.slice(2); return !d ? 'sem' : d.length === 11 && d[2] === '9' ? 'celular' : 'fixo'; }
function cardBuscaAuto(termo, cidade, qBusca, busca) {
  const A = S.achados || {}, porCidade = {};
  S.prospects.forEach(p => { const c = (p.cidade || '').split('/')[0].trim(); if (c) porCidade[c] = (porCidade[c] || 0) + 1; });
  const naoBuscadas = CIDADES_PROSP.filter(c => !porCidade[c]).slice(0, 8);
  const lugares = A.lugares || [], sel = A.sel || new Set();
  const novos = lugares.filter(l => !l.ja), celNovos = novos.filter(l => tipoTel(l.telefone) === 'celular');
  const linha = l => {
    const t = tipoTel(l.telefone);
    return `<tr style="${l.ja ? 'opacity:.5' : ''}"><td><input type="checkbox" data-achado="${esc(l.id)}" ${sel.has(l.id) ? 'checked' : ''} ${l.ja ? 'disabled' : ''}></td>
      <td><b>${esc(l.nome)}</b>${l.tipo ? `<div class="desc">${esc(l.tipo)}</div>` : ''}</td><td>${esc(l.cidade)}</td>
      <td style="white-space:nowrap">${l.telefone ? esc(l.telefone) : '—'} ${t === 'celular' ? '<span class="tag t-good" title="Celular: dá para chamar no WhatsApp">📱 WhatsApp</span>' : t === 'fixo' ? '<span class="tag t-neutro" title="Fixo: ligar ou procurar o WhatsApp no site">☎ fixo</span>' : ''}</td>
      <td>${l.nota ? (l.nota >= 4 && l.avaliacoes >= 5 ? `<span class="tag t-good" title="Prioridade: bem avaliado e com clientes">⭐ ${String(l.nota).replace('.', ',')} (${l.avaliacoes})</span>` : `★ ${String(l.nota).replace('.', ',')} <span class="desc">(${l.avaliacoes})</span>`) : '<span class="desc">sem nota</span>'}</td>
      <td style="white-space:nowrap">${l.site ? `<a class="btn mini sec" target="_blank" rel="noopener" href="${esc(urlExt(l.site))}">🌐</a>` : ''}${l.maps ? ` <a class="btn mini sec" target="_blank" rel="noopener" href="${esc(urlExt(l.maps))}">📍</a>` : ''}</td>
      <td>${l.ja ? '<span class="tag t-neutro">já na lista</span>' : ''}</td></tr>`;
  };
  return `<div class="card larga"><h2>🔍 Encontrar advogados e escritórios</h2>
    <div class="desc">Digite a cidade e clique em <b>Buscar</b>: o painel traz os escritórios do Google Maps com telefone, site e nota. Marque quem quer abordar e adicione com um clique. Só dados públicos de empresas.</div>
    <div class="form-trafego linha" style="margin-top:10px;flex-wrap:wrap">
      <input class="f" data-busca-prosp="termo" value="${esc(termo)}" placeholder="advogado trabalhista" list="termosProsp" style="flex:1;min-width:200px">
      <input class="f" data-busca-prosp="cidade" value="${esc(cidade)}" placeholder="cidade (ex.: Niterói)" list="cidadesProsp" style="flex:1;min-width:180px">
      <button class="btn" data-acao="buscarAuto" ${A.carregando ? 'disabled' : ''}>${A.carregando ? 'Buscando…' : '🔍 Buscar'}</button></div>
    <datalist id="termosProsp">${TERMOS_PROSP.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
    <datalist id="cidadesProsp">${CIDADES_PROSP.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
    ${naoBuscadas.length ? `<div class="linha" style="margin-top:8px;flex-wrap:wrap;gap:6px"><span class="desc">Cidades sem nenhum contato na lista:</span>${naoBuscadas.map(c => `<button class="btn mini sec" data-cidade-prosp="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    ${A.erro === 'sem_chave' ? `<div class="demo" style="margin-top:12px;display:block"><b>Falta ligar a busca automática (uma vez só):</b><ol style="margin:6px 0 0 18px;line-height:1.6">
        <li>Em <a href="https://console.cloud.google.com/apis/library/places.googleapis.com" target="_blank" rel="noopener">console.cloud.google.com</a>, crie um projeto e ative a <b>Places API (New)</b>.</li>
        <li>Em <b>APIs e serviços › Credenciais › Criar credenciais › Chave de API</b>, copie a chave e restrinja-a à Places API.</li>
        <li>No Supabase, em <b>Edge Functions › Secrets</b>, crie <code>GOOGLE_PLACES_KEY</code> com a chave.</li></ol>
        <div class="desc" style="margin-top:6px">O Google dá uma cota gratuita por mês (cada busca traz até 20 escritórios). Enquanto isso, use os links abaixo.</div></div>`
      : A.erro ? `<div class="demo" style="margin-top:12px"><span>⚠ ${esc(A.erro)}</span></div>` : ''}
    ${lugares.length ? `<div class="linha" style="margin:14px 0 6px;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div><b>${lugares.length}</b> encontrado(s) para "${esc(A.termo)}" em ${esc(A.cidade)} · ${novos.length} novo(s) · ${celNovos.length} com celular · ${novos.filter(l => l.nota >= 4 && l.avaliacoes >= 5).length} ⭐ bem avaliado(s) <span class="desc">(aparecem primeiro)</span></div>
        <div class="linha"><button class="btn mini sec" data-acao="selCelulares">Marcar novos com celular</button><button class="btn mini sec" data-acao="selNenhum">Desmarcar</button>
        <button class="btn" data-acao="addAchados" ${sel.size ? '' : 'disabled'}>+ Adicionar ${sel.size} à lista</button></div></div>
      <div class="tabela"><table><tr><th></th><th>Escritório</th><th>Cidade</th><th>Telefone</th><th>Google</th><th>Links</th><th></th></tr>${lugares.map(linha).join('')}</table></div>
      ${A.proxima ? `<div style="margin-top:8px"><button class="btn sec" data-acao="buscarMais" ${A.carregando ? 'disabled' : ''}>Carregar mais 20</button></div>` : ''}` : ''}
    <details style="margin-top:12px"><summary class="desc" style="cursor:pointer">Pesquisar à mão (Google, Instagram, LinkedIn, Jusbrasil)</summary>
      <div class="linha" style="margin-top:8px;flex-wrap:wrap">
        ${busca(`https://www.google.com/maps/search/${qBusca}`, '📍 Google Maps')}
        ${busca(`https://www.google.com/search?q=${qBusca}+whatsapp`, '🔎 Google')}
        ${busca(`https://www.google.com/search?q=site%3Ainstagram.com+${qBusca}`, '📸 Instagram')}
        ${busca(`https://www.google.com/search?q=site%3Alinkedin.com%2Fin+${qBusca}`, '💼 LinkedIn')}
        ${busca(`https://www.google.com/search?q=site%3Ajusbrasil.com.br+${qBusca}`, '⚖ Jusbrasil')}
        ${busca('https://cna.oab.org.br/', '🪪 Conferir OAB (CNA)')}
        ${busca('https://pontesferreiracalculos.com/', '👁 Ver site')}</div></details></div>`;
}
const DEMO_ACHADOS = n => Array.from({ length: 6 }, (_, i) => ({ id: 'demo' + n + i, nome: ['Silva & Souza Advogados', 'Dra. Carla Mendes Advocacia', 'Oliveira Advocacia Trabalhista', 'Escritório Ramos', 'Lima e Costa Sociedade de Advogados', 'Dr. Paulo Nunes'][i], cidade: S.buscaProsp.cidade || 'Niterói', telefone: i % 3 === 2 ? '(21) 2722-10' + (10 + i) : '(21) 9' + (8100 + i * 37) + '-' + (4100 + i * 11), site: i % 2 ? '' : 'https://exemplo.com.br', maps: 'https://maps.google.com', nota: [4.8, 4.5, null, 5, 4.2, 3.9][i], avaliacoes: [52, 18, 0, 7, 31, 3][i], tipo: 'Advogado' }));
async function buscarAuto(mais) {
  const termo = (S.buscaProsp.termo || 'advogado trabalhista').trim(), cidade = (S.buscaProsp.cidade || '').trim();
  if (!cidade) return toast('Digite a cidade');
  const ant = S.achados || {};
  const continuar = mais && ant.termo === termo && ant.cidade === cidade;
  S.achados = { ...(continuar ? ant : { lugares: [], sel: new Set() }), termo, cidade, carregando: true, erro: null };
  try {
    render();
    let lugares, proxima = null;
    if (DEMO) { lugares = DEMO_ACHADOS((ant.lugares || []).length); }
    else {
      const { data, error } = await sb.functions.invoke('buscar-escritorios', { body: { termo, cidade, pagina: continuar ? ant.proxima : null } });
      if (error) { let d = {}; try { d = await error.context.json(); } catch { } throw Object.assign(new Error(d.mensagem || error.message), { codigo: d.erro || (error.context?.status === 404 ? 'sem_funcao' : '') }); }
      lugares = data.lugares || []; proxima = data.proxima;
    }
    lugares.forEach(l => { l.ja = !!duplicado({ nome: l.nome, cidade: l.cidade, whatsapp: l.telefone }) || S.prospects.some(p => p.maps && l.maps && p.maps === l.maps); });
    const vistos = new Set(S.achados.lugares.map(l => l.id));
    // bem avaliados e com mais avaliações no topo (escritório ativo gera mais cálculo)
    const pontos = l => (l.nota || 0) * Math.log10((l.avaliacoes || 0) + 1);
    const todos = S.achados.lugares.concat(lugares.filter(l => !vistos.has(l.id))).sort((a, b) => (a.ja - b.ja) || pontos(b) - pontos(a));
    const sel = S.achados.sel; lugares.forEach(l => { if (!l.ja && tipoTel(l.telefone) === 'celular') sel.add(l.id); }); // já vêm marcados os novos com celular
    S.achados = { ...S.achados, lugares: todos, proxima, carregando: false, sel };
    if (!lugares.length) toast('Nenhum escritório encontrado. Tente outro termo ou uma cidade vizinha.');
  } catch (e) {
    S.achados = { ...S.achados, carregando: false, erro: e.codigo === 'sem_chave' ? 'sem_chave' : e.codigo === 'sem_funcao' ? 'A função buscar-escritorios ainda não foi publicada no Supabase.' : (e.message || String(e)) };
  }
  render();
}
async function addAchados() {
  const A = S.achados; if (!A || !A.sel.size) return;
  const escolhidos = A.lugares.filter(l => A.sel.has(l.id) && !l.ja);
  let n = 0;
  await seguro(async () => {
    for (const l of escolhidos) {
      if (duplicado({ nome: l.nome, cidade: l.cidade, whatsapp: l.telefone })) { l.ja = true; continue; }
      const fixo = tipoTel(l.telefone) === 'fixo';
      await criar('prospects', { nome: l.nome, escritorio: l.nome, cidade: l.cidade, whatsapp: l.telefone || null, site: l.site || null, maps: l.maps || null, area: 'Trabalhista', fonte: 'Google Maps', status: 'a_contatar',
        obs: [fixo ? 'Telefone fixo: ligar ou procurar o WhatsApp no site.' : '', l.nota ? `Google: ★ ${l.nota} (${l.avaliacoes} avaliações).` : '', l.endereco || ''].filter(Boolean).join(' ').slice(0, 500) || null });
      l.ja = true; n++;
    }
  });
  A.sel = new Set(); toast(`${n} contato(s) adicionado(s) à fila de prospecção`); render();
}

async function editarProsp(p) {
  const v = await abrirForm(p ? 'Editar contato' : 'Novo contato para prospecção', camposProsp(), p || {}, { apagar: !!p });
  if (!v) return;
  await seguro(async () => {
    if (v === '__apagar__') { await apagar('prospects', p.id); return render(); }
    const d = duplicado(v, p?.id);
    if (d && !confirm(`Parece repetido: "${d.nome}" (${d.cidade || 'sem cidade'}) já está na lista. Salvar mesmo assim?`)) return;
    if (p) await atualizar('prospects', p.id, v); else await criar('prospects', v);
    render();
  });
}

/* colar lista: aceita colunas copiadas de planilha (Tab), ; ou , */
const COLUNAS_PROSP = { nome: /^(nome|advogad|contato)/, escritorio: /^(escrit|empresa|razao)/, cidade: /^(cidade|local|municip)/, whatsapp: /^(whats|telefone|fone|celular|tel)/, email: /^(e-?mail)/, site: /^(site|website|url)/, instagram: /^(insta)/, linkedin: /^(linked)/, maps: /^(maps|google ?maps|mapa)/, oab: /^oab/, area: /^(area|especial)/, obs: /^(obs|nota)/, fonte: /^(fonte|origem)/ };
function lerListaColada(texto) {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return [];
  const sep = linhas[0].includes('\t') ? '\t' : (linhas[0].split(';').length > linhas[0].split(',').length ? ';' : ',');
  const partir = l => l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
  const cab = partir(linhas[0]).map(h => roboNorm(h));
  const mapa = cab.map(h => Object.keys(COLUNAS_PROSP).find(k => COLUNAS_PROSP[k].test(h)) || null);
  const temCab = mapa.filter(Boolean).length >= 2;
  const ordem = temCab ? mapa : ['nome', 'escritorio', 'cidade', 'whatsapp', 'email', 'site', 'instagram'];
  return (temCab ? linhas.slice(1) : linhas).map(l => {
    const cols = partir(l), p = {};
    ordem.forEach((k, i) => { if (k && cols[i]) p[k] = cols[i]; });
    return p;
  }).filter(p => p.nome);
}
function colarProsp() {
  const fundo = document.createElement('div'); fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal"><h2>📋 Colar lista</h2>
    <p class="desc">Copie as linhas de uma planilha (Excel/Google Planilhas) e cole aqui. Se a 1ª linha tiver títulos (Nome, Escritório, Cidade, WhatsApp, E-mail, Site, Instagram, LinkedIn, Maps, OAB, Obs), eles são reconhecidos. Sem títulos, a ordem é: <b>Nome · Escritório · Cidade · WhatsApp · E-mail · Site · Instagram</b>. Repetidos são ignorados.</p>
    <textarea id="colaTxt" rows="10" style="width:100%;border:1px solid var(--axis);border-radius:8px;padding:10px;font:13px monospace" placeholder="Nome	Escritório	Cidade	WhatsApp	E-mail	Site	Instagram"></textarea>
    <div class="linha" style="margin-top:6px"><label class="rotulo" style="margin:0">Onde achou:</label><select class="f" id="colaFonte">${FONTES_PROSP.map(x => `<option>${x}</option>`).join('')}</select><span class="desc" id="colaPrev"></span></div>
    <div class="rodape"><button type="button" class="btn sec" id="colaCanc">Cancelar</button><button class="btn" id="colaOk">Importar</button></div></div>`;
  document.body.appendChild(fundo);
  const prev = () => { const l = lerListaColada($('#colaTxt').value); const vistos = new Set(); const novos = l.filter(p => { const k = chaveDup(p).join('#'); if (duplicado(p) || vistos.has(k)) return false; vistos.add(k); return true; }); $('#colaPrev').textContent = l.length ? `${l.length} linha(s) · ${novos.length} nova(s) · ${l.length - novos.length} repetida(s)` : ''; };
  $('#colaTxt').addEventListener('input', prev);
  $('#colaCanc').onclick = () => fundo.remove();
  fundo.addEventListener('click', e => { if (e.target === fundo) fundo.remove(); });
  $('#colaOk').onclick = () => seguro(async () => {
    const l = lerListaColada($('#colaTxt').value), fonte = $('#colaFonte').value;
    let n = 0;
    for (const p of l) { if (duplicado(p)) continue; await criar('prospects', { area: 'Trabalhista', ...p, fonte: p.fonte || fonte, status: 'a_contatar' }); n++; }
    fundo.remove(); toast(`${n} contato(s) importado(s)`); render();
  });
  setTimeout(() => $('#colaTxt').focus(), 30);
}
function exportProsp() {
  const cols = ['nome', 'escritorio', 'cidade', 'area', 'whatsapp', 'email', 'site', 'instagram', 'linkedin', 'maps', 'oab', 'fonte', 'status', 'tentativas', 'ultimo_contato', 'proximo_contato', 'obs'];
  baixarArquivo(`prospeccao-${hoje()}.csv`, csv([cols, ...S.prospects.map(p => cols.map(k => k === 'status' ? STATUS_PROSP[p[k]] || p[k] : p[k]))]));
}
async function configProsp() {
  const c = cfgProsp();
  const v = await abrirForm('⚙ Mensagens da prospecção', [
    { k: 'remetente', rot: 'Seu nome na mensagem (ex.: Felipe). Vazio = "Aqui é da Pontes Ferreira"' },
    { k: 'oferta', rot: 'Oferta do 1º cálculo (entra na apresentação). Vazio = sem oferta', full: true },
    { k: 'meta_dia', rot: 'Meta de abordagens por dia', tipo: 'number' },
    { k: 'dias_follow1', rot: '2º contato depois de (dias)', tipo: 'number' }, { k: 'dias_follow2', rot: '3º contato depois de (dias, contando do 1º)', tipo: 'number' },
    { k: 'max_tentativas', rot: 'Máximo de contatos por pessoa', tipo: 'number' },
    { k: 't_primeiro', rot: '1º contato (apresentação): várias versões separadas por uma linha ---. Marcadores: {nome}, {link}, {eu}, {oferta}', tipo: 'textarea', full: true },
    { k: 't_follow1', rot: '2º contato (lembrete): versões separadas por ---', tipo: 'textarea', full: true },
    { k: 't_follow2', rot: '3º contato (último): versões separadas por ---', tipo: 'textarea', full: true },
    { k: 't_email_assunto', rot: 'Assunto do e-mail', full: true }
  ], { ...c, ...Object.fromEntries(Object.entries(c.textos).map(([k, x]) => ['t_' + k, x])) });
  if (!v) return;
  const textos = {}; Object.keys(PROSP_PADRAO.textos).forEach(k => { if (v['t_' + k] && v['t_' + k] !== PROSP_PADRAO.textos[k]) textos[k] = v['t_' + k]; delete v['t_' + k]; });
  const novo = { meta_dia: v.meta_dia || 20, dias_follow1: v.dias_follow1 || 3, dias_follow2: v.dias_follow2 || 7, max_tentativas: v.max_tentativas || 3, remetente: v.remetente || '', oferta: (v.oferta || '').trim(), textos };
  await seguro(async () => { await ajustesDb.salvar('prospeccao', novo); S.ajustes.prospeccao = novo; toast('Mensagens salvas'); render(); });
}

/* ---------------- Tráfego pago ---------------- */
const SITE_URL = 'https://pontesferreiracalculos.com/';
const ABAS_TRAFEGO = { ativacao: '1. Ativação', resultados: '2. Resultados', google: '📊 Google Ads', monitor: '🔔 Monitoramento', campanhas: '3. Campanhas prontas', links: '4. Links UTM', offline: '5. Conversões offline' };
const VALIDA_RAST = {
  ga4_id: [v => /^G-[A-Z0-9]{6,14}$/.test(v), 'Formato: G-XXXXXXXXXX'],
  gads_id: [v => /^AW-\d{8,12}$/.test(v), 'Formato: AW-1234567890'],
  gads_label: [v => /^[A-Za-z0-9_-]{6,40}$/.test(v), 'Só o rótulo, sem o AW- (ex.: AbCdEfGh123)'],
  meta_pixel_id: [v => /^\d{14,17}$/.test(v), 'Só números (15 ou 16 dígitos)'],
  clarity_id: [v => /^[a-z0-9]{6,14}$/.test(v), 'Só o ID do projeto (ex.: abc12de3fg)']
};
const UTM_GOOGLE = c => `utm_source=google&utm_medium=cpc&utm_campaign=${c}&utm_term={keyword}&utm_content={creative}`;
const UTM_META = 'utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}';

/* Kit das campanhas (vem da ESTRATEGIA_ADS.md), pronto para copiar e colar */
const KIT = [
  {
    id: 'google_pesquisa_calculo', canal: 'Google Ads', nome: 'Pesquisa | Cálculo Trabalhista', diaria: 16, verbaMes: 500,
    resumo: 'Canal principal: aparece para quem pesquisa o serviço no Google, com o problema na mão.',
    config: [
      ['Objetivo', 'Leads → tipo Pesquisa (desmarque "Rede de Display" e "Parceiros de pesquisa")'],
      ['Conversão', 'Use só a ação "Lead do site" (a que você criou na Ativação)'],
      ['Locais', 'Brasil inteiro · "Presença: pessoas no local ou que estão regularmente nele" · após 30 dias, veja Painel > Mapa do Brasil e aumente o lance (+20%) nos estados que mais geram pedidos'],
      ['Idioma', 'Português'],
      ['Lances', 'Semanas 1–4: Maximizar cliques com CPC máximo R$ 4 · depois de ~30 conversões: Maximizar conversões · depois: CPA desejado'],
      ['Orçamento', 'R$ 16/dia (≈ R$ 500/mês). Com verba curta, comece só com os grupos Liquidação, PJe-Calc e Calculista; ligue Impugnação e Inicial quando sobrar verba'],
      ['Correspondência', 'Só frase e exata (palavra entre aspas ou colchetes). Nada de correspondência ampla com essa verba'],
      ['Programação', 'Seg a sex 8h–19h (sem fim de semana enquanto a verba for curta)'],
      ['Sufixo do URL final', UTM_GOOGLE('google_pesquisa_calculo')],
      ['URL final', SITE_URL]
    ],
    grupos: [
      ['Liquidação', ['cálculo de liquidação trabalhista', 'liquidação de sentença trabalhista', 'cálculo liquidação pje calc', 'cálculo de liquidação de sentença']],
      ['PJe-Calc', ['pje calc', 'fazer cálculo pje calc', 'calculista pje calc', 'serviço pje calc', 'cálculo no pje calc']],
      ['Impugnação', ['impugnação aos cálculos trabalhista', 'impugnar cálculo perito', 'contador para impugnação de cálculos', 'impugnação de cálculos']],
      ['Calculista', ['calculista trabalhista', 'perito contador trabalhista', 'contador trabalhista para advogados', 'cálculos trabalhistas para advogados']],
      ['Inicial', ['cálculo para petição inicial trabalhista', 'liquidação dos pedidos inicial', 'cálculo da inicial trabalhista']]
    ],
    negativas: ['grátis', 'gratis', 'gratuito', 'online grátis', 'calculadora', 'rescisão', 'curso', 'apostila', 'download', 'baixar', 'como fazer', 'tutorial', 'vaga', 'emprego', 'concurso', 'salário de calculista', 'quanto ganha', 'meus direitos', 'fgts saque', 'seguro desemprego', 'planilha', 'modelo', 'pdf', 'manual', 'treinamento'],
    titulos: ['Cálculo Trabalhista R$ 250', 'Só Informe o Nº do Processo', 'Informe o Nº, Nós Calculamos', 'Cálculo Trabalhista em 48h', 'Liquidação no PJe-Calc', 'Entrega do Arquivo .PJC', 'Para Advogados Trabalhistas', 'Prazo Correndo? Fale Agora', 'Orçamento em 1 Hora Útil', 'Impugnação de Cálculos', 'Preço Fechado Antes', 'Pontes Ferreira Cálculos', 'Todos os TRTs do Brasil', 'Resumo do Que Foi Deferido', 'Orçamento pelo WhatsApp'],
    descricoes: ['A partir de R$ 250. Informe só o número do processo. Entrega do .PJC em 48h.', 'Leitura de sentença, acórdão e embargos. Você recebe .PJC, relatório PDF e resumo.', 'Prazo de liquidação correndo? Envie o processo e receba o orçamento ainda hoje.', 'Cálculos para advogados trabalhistas de todo o Brasil. Preço fechado antes de começar.'],
    sitelinks: [['Preços', 'A partir de R$ 250', 'Preço fechado antes de começar', SITE_URL + '#precos'], ['Enviar o processo', 'Só o número do processo', 'Orçamento em 1 hora útil', SITE_URL + '#form'], ['Serviços', 'Liquidação e impugnação', 'Inicial, atualização e parecer', SITE_URL + '#servicos'], ['Como funciona', 'Quatro passos', 'Sem reunião, tudo online', SITE_URL + '#como-funciona']],
    destaques: ['Entrega em 48h', 'Arquivo .PJC incluso', 'Todos os TRTs', 'Orçamento em 1h', 'Preço fechado', 'Envie só o nº']
  },
  {
    id: 'google_remarketing', canal: 'Google Ads', nome: 'Remarketing | Display', diaria: 5, verbaMes: 150,
    resumo: 'Mostra banners para quem visitou o site e não pediu orçamento. Só funciona depois de ~100 visitantes na lista.',
    config: [
      ['Antes', 'Ferramentas > Gerenciador de públicos > Segmentos: crie "Visitantes do site – 30 dias" (fonte: tag do Google)'],
      ['Objetivo', 'Leads → tipo Display'],
      ['Segmento', 'Visitantes do site – 30 dias · desmarque "segmentação otimizada"'],
      ['Lances', 'Maximizar conversões'],
      ['Orçamento', 'R$ 5/dia'],
      ['Frequência', 'Máximo de 3 impressões por dia por pessoa'],
      ['Sufixo do URL final', UTM_GOOGLE('google_remarketing')],
      ['URL final', SITE_URL + '#form']
    ],
    titulos: ['Seu Prazo Ainda Está Correndo?', 'Cálculo Trabalhista R$ 250', 'Envie Só o Nº do Processo', 'Entrega do .PJC em 48h', 'Orçamento em 1 Hora Útil'],
    descricoes: ['Ainda precisa do cálculo? Informe o número do processo e receba o orçamento hoje.', 'Cálculo no PJe-Calc a partir de R$ 250, com relatório e resumo do que foi deferido.'],
    extra: 'Imagens: suba o logotipo (quadrado e horizontal) e 2–3 imagens (1200×628 e 1200×1200) com o texto "Cálculo trabalhista em 48h · a partir de R$ 250".'
  },
  {
    id: 'meta_topo_reels', canal: 'Meta Ads', nome: 'Topo | Clique para WhatsApp', diaria: 13, verbaMes: 400,
    resumo: 'Coloca a marca na memória do advogado e abre conversa direto no WhatsApp. O lead cai sozinho no painel com origem Meta Ads.',
    config: [
      ['Objetivo', 'Engajamento → Mensagens → WhatsApp (número (21) 98770-8652)'],
      ['Nome da campanha', 'meta_topo_reels (o painel usa o nome para separar os resultados)'],
      ['Público', 'Brasil inteiro · 25–60 anos · interesses: Advocacia, Direito do trabalho, Ordem dos Advogados do Brasil, Processo do trabalho, Jusbrasil · cargo: Advogado(a)'],
      ['Teste A/B', 'Conjunto 2 com Advantage+ público aberto (sem interesses)'],
      ['Posicionamentos', 'Advantage+ (automático)'],
      ['Orçamento', 'R$ 13/dia na campanha (≈ R$ 400/mês)'],
      ['Mensagem inicial', 'Olá! Vim pelo anúncio e quero um orçamento de cálculo trabalhista.']
    ],
    criativos: [
      ['Reels 20s: "Intimado para apresentar cálculos?"', 'Tela do PJe-Calc gravada + legenda grande.', 'Intimado para apresentar os cálculos e sem tempo para o PJe-Calc? 📄\n\nInforme o número do processo. Em até 48h você recebe o arquivo .PJC, o relatório e o resumo do que foi deferido.\n\nA partir de R$ 250. Orçamento em 1 hora útil pelo WhatsApp.', 'Cálculo trabalhista em 48h'],
      ['Carrossel: "5 erros na liquidação que custam caro"', 'Cards: 1) índice errado (ADC 58) · 2) termo inicial da prescrição · 3) reflexos em cascata · 4) base do intervalo · 5) INSS cota empregado · 6) "Quer que a gente confira a sua conta?"', 'Um erro de índice ou de reflexo pode custar milhares de reais na liquidação. Veja os 5 mais comuns 👉\n\nQuer que a gente confira a sua conta? Chame no WhatsApp.', 'Confira sua conta de liquidação'],
      ['Imagem: antes × depois', 'Conta do perito × conta revisada (valores ilustrativos).', 'R$ 23 mil de diferença numa impugnação. Revisamos a conta do perito e entregamos a impugnação com o .PJC.\n\nA partir de R$ 250.', 'Impugnação de cálculos']
    ]
  },
  {
    id: 'meta_remarketing', canal: 'Meta Ads', nome: 'Remarketing | Lead', diaria: 10, verbaMes: 300,
    resumo: 'Fala de novo com quem já viu o site ou os vídeos. É a verba mais barata por lead.',
    config: [
      ['Antes', 'Públicos > Criar público personalizado: (1) Site – todos os visitantes 30 dias · (2) Vídeo – 50% dos Reels, 60 dias · (3) Instagram – engajou com o perfil, 60 dias'],
      ['Objetivo', 'Leads → site, evento de conversão "Lead" (Pixel)'],
      ['Nome da campanha', 'meta_remarketing'],
      ['Público', 'Os 3 públicos acima · exclua quem já é cliente (suba a lista da aba Conversões offline)'],
      ['Orçamento', 'R$ 10/dia (≈ R$ 300/mês)'],
      ['Parâmetros de URL', UTM_META],
      ['URL do site', SITE_URL + '#form']
    ],
    criativos: [
      ['Oferta de 1º cálculo', 'Imagem simples com a oferta.', 'Seu prazo de cálculo ainda está correndo? ⏳\n\nNo primeiro cálculo com a Pontes Ferreira você tem 20% de desconto. Informe o número do processo.', 'Primeiro cálculo com 20% off'],
      ['Revisão grátis da conta do perito', 'Imagem com "Revisão grátis".', 'Recebeu a conta do perito? Fazemos uma revisão gratuita e dizemos se vale impugnar.', 'Revisão grátis da conta do perito']
    ]
  }
];
const campanhasConhecidas = () => [...new Set([...KIT.map(k => k.id), ...S.leads.map(l => l.utm_campaign).filter(Boolean), ...S.despesas.map(d => d.campanha).filter(Boolean)])];

/* ajustes (Supabase "ajustes" ou localStorage no modo demonstração) */
const ajustesDb = {
  async ler() {
    if (DEMO) { try { return JSON.parse(localGet('pf_ajustes')) || {}; } catch { return {}; } }
    const { data, error } = await sb.from('ajustes').select('chave,valor');
    if (error) throw error; return Object.fromEntries((data || []).map(r => [r.chave, r.valor || {}]));
  },
  async salvar(chave, valor) {
    if (DEMO) { const a = await ajustesDb.ler(); a[chave] = valor; localSet('pf_ajustes', JSON.stringify(a)); return; }
    const { error } = await sb.from('ajustes').upsert({ chave, valor, publico: chave === 'rastreamento', updated_at: new Date().toISOString() });
    if (error) throw error;
  }
};
const rast = () => S.ajustes.rastreamento || (S.ajustes.rastreamento = {});
const traf = () => S.ajustes.trafego || (S.ajustes.trafego = {});
const feito = k => !!(traf().feito || {})[k];
async function salvarTrafego(patch) { S.ajustes.trafego = { ...traf(), ...patch }; await ajustesDb.salvar('trafego', S.ajustes.trafego); }

/* copiar para a área de transferência */
let COPIAS = [];
const btnCopiar = (txt, rot = 'Copiar') => { COPIAS.push(String(txt)); return `<button class="btn mini sec" data-copiar="${COPIAS.length - 1}">📋 ${esc(rot)}</button>`; };
async function copiarTexto(txt) {
  try { await navigator.clipboard.writeText(txt); }
  catch { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast('Copiado');
}
function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: tipo })); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// células que começam com = + - @ viram texto (evita fórmula maliciosa ao abrir no Excel/Planilhas)
const csv = linhas => linhas.map(l => l.map(v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');

/* números da área de tráfego */
const ehAds = l => ['Google Ads', 'Meta Ads'].includes(canalLead(l));
const campanhaDoLead = l => l.utm_campaign || (ehAds(l) ? `(${canalLead(l)} sem campanha)` : null);
function valorDoLead(l) { const cs = S.calculos.filter(c => c.lead_id === l.id); return cs.length ? soma(cs, c => c.valor_cobrado) : (l.status === 'fechado' ? Number(l.valor_orcado) || 0 : 0); }
function metricasTrafego() {
  const ini = inicioPeriodo();
  const leads = S.leads.filter(l => noPeriodo(l.created_at, ini) && ehAds(l));
  const gastos = S.despesas.filter(d => noPeriodo(d.data, ini) && CANAIS_ADS.includes(d.canal));
  const gasto = soma(gastos, d => d.valor);
  const fechados = leads.filter(l => l.status === 'fechado');
  const faturado = soma(fechados, valorDoLead);
  const ticket = Number(traf().ticket_medio) || (() => { const e = S.calculos.filter(c => c.valor_cobrado); return e.length ? soma(e, c => c.valor_cobrado) / e.length : 250; })();
  const porCamp = {};
  const linha = k => porCamp[k] || (porCamp[k] = { k, canal: '', leads: 0, orc: 0, fech: 0, gasto: 0, fat: 0 });
  leads.forEach(l => { const r = linha(campanhaDoLead(l)); r.canal = canalLead(l); r.leads++; if (l.status !== 'novo') r.orc++; if (l.status === 'fechado') { r.fech++; r.fat += valorDoLead(l); } });
  gastos.forEach(d => { const r = linha(d.campanha || `(${d.canal} sem campanha)`); r.canal = r.canal || d.canal; r.gasto += Number(d.valor) || 0; });
  const termos = {};
  leads.filter(l => l.utm_term).forEach(l => { const t = l.utm_term.toLowerCase(); (termos[t] = termos[t] || { t, n: 0, f: 0 }); termos[t].n++; if (l.status === 'fechado') termos[t].f++; });
  return { ini, leads, gastos, gasto, fechados, faturado, ticket, campanhas: Object.values(porCamp).sort((a, b) => b.gasto - a.gasto || b.leads - a.leads), termos: Object.values(termos).sort((a, b) => b.n - a.n).slice(0, 12) };
}
function ritmoVerba() {
  const d = new Date(), ini = isoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
  const diasMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), fracao = d.getDate() / diasMes;
  return [['Google Ads', Number(traf().verba_google) || 0], ['Meta Ads', Number(traf().verba_meta) || 0]].map(([canal, verba]) => {
    const gasto = soma(S.despesas.filter(x => x.canal === canal && x.data >= ini), x => x.valor);
    return { canal, verba, gasto, esperado: verba * fracao, pct: verba ? gasto / verba : 0 };
  });
}
function alertasTrafego(t) {
  const a = [], cacMax = Number(traf().cac_maximo) || 0;
  t.campanhas.forEach(c => {
    if (c.gasto >= 3 * t.ticket && !c.fech) a.push(['crit', `<b>${esc(c.k)}</b>: ${brl0(c.gasto)} investidos e nenhum cliente fechado. Revise os termos de pesquisa e os anúncios ou pause.`]);
    else if (cacMax && c.fech && c.gasto / c.fech > cacMax) a.push(['warn', `<b>${esc(c.k)}</b>: custo por cliente ${brl0(c.gasto / c.fech)}, acima do máximo de ${brl0(cacMax)}.`]);
    if (c.leads >= 5 && c.orc / c.leads < .6) a.push(['warn', `<b>${esc(c.k)}</b>: só ${pct(c.orc / c.leads)} dos leads receberam orçamento. Lead de anúncio esfria rápido: responda em até ${MIN_RESPOSTA} min.`]);
  });
  ritmoVerba().forEach(r => {
    if (!r.verba) return;
    if (r.gasto > r.esperado * 1.15 && r.gasto > 50) a.push(['warn', `${r.canal}: gasto do mês (${brl0(r.gasto)}) acima do ritmo da verba (${brl0(r.esperado)} até hoje).`]);
  });
  const semUtm = t.leads.filter(l => !l.utm_campaign && !l.gclid && !l.fbclid).length;
  if (semUtm >= 3) a.push(['warn', `${semUtm} leads de anúncio sem identificação de campanha. Confira o sufixo do URL (Google) e os parâmetros de URL (Meta) na aba Campanhas prontas.`]);
  const ga = S.leads.filter(l => canalLead(l) === 'Google Ads' && l.status === 'fechado' && l.gclid && l.gclid !== 'demo');
  if (ga.length && !feito('offline_' + hoje().slice(0, 7))) a.push(['azul', `${ga.length} cliente(s) do Google com gclid. Envie as conversões offline (aba 5) para o Google aprender quem fecha.`]);
  return a;
}

/* telas */
/* ---------------- Tráfego pago > Google Ads: relatório do Google + dados do painel ---------------- */
// O Google Ads não manda os números para cá sozinho: você baixa o relatório (CSV) lá e importa aqui.
// O painel junta com o que ele já sabe pelo utm_term (palavra-chave): visitas, pedidos, clientes fechados e faturamento.
const GADS_TIPOS = { palavras: 'Palavras-chave', termos: 'Termos de pesquisa', dias: 'Por dia', campanhas: 'Campanhas' };
const GADS_RUINS = /gr[aá]tis|gratuit|calculadora|curso|apostila|download|baixar|como fazer|como calcular|tutorial|vaga|emprego|concurso|sal[aá]rio d|quanto ganha|meus direitos|fgts|seguro desemprego|rescis[aã]o|planilha|modelo|pdf|manual|treinamento|online gr|aplicativo|app\b|excel/i;
const normTermo = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/["\[\]+]/g, '').replace(/\s+/g, ' ').trim();
// CSV com aspas, vírgula/ponto e vírgula/tab (o Google exporta com 1–2 linhas de título antes do cabeçalho)
function lerCsv(texto) {
  const linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const amostra = linhas.slice(0, 5).join('\n');
  const sep = amostra.includes('\t') ? '\t' : (amostra.split(';').length > amostra.split(',').length ? ';' : ',');
  return linhas.map(l => { const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) { const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out.map(x => x.trim()); });
}
const numGads = v => { const t = String(v ?? '').replace(/[R$\s%]/g, ''); if (!t || t === '--' || t === '—') return 0; return numBR(t) || 0; };
const COLS_GADS = {
  termo: /^(termo de pesquisa|search term)$/, palavra: /^(palavra-chave|palavra chave|keyword|palavra-chave de pesquisa)$/, correspondencia: /^(tipo de correspond|match type|correspond)/,
  dia: /^(dia|day|data|date)$/, campanha: /^(campanha|campaign)$/, grupo: /^(grupo de an|ad group)/,
  impr: /^(impr|impressions)/, cliques: /^(cliques|clicks|intera[cç][oõ]es|interactions)$/, custo: /^(custo|cost)$/,
  conv: /^(convers[oõ]es|conversions|todas as conv)/, status: /^(status|estado)/
};
function interpretarRelatorio(texto) {
  const rows = lerCsv(texto);
  const iCab = rows.findIndex(r => r.filter(c => Object.values(COLS_GADS).some(rx => rx.test(roboNorm(c)) || rx.test(c.toLowerCase()))).length >= 3);
  if (iCab < 0) throw new Error('Não reconheci o relatório. Baixe em CSV pelo Google Ads (botão ⬇ Download) e importe o arquivo inteiro.');
  const cab = rows[iCab].map(c => c.toLowerCase());
  const col = {}; cab.forEach((c, i) => { const k = Object.keys(COLS_GADS).find(k => COLS_GADS[k].test(c) || COLS_GADS[k].test(roboNorm(c))); if (k && col[k] == null) col[k] = i; });
  if (col.cliques == null && col.impr == null) throw new Error('O relatório precisa das colunas de impressões e cliques.');
  const tipo = col.termo != null ? 'termos' : col.palavra != null ? 'palavras' : col.dia != null ? 'dias' : 'campanhas';
  const periodo = rows.slice(0, iCab).map(r => r.join(' ')).find(l => /\d{4}/.test(l)) || '';
  const linhas = rows.slice(iCab + 1).filter(r => r.length >= cab.length - 1 && !/^(total|totais)/i.test(r[0] || '') && !/^total/i.test(r[col.termo ?? col.palavra ?? col.dia ?? col.campanha ?? 0] || ''))
    .map(r => ({
      termo: col.termo != null ? r[col.termo] : '', palavra: col.palavra != null ? r[col.palavra] : '', correspondencia: col.correspondencia != null ? r[col.correspondencia] : '',
      dia: col.dia != null ? r[col.dia] : '', campanha: col.campanha != null ? r[col.campanha] : '', grupo: col.grupo != null ? r[col.grupo] : '', status: col.status != null ? r[col.status] : '',
      impr: numGads(r[col.impr]), cliques: numGads(r[col.cliques]), custo: numGads(r[col.custo]), conv: numGads(r[col.conv])
    })).filter(x => x.termo || x.palavra || x.dia || x.campanha).slice(0, 2000);
  if (!linhas.length) throw new Error('O relatório não tem linhas com dados.');
  return { tipo, periodo: periodo.replace(/\s+/g, ' ').trim().slice(0, 80), importado_em: new Date().toISOString(), linhas };
}
const gadsRel = () => S.ajustes.gads || {};
function importarGads() {
  const fundo = document.createElement('div'); fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal"><h2>⬆ Importar relatório do Google Ads</h2>
    <ol class="desc" style="padding-left:18px;line-height:1.6">
      <li>No Google Ads, abra <b>Campanhas › Insights e relatórios › Termos de pesquisa</b> (ou <b>Palavras-chave</b>, ou <b>Campanhas</b> com o período desejado).</li>
      <li>Clique em <b>⬇ Fazer download › CSV</b>.</li>
      <li>Escolha o arquivo abaixo. Pode importar os três: cada tipo fica guardado separado e o mais novo substitui o anterior.</li></ol>
    <input type="file" id="gadsArq" accept=".csv,.txt,.tsv" style="margin:8px 0">
    <div class="desc" style="margin-top:6px">Ou cole aqui a tabela copiada da tela do Google Ads (com o cabeçalho):</div>
    <textarea id="gadsTxt" rows="6" style="width:100%;border:1px solid var(--axis);border-radius:8px;padding:10px;font:12px monospace"></textarea>
    <div class="desc" id="gadsPrev"></div>
    <div class="rodape"><button type="button" class="btn sec" id="gadsCanc">Cancelar</button><button class="btn" id="gadsOk">Importar</button></div></div>`;
  document.body.appendChild(fundo);
  let texto = '';
  const prever = () => { try { const r = interpretarRelatorio(texto); $('#gadsPrev').textContent = `✓ ${GADS_TIPOS[r.tipo]} · ${r.linhas.length} linha(s)${r.periodo ? ' · ' + r.periodo : ''}`; } catch (e) { $('#gadsPrev').textContent = texto ? '⚠ ' + e.message : ''; } };
  $('#gadsArq').onchange = async e => { const f = e.target.files[0]; if (!f) return; const buf = await f.arrayBuffer(); texto = new TextDecoder(/\x00/.test(new TextDecoder('latin1').decode(buf.slice(0, 200))) ? 'utf-16le' : 'utf-8').decode(buf); prever(); };
  $('#gadsTxt').oninput = e => { texto = e.target.value; prever(); };
  $('#gadsCanc').onclick = () => fundo.remove();
  $('#gadsOk').onclick = () => seguro(async () => {
    const r = interpretarRelatorio(texto);
    const novo = { ...gadsRel(), [r.tipo]: r };
    await ajustesDb.salvar('gads', novo); S.ajustes.gads = novo;
    fundo.remove(); toast(`${GADS_TIPOS[r.tipo]} importado: ${r.linhas.length} linha(s)`); render();
  });
}
async function carregarEventosGoogle(forcar) {
  const ini = inicioPeriodo();
  if (DEMO || (S.gadsEv && S.gadsEv.ini === ini && !forcar && Date.now() - S.gadsEv.em < 300000)) return;
  S.gadsEv = { ini, em: Date.now(), lista: S.gadsEv?.ini === ini ? S.gadsEv.lista : [] };
  try {
    let lista = [];
    for (let de = 0; de < 20000; de += 1000) {
      const { data, error } = await sb.from('eventos').select('tipo,sessao,utm_term,utm_campaign,created_at').eq('utm_source', 'google').gte('created_at', inicioPeriodo() + 'T00:00:00-03:00').range(de, de + 999);
      if (error) throw error; lista = lista.concat(data); if (data.length < 1000) break;
    }
    S.gadsEv = { ini, em: Date.now(), lista }; render();
  } catch (e) { console.warn('eventos google', e); }
}
function trafegoGoogle() {
  carregarEventosGoogle();
  const rel = gadsRel(), ini = inicioPeriodo();
  const base = rel.campanhas || rel.palavras || rel.termos || rel.dias;
  const tot = (base?.linhas || []).reduce((a, x) => ({ impr: a.impr + x.impr, cliques: a.cliques + x.cliques, custo: a.custo + x.custo, conv: a.conv + x.conv }), { impr: 0, cliques: 0, custo: 0, conv: 0 });
  // painel: leads e eventos que vieram do Google (gclid ou utm_source=google)
  const leads = S.leads.filter(l => noPeriodo(l.created_at, ini) && canalLead(l) === 'Google Ads');
  const fech = leads.filter(l => l.status === 'fechado'), fat = soma(fech, valorDoLead);
  const ev = S.gadsEv?.lista || [];
  const sess = t => new Set(ev.filter(e => !t || e.tipo === t).map(e => e.sessao)).size;
  const visitas = sess('visita'), contatos = new Set(ev.filter(e => e.tipo === 'whatsapp' || e.tipo === 'pedido').map(e => e.sessao)).size;
  // por palavra-chave: Google (relatório) + painel (utm_term)
  const porPalavra = {};
  const lin = k => porPalavra[k] || (porPalavra[k] = { k, rot: '', corr: '', impr: 0, cliques: 0, custo: 0, conv: 0, visitas: new Set(), leads: 0, fech: 0, fat: 0 });
  (rel.palavras?.linhas || []).forEach(x => { const r = lin(normTermo(x.palavra)); r.rot = r.rot || x.palavra.replace(/^"|"$/g, ''); r.corr = x.correspondencia || r.corr; r.impr += x.impr; r.cliques += x.cliques; r.custo += x.custo; r.conv += x.conv; });
  ev.filter(e => e.tipo === 'visita' && e.utm_term).forEach(e => { const r = lin(normTermo(e.utm_term)); r.rot = r.rot || e.utm_term; r.visitas.add(e.sessao); });
  leads.filter(l => l.utm_term).forEach(l => { const r = lin(normTermo(l.utm_term)); r.rot = r.rot || l.utm_term; r.leads++; if (l.status === 'fechado') { r.fech++; r.fat += valorDoLead(l); } });
  const palavras = Object.values(porPalavra).sort((a, b) => b.custo - a.custo || b.cliques - a.cliques || b.leads - a.leads);
  const cpcMedio = tot.cliques ? tot.custo / tot.cliques : 0;
  const situacao = r => {
    if (r.fech) return ['t-good', 'Trouxe cliente'];
    if (r.leads) return ['t-good', 'Gera pedidos'];
    if (r.impr && !r.cliques) return ['t-neutro', 'Sem cliques'];
    if (r.impr >= 100 && r.cliques / r.impr < .03) return ['t-warn', 'CTR baixo'];
    if (r.custo >= Math.max(40, cpcMedio * 10) && !r.conv) return ['t-crit', 'Gasta sem pedido'];
    return ['t-neutro', 'Observando'];
  };
  // termos de pesquisa: sugere negativas
  const termos = [...(rel.termos?.linhas || [])].sort((a, b) => b.custo - a.custo || b.cliques - a.cliques);
  const minhas = new Set([...(rel.palavras?.linhas || []), ...(rel.termos?.linhas || [])].map(x => normTermo(x.palavra)).filter(Boolean));
  // nunca sugere negativar uma palavra-chave sua; termo sem conversão só é marcado depois de gastar de verdade
  const sugerirNegativa = x => !x.conv && !minhas.has(normTermo(x.termo)) && (GADS_RUINS.test(x.termo) || (x.cliques >= 5 && x.custo >= Math.max(30, cpcMedio * 8)));
  const negativas = [...new Set(termos.filter(sugerirNegativa).map(x => x.termo.toLowerCase()))];
  const dias = [...(rel.dias?.linhas || [])].sort((a, b) => String(a.dia).localeCompare(String(b.dia))).slice(-30);
  const funil = [['Impressões', tot.impr], ['Cliques no anúncio', tot.cliques], ['Visitas ao site (Google)', visitas], ['Contatos (WhatsApp ou formulário)', contatos], ['Pedidos no painel', leads.length], ['Clientes fechados', fech.length]];
  const roas = tot.custo ? fat / tot.custo : NaN;
  const info = Object.entries(GADS_TIPOS).map(([k, v]) => rel[k] ? `<span class="tag t-good">✓ ${v}${rel[k].periodo ? ' · ' + esc(rel[k].periodo) : ''} · importado ${dataBR(rel[k].importado_em)}</span>` : `<span class="tag t-neutro">○ ${v}</span>`).join(' ');
  const semRel = !base;
  return `
  <div class="card larga" style="margin-bottom:14px"><div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
    <div><h2 style="margin:0">Relatórios do Google Ads</h2><div class="desc">Impressões, cliques e custo vêm do relatório que você importa; visitas, pedidos e clientes vêm do painel (${PERIODOS[S.periodo]}).</div><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${info}</div></div>
    <div class="linha"><button class="btn" data-acao="importarGads">⬆ Importar relatório</button>${tot.custo ? '<button class="btn sec" data-acao="gadsLancarGasto" title="Cria um gasto em Google Ads com o custo do relatório">+ Lançar custo como gasto</button>' : ''}</div></div>
    ${semRel ? '<div class="demo" style="margin-top:10px"><span>Ainda não há relatório importado. Comece pelo de <b>Termos de pesquisa</b> e o de <b>Palavras-chave</b>: no Google Ads, abra a página, escolha o período e clique em ⬇ Fazer download › CSV.</span></div>' : ''}</div>
  <div class="kpis">
    ${kpi('Impressões', tot.impr.toLocaleString('pt-BR'), base ? 'relatório do Google' : 'importe o relatório')}
    ${kpi('Cliques', tot.cliques.toLocaleString('pt-BR'), tot.impr ? `CTR ${(tot.cliques / tot.impr * 100).toFixed(1).replace('.', ',')}% (bom: acima de 5%)` : '—', tot.impr >= 200 && tot.cliques / tot.impr < .03)}
    ${kpi('Custo', brl0(tot.custo), cpcMedio ? `CPC médio ${cpcMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '—')}
    ${kpi('Conversões no Google', tot.conv.toLocaleString('pt-BR', { maximumFractionDigits: 1 }), tot.conv && tot.custo ? `custo/conversão ${brl0(tot.custo / tot.conv)}` : 'cliques no WhatsApp e formulários')}
    ${kpi('Pedidos no painel', leads.length, leads.length && tot.custo ? `custo por pedido ${brl0(tot.custo / leads.length)}` : 'leads com origem Google Ads')}
    ${kpi('Clientes fechados', fech.length, fech.length && tot.custo ? `custo por cliente ${brl0(tot.custo / fech.length)}` : leads.length ? `conversão ${pct(fech.length / leads.length)}` : '—')}
    ${kpi('Faturado', brl0(fat), isFinite(roas) ? `retorno ${roas.toFixed(1).replace('.', ',')}x o investido` : 'clientes vindos do Google', isFinite(roas) && tot.custo > 100 && roas < 1)}
  </div>
  <div class="grade">
    <div class="card"><h2>Funil do Google Ads</h2><div class="desc">Onde as pessoas param. Visitas e contatos contam visitantes únicos.</div>
      ${barrasH(funil.map(([rot, valor], i) => ({ rot, valor, tip: `${rot}: ${valor.toLocaleString('pt-BR')}${i && funil[i - 1][1] ? ` (${pct(valor / funil[i - 1][1])} da etapa anterior)` : ''}` })), v => v.toLocaleString('pt-BR'))}
      <div class="desc" style="margin-top:8px">${funilDica(tot, visitas, contatos, leads.length, fech.length)}</div></div>
    <div class="card"><h2>Por dia</h2><div class="desc">${rel.dias ? 'Cliques e conversões do relatório por dia' : 'Importe um relatório com a coluna <b>Dia</b> (Campanhas › Segmentar › Tempo › Dia) para ver a evolução'}</div>
      ${dias.length ? `<div class="legenda"><span><i style="background:var(--s1)"></i>Cliques</span><span><i style="background:var(--s2)"></i>Conversões</span></div>${graficoColunas(dias.map(d => ({ rot: String(d.dia).slice(-5), valores: [d.cliques, d.conv] })), [{ nome: 'Cliques', cor: 'var(--s1)' }, { nome: 'Conversões', cor: 'var(--s2)' }])}` : '<div class="vazio">Sem dados por dia</div>'}</div>
    <div class="card larga"><h2>Palavras-chave</h2><div class="desc">Google (impressões, cliques, custo) lado a lado com o painel (visitas, pedidos e clientes pela palavra-chave do anúncio)</div>
      ${palavras.length ? `<div class="tabela"><table><tr><th>Palavra-chave</th><th class="n">Impr.</th><th class="n">Cliques</th><th class="n">CTR</th><th class="n">CPC</th><th class="n">Custo</th><th class="n">Conv.</th><th class="n">Visitas</th><th class="n">Pedidos</th><th class="n">Clientes</th><th class="n">Faturado</th><th>Situação</th></tr>
        ${palavras.slice(0, 60).map(r => { const [c, t] = situacao(r); return `<tr><td>${esc(r.rot)}${r.corr ? ` <span class="desc">${esc(r.corr)}</span>` : ''}</td><td class="n">${r.impr.toLocaleString('pt-BR')}</td><td class="n">${r.cliques}</td><td class="n">${r.impr ? (r.cliques / r.impr * 100).toFixed(1).replace('.', ',') + '%' : '—'}</td><td class="n">${r.cliques ? (r.custo / r.cliques).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td><td class="n">${r.custo ? brl0(r.custo) : '—'}</td><td class="n">${r.conv || '—'}</td><td class="n">${r.visitas.size || '—'}</td><td class="n">${r.leads || '—'}</td><td class="n">${r.fech || '—'}</td><td class="n">${r.fat ? brl0(r.fat) : '—'}</td><td><span class="tag ${c}">${t}</span></td></tr>`; }).join('')}</table></div>` : '<div class="vazio">Importe o relatório de Palavras-chave. Pedidos com palavra-chave aparecem aqui sozinhos.</div>'}</div>
    <div class="card larga"><h2>Termos de pesquisa</h2><div class="desc">O que as pessoas digitaram no Google antes de clicar. Termos marcados ⚠ parecem não ser cliente (estudante, trabalhador, "grátis") ou gastam sem converter: candidatos a palavra negativa.</div>
      ${termos.length ? `${negativas.length ? `<div class="linha" style="margin:8px 0">${btnCopiar(negativas.join('\n'), `Copiar ${negativas.length} negativa(s) sugerida(s)`)}<span class="desc">Cole em Google Ads › Palavras-chave › Palavras-chave negativas (nível da campanha). Confira antes: só negative o que não é cliente.</span></div>` : ''}
        <div class="tabela"><table><tr><th>Termo pesquisado</th><th>Palavra-chave</th><th class="n">Impr.</th><th class="n">Cliques</th><th class="n">Custo</th><th class="n">Conv.</th><th></th></tr>
        ${termos.slice(0, 80).map(x => `<tr><td>${esc(x.termo)}</td><td class="desc">${esc(x.palavra || x.grupo || '')}</td><td class="n">${x.impr}</td><td class="n">${x.cliques}</td><td class="n">${x.custo ? brl0(x.custo) : '—'}</td><td class="n">${x.conv || '—'}</td><td>${sugerirNegativa(x) ? '<span class="tag t-crit">⚠ negativar?</span>' : x.conv ? '<span class="tag t-good">converteu</span>' : ''}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Importe o relatório de Termos de pesquisa (Insights e relatórios › Termos de pesquisa › ⬇ CSV).</div>'}</div>
    ${rel.campanhas ? `<div class="card larga"><h2>Campanhas</h2><div class="tabela"><table><tr><th>Campanha</th><th>Status</th><th class="n">Impr.</th><th class="n">Cliques</th><th class="n">CTR</th><th class="n">Custo</th><th class="n">Conv.</th><th class="n">Custo/conv.</th></tr>
      ${rel.campanhas.linhas.map(x => `<tr><td>${esc(x.campanha)}</td><td>${esc(x.status || '')}</td><td class="n">${x.impr.toLocaleString('pt-BR')}</td><td class="n">${x.cliques}</td><td class="n">${x.impr ? (x.cliques / x.impr * 100).toFixed(1).replace('.', ',') + '%' : '—'}</td><td class="n">${brl0(x.custo)}</td><td class="n">${x.conv || '—'}</td><td class="n">${x.conv ? brl0(x.custo / x.conv) : '—'}</td></tr>`).join('')}</table></div></div>` : ''}
  </div>`;
}
function funilDica(tot, visitas, contatos, pedidos, fech) {
  if (!tot.impr) return 'Importe um relatório para ver o funil completo.';
  if (tot.impr >= 300 && tot.cliques / tot.impr < .03) return '💡 Muita gente vê e pouca clica: teste títulos com o preço e o prazo, e confira se as palavras-chave batem com o anúncio.';
  if (tot.cliques >= 20 && visitas < tot.cliques * .5) return '💡 Menos da metade dos cliques virou visita registrada: normal se muitos recusam cookies ou fecham antes de a página carregar.';
  if (visitas >= 30 && contatos / visitas < .05) return '💡 Visitam e não chamam: revise a primeira tela do site (preço, prazo e botão do WhatsApp à vista).';
  if (pedidos >= 5 && !fech) return '💡 Chegam pedidos e nenhum fecha: responda em minutos e mande o orçamento no mesmo dia.';
  return 'Funil equilibrado até aqui. Continue acompanhando os termos de pesquisa toda semana.';
}
async function gadsLancarGasto() {
  const rel = gadsRel(), base = rel.campanhas || rel.palavras || rel.termos || rel.dias; if (!base) return;
  const custo = Math.round(soma(base.linhas, x => x.custo) * 100) / 100;
  const descricao = `Relatório Google Ads ${base.periodo || dataBR(base.importado_em)}`.slice(0, 120);
  if (S.despesas.some(d => d.descricao === descricao)) return toast('Esse relatório já foi lançado como gasto.');
  if (!confirm(`Lançar ${brl0(custo)} como gasto em Google Ads (campanha google_pesquisa_calculo)?\n\nSe você já lança as recargas do Pix como gasto, não lance de novo: o custo seria contado duas vezes.`)) return;
  await seguro(async () => { await criar('despesas', { data: hoje(), canal: 'Google Ads', campanha: 'google_pesquisa_calculo', valor: custo, descricao }); toast('Gasto lançado'); render(); });
}

/* ---------------- Tráfego pago > Monitoramento: regras com frequência (monitor-ads.js) ---------------- */
async function carregarEventosMon(forcar) {
  if (DEMO || (S.monEv && !forcar && Date.now() - S.monEv.em < 300000)) return;
  S.monEv = { em: Date.now(), lista: S.monEv?.lista || [] };
  try {
    let lista = [];
    const desde = somaDias(hoje(), -35) + 'T00:00:00-03:00';
    for (let de = 0; de < 30000; de += 1000) {
      const { data, error } = await sb.from('eventos').select('tipo,sessao,utm_term,dispositivo,created_at').eq('utm_source', 'google').gte('created_at', desde).range(de, de + 999);
      if (error) throw error; lista = lista.concat(data); if (data.length < 1000) break;
    }
    S.monEv = { em: Date.now(), lista }; render();
  } catch (e) { console.warn('monitoramento', e); }
}
const cfgMonAds = () => S.ajustes.monitor_ads || {};
function dadosMonitor() {
  return { hoje: hoje(), agora: Date.now(), leads: S.leads, despesas: S.despesas, eventos: S.monEv?.lista || [], gads: gadsRel(), traf: traf(), rast: rast() };
}
function trafegoMonitor() {
  carregarEventosMon();
  const cfg = cfgMonAds(), lista = monitorAvaliar(dadosMonitor(), null, cfg.desligadas);
  const alertas = lista.filter(r => r.res), ordem = { crit: 0, warn: 1, dica: 2 };
  const ROT = { crit: '⚠ Urgente', warn: '● Melhorar', dica: 'ℹ Oportunidade' };
  const cartao = r => `<div class="alerta-linha" style="display:block;padding:10px 0;border-bottom:1px solid var(--grid)">
      <div class="linha" style="justify-content:space-between;gap:10px">
        <div><b>${esc(r.titulo)}</b> <span class="desc">· ${MON_FREQ[r.freq]}</span></div>
        <label class="linha" style="gap:6px;font-size:13px;white-space:nowrap" title="Avisar no e-mail e no painel"><input type="checkbox" data-mon-regra="${r.id}" ${r.ligada ? 'checked' : ''}> avisar</label></div>
      ${!r.ligada ? '<div class="desc">Desligada</div>'
        : r.erro ? `<div class="desc">Não foi possível avaliar (${esc(r.erro)})</div>`
        : r.res ? `<div style="margin-top:4px"><span class="tag t-${r.res.nivel === 'dica' ? 'azul' : r.res.nivel}">${ROT[r.res.nivel]}</span> ${esc(r.res.msg)}</div><div class="desc" style="margin-top:4px">👉 ${esc(r.res.acao)}</div>`
        : '<div class="desc" style="margin-top:2px">✅ Tudo certo por aqui.</div>'}</div>`;
  const al = cfg.email === false ? 'desligado' : 'ligado';
  return `
  <div class="card larga" style="margin-bottom:14px"><div class="linha" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div><h2 style="margin:0">Monitoramento do tráfego pago</h2>
    <div class="desc">O painel confere estas regras sozinho e avisa o que melhorar para chegar a mais clientes.
      As <b>diárias</b> vão no e-mail das 8h, as <b>semanais</b> no resumo de segunda e as <b>mensais</b> no e-mail do dia 1º. Aqui você vê a situação de agora.</div></div>
    <label class="linha" style="gap:6px;white-space:nowrap"><input type="checkbox" id="monEmail" ${al === 'ligado' ? 'checked' : ''}> enviar por e-mail</label></div>
    <div class="kpis" style="margin-top:12px">
      ${kpi('Urgentes', alertas.filter(r => r.res.nivel === 'crit').length, 'resolva hoje', alertas.some(r => r.res.nivel === 'crit'))}
      ${kpi('Para melhorar', alertas.filter(r => r.res.nivel === 'warn').length, 'ajustes da campanha')}
      ${kpi('Oportunidades', alertas.filter(r => r.res.nivel === 'dica').length, 'crescer com o que já funciona')}
      ${kpi('Regras em dia', lista.filter(r => r.ligada && !r.res && !r.erro).length + ' de ' + lista.filter(r => r.ligada).length, 'sem nada a fazer')}
    </div></div>
  ${alertas.length ? `<div class="card larga" style="margin-bottom:14px"><h2>O que fazer agora</h2>${[...alertas].sort((a, b) => ordem[a.res.nivel] - ordem[b.res.nivel]).map(cartao).join('')}</div>` : '<div class="demo" style="margin-bottom:14px"><span>✅ Nenhum aviso agora. O monitoramento continua conferindo todo dia.</span></div>'}
  <div class="grade">${Object.entries(MON_FREQ).map(([f, rot]) => `<div class="card"><h2>${rot}</h2><div class="desc">${{ diaria: 'Urgências que custam cliente no mesmo dia', semanal: 'Ajustes da campanha com base na semana', mensal: 'Verba, custo por cliente e escala' }[f]}</div>
    ${lista.filter(r => r.freq === f).map(cartao).join('')}</div>`).join('')}</div>`;
}
async function alternarRegraMon(id, ligada) {
  const c = cfgMonAds(), off = new Set(c.desligadas || []);
  if (ligada) off.delete(id); else off.add(id);
  const novo = { ...c, desligadas: [...off] };
  await seguro(async () => { await ajustesDb.salvar('monitor_ads', novo); S.ajustes.monitor_ads = novo; render(); });
}

function telaTrafego() {
  COPIAS = [];
  const aba = ABAS_TRAFEGO[S.abaTrafego] ? S.abaTrafego : 'ativacao';
  const r = rast();
  const status = r.ativo && (r.ga4_id || r.gads_id || r.meta_pixel_id) ? '<span class="tag t-good">● Rastreamento ligado</span>' : '<span class="tag t-neutro">○ Rastreamento desligado</span>';
  const corpo = { ativacao: trafegoAtivacao, resultados: trafegoResultados, google: trafegoGoogle, monitor: trafegoMonitor, campanhas: trafegoCampanhas, links: trafegoLinks, offline: trafegoOffline }[aba]();
  return `<div class="topo"><h1>Tráfego pago</h1><div class="acoes">${status}${aba === 'resultados' || aba === 'google' ? seletorPeriodo() : ''}<button class="btn" data-acao="novoGasto">+ Lançar gasto</button></div></div>
  <div class="seg" style="margin-bottom:16px;flex-wrap:wrap">${Object.entries(ABAS_TRAFEGO).map(([k, v]) => `<button class="${k === aba ? 'on' : ''}" data-aba-trafego="${k}">${v}</button>`).join('')}</div>${corpo}`;
}

function passo(chave, titulo, corpo, auto) {
  const ok = auto === undefined ? feito(chave) : auto;
  return `<div class="card larga passo ${ok ? 'ok' : ''}"><div class="passo-topo">
    ${auto === undefined ? `<input type="checkbox" data-feito="${chave}" ${ok ? 'checked' : ''} title="Marcar como feito">` : `<span class="passo-auto">${ok ? '✅' : '⏳'}</span>`}
    <h2>${titulo}</h2></div><div class="passo-corpo">${corpo}</div></div>`;
}
function campoRast(k, rot, ph) {
  const v = S.rascRast[k] ?? rast()[k] ?? '';
  const ruim = v && VALIDA_RAST[k] && !VALIDA_RAST[k][0](v);
  return `<div><label class="rotulo" for="rast_${k}">${rot}</label><input class="f" style="width:100%" id="rast_${k}" data-rast="${k}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off">
    ${ruim ? `<div style="color:var(--crit);font-size:12px;margin-top:3px">${esc(VALIDA_RAST[k][1])}</div>` : ''}</div>`;
}
function trafegoAtivacao() {
  const r = rast(), t = traf();
  const temAds = !!(r.gads_id && r.gads_label), temGoogle = temAds && !!r.ga4_id, temMeta = !!r.meta_pixel_id, temAlgum = temAds || !!r.ga4_id || temMeta || !!r.clarity_id;
  const criadas = KIT.filter(k => feito('camp_' + k.id)).length;
  const prontos = [temAlgum, r.ativo, criadas > 0].filter(Boolean).length;
  return `<div class="demo" style="background:#eef4fc;border-color:var(--s1)"><span>Siga os passos na ordem. Tudo que depende de você está marcado com ☐; o resto o painel confere sozinho. <b>${prontos}/3</b> etapas principais concluídas.</span></div>
  ${DEMO ? '<div class="demo"><span><b>Modo demonstração:</b> os códigos ficam salvos só neste navegador e o site ainda não os usa. Ligue o Supabase e salve de novo para valer no site.</span></div>' : ''}
  <div class="grade">
  ${passo('contas', '1. Criar as contas (uma vez)', `<ol>
    <li><b>Google Ads</b>: <a href="https://ads.google.com" target="_blank">ads.google.com</a> → entre com o Google da empresa → clique em <b>"Mudar para o modo especialista"</b> e depois em <b>"Criar conta sem campanha"</b>. Fuso: São Paulo · Moeda: BRL.</li>
    <li><b>Google Analytics 4</b>: <a href="https://analytics.google.com" target="_blank">analytics.google.com</a> → Administrador → Criar propriedade "Pontes Ferreira" → Fluxo de dados <b>Web</b> com <code>pontesferreiracalculos.com</code>.</li>
    <li><b>Meta Business</b>: <a href="https://business.facebook.com" target="_blank">business.facebook.com</a> → crie o portfólio com o <b>CNPJ 51.362.258/0001-79</b> e ligue a página do Facebook e o Instagram da marca.</li>
    <li>Cadastre a <b>forma de pagamento</b> nas duas contas (cartão ou Pix/boleto pré-pago).</li></ol>`)}
  ${passo('ids', '2. Colar os códigos de rastreamento', `
    <ol><li><b>GA4</b>: Administrador → Fluxos de dados → seu site → copie o <b>ID da métrica</b> (G-…).</li>
    <li><b>Google Ads</b>: Metas → Conversões → <b>+ Nova ação de conversão</b> → Site → digite <code>pontesferreiracalculos.com</code> → <b>"Adicionar uma ação de conversão manualmente"</b>:
      categoria <b>Enviar formulário de lead</b>, nome <b>Lead do site</b>, valor <b>"Usar valores diferentes"</b> (padrão R$ ${Number(r.valor_lead) || 250}), contagem <b>Uma</b>. Concluir → <b>"Usar a tag do Google"</b> → copie o trecho <code>send_to: 'AW-…/…'</code> e cole abaixo (pode colar inteiro no primeiro campo que eu separo).</li>
    <li><b>Meta Pixel</b>: Gerenciador de Eventos → <b>Conectar fontes de dados</b> → Web → nome "Pontes Ferreira" → copie o <b>ID do conjunto de dados/Pixel</b>.</li>
    <li><b>Microsoft Clarity</b> (grátis, mapa de calor e gravação das visitas): <a href="https://clarity.microsoft.com" target="_blank">clarity.microsoft.com</a> → Novo projeto → site <code>pontesferreiracalculos.com</code> → Configurações → <b>Visão geral</b> → copie o <b>ID do projeto</b>.</li></ol>
    <div class="form-trafego" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:10px">
      ${campoRast('ga4_id', 'ID do Google Analytics 4', 'G-XXXXXXXXXX')}
      ${campoRast('gads_id', 'ID do Google Ads', 'AW-1234567890')}
      ${campoRast('gads_label', 'Rótulo da conversão "Lead do site"', 'AbCdEfGhIjK123')}
      ${campoRast('meta_pixel_id', 'ID do Meta Pixel', '123456789012345')}
      ${campoRast('clarity_id', 'ID do Microsoft Clarity (mapa de calor)', 'abc12de3fg')}
      ${campoRast('valor_lead', 'Valor estimado de cada lead (R$)', '250')}
    </div>
    <div class="linha" style="margin-top:12px"><button class="btn" data-acao="salvarRast">Salvar códigos</button>
    <span style="color:var(--ink-2);font-size:13px">Google Ads: ${temAds ? '✅' : '⏳ faltando'} · Analytics: ${r.ga4_id ? '✅' : '⏳ opcional'} · Meta: ${temMeta ? '✅ completo' : '⏳ faltando'} · Clarity: ${r.clarity_id ? '✅' : '⏳ opcional'}</span></div>`, temAlgum)}
  ${passo('ligar', '3. Ligar no site', `<p>Com os códigos salvos, ligue a chave. O site passa a carregar o Google e o Meta e a registrar como conversão cada pedido de orçamento (formulário e botões de WhatsApp). Não precisa mexer no código nem publicar de novo.</p>
    <label class="linha" style="font-size:15px;font-weight:600;margin-top:8px"><input type="checkbox" id="rastAtivo" ${r.ativo ? 'checked' : ''} ${temAlgum ? '' : 'disabled'}> Rastreamento ligado no site</label>
    ${temAlgum ? '' : '<div class="desc">Salve pelo menos um código no passo 2 para liberar.</div>'}`, !!r.ativo)}
  ${passo('testar', '4. Testar', `<ol>
    <li>Abra <a href="${SITE_URL}?pf_teste=1" target="_blank">${SITE_URL}?pf_teste=1</a>: aparece um quadro no canto com o que está ligado.</li>
    <li><b>Google</b>: abra <a href="https://tagassistant.google.com" target="_blank">tagassistant.google.com</a>, conecte o site, clique num botão de WhatsApp e veja o evento <b>conversion</b>. No Google Ads, a conversão muda de "Não verificada" para "Registrando conversões" em até 24h.</li>
    <li><b>Meta</b>: Gerenciador de Eventos → seu Pixel → <b>Testar eventos</b> → abra o site pelo link indicado → clique em WhatsApp → deve aparecer <b>PageView</b> e <b>Lead</b>.</li>
    <li>Faça um pedido de teste pelo formulário com <a href="${SITE_URL}?utm_source=teste&utm_campaign=teste_painel" target="_blank">este link</a> e confira em Leads se ele chegou com a campanha "teste_painel". Depois apague o lead de teste.</li></ol>`)}
  ${passo('dominio_meta', '5. Verificar o domínio no Meta', `<p>Configurações do negócio → Segurança da marca → <b>Domínios</b> → Adicionar <code>pontesferreiracalculos.com</code> → método <b>Registro TXT no DNS</b>. Copie o TXT e crie na Zona DNS da Locaweb (tipo TXT, nome @). Sem isso o Meta pode limitar os anúncios para o site.</p>`)}
  ${passo('metas', '6. Verba e metas', `<div class="form-trafego" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      <div><label class="rotulo">Verba mensal Google Ads (R$)</label><input class="f" style="width:100%" type="number" data-traf="verba_google" value="${esc(t.verba_google ?? 1650)}"></div>
      <div><label class="rotulo">Verba mensal Meta Ads (R$)</label><input class="f" style="width:100%" type="number" data-traf="verba_meta" value="${esc(t.verba_meta ?? 700)}"></div>
      <div><label class="rotulo">Ticket médio por cliente (R$)</label><input class="f" style="width:100%" type="number" data-traf="ticket_medio" value="${esc(t.ticket_medio ?? '')}" placeholder="automático pelos cálculos"></div>
      <div><label class="rotulo">Custo máximo por cliente (R$)</label><input class="f" style="width:100%" type="number" data-traf="cac_maximo" value="${esc(t.cac_maximo ?? 120)}"></div></div>
    <div class="linha" style="margin-top:12px"><button class="btn" data-acao="salvarMetas">Salvar metas</button><span class="desc">Valores sugeridos pela estratégia (teste de 60 dias). O painel avisa quando o gasto sai do ritmo ou o custo por cliente passa do máximo.</span></div>`, !!(t.verba_google || t.verba_meta))}
  ${passo('campanhas', '7. Criar as campanhas', `<p>Na aba <a href="#trafego" data-aba-trafego="campanhas">3. Campanhas prontas</a> está tudo para copiar e colar: palavras-chave, negativas, anúncios, públicos e links. Marque cada campanha como criada. <b>${criadas}/${KIT.length}</b> criadas.</p>
    <p class="desc">Ordem recomendada: comece só com <b>Google Pesquisa</b>. Depois de 2 semanas, ligue o <b>Meta Topo</b>. Os remarketings entram quando houver ~100 visitantes no mês.</p>`, criadas > 0)}
  ${passo('rotina', '8. Rotina (depois de ligar)', `<ul>
    <li><b>Todo dia</b>: responda lead em até ${MIN_RESPOSTA} min · lance o gasto do dia (botão <b>+ Lançar gasto</b>) ou uma vez por semana com o total.</li>
    <li><b>Semanas 1–2, todo dia</b>: Google Ads → Palavras-chave → <b>Termos de pesquisa</b>: negative o que não for advogado procurando cálculo.</li>
    <li><b>Toda semana</b>: veja a aba Resultados; pause anúncio com CTR &lt; 3% (Google) ou custo por lead 2× acima da média (Meta).</li>
    <li><b>Todo mês</b>: envie as conversões offline (aba 5) e mova verba para a campanha com menor custo por cliente.</li></ul>`)}
  </div>`;
}

function trafegoResultados() {
  const t = metricasTrafego(), cacMax = Number(traf().cac_maximo) || 0;
  const cac = t.fechados.length ? t.gasto / t.fechados.length : NaN;
  const equilibrio = t.ticket ? Math.ceil(t.gasto / t.ticket) : 0;
  const alertas = alertasTrafego(t);
  const semanas = Array.from({ length: 8 }, (_, i) => { const fim = somaDias(hoje(), -7 * (7 - i)); return { ini: somaDias(fim, -6), fim, rot: dataBR(fim).slice(0, 5) }; });
  const porSemana = semanas.map(s => ({ rot: s.rot, valores: ['Google Ads', 'Meta Ads'].map(c => S.leads.filter(l => canalLead(l) === c && dia(l.created_at) >= s.ini && dia(l.created_at) <= s.fim).length) }));
  const ritmo = ritmoVerba();
  return `
  ${alertas.length ? `<div class="card larga" style="margin-bottom:14px"><h2>O que fazer agora</h2>${alertas.map(([n, txt]) => `<div class="alerta-linha"><span class="tag t-${n}">${n === 'crit' ? '⚠ Urgente' : n === 'warn' ? '● Atenção' : 'ℹ Dica'}</span> ${txt}</div>`).join('')}</div>` : ''}
  <div class="kpis">
    ${kpi('Investido em anúncios', brl0(t.gasto), `${t.gastos.length} lançamento(s)`)}
    ${kpi('Leads de anúncios', t.leads.length, `custo por lead ${t.leads.length && t.gasto ? brl0(t.gasto / t.leads.length) : '—'}`)}
    ${kpi('Clientes fechados', t.fechados.length, `conversão ${t.leads.length ? pct(t.fechados.length / t.leads.length) : '—'}`)}
    ${kpi('Custo por cliente', isFinite(cac) ? brl0(cac) : '—', cacMax ? `máximo: ${brl0(cacMax)}` : 'defina o máximo na Ativação', cacMax && cac > cacMax)}
    ${kpi('Faturado com anúncios', brl0(t.faturado), 'cálculos dos clientes de anúncio')}
    ${kpi('Retorno (ROAS)', t.gasto ? (t.faturado / t.gasto).toFixed(1).replace('.', ',') + 'x' : '—', 'faturado ÷ investido', t.gasto && t.faturado < t.gasto)}
    ${kpi('Ponto de equilíbrio', equilibrio ? `${equilibrio} cálculos` : '—', `para pagar o investimento (ticket ${brl0(t.ticket)})`)}
  </div>
  <div class="grade">
    <div class="card"><h2>Verba do mês</h2><div class="desc">Gasto lançado × verba planejada · a linha marca onde o gasto deveria estar hoje</div>
      ${ritmo.map(r => `<div style="margin:12px 0"><div class="linha" style="justify-content:space-between"><b>${r.canal}</b><span>${brl0(r.gasto)} de ${r.verba ? brl0(r.verba) : '—'}</span></div>
        <div class="verba"><div style="width:${Math.min(100, r.pct * 100).toFixed(1)}%;background:${r.gasto > r.esperado * 1.15 ? 'var(--warn)' : 'var(--s1)'}"></div>${r.verba ? `<i style="left:${Math.min(100, r.esperado / r.verba * 100).toFixed(1)}%"></i>` : ''}</div></div>`).join('')}
      ${ritmo.some(r => r.verba) ? '' : '<div class="desc">Defina a verba no passo 6 da Ativação.</div>'}</div>
    <div class="card"><h2>Leads de anúncio por semana</h2><div class="desc">Últimas 8 semanas</div>
      <div class="legenda"><span><i style="background:var(--s1)"></i>Google Ads</span><span><i style="background:var(--s2)"></i>Meta Ads</span></div>
      ${graficoColunas(porSemana, [{ nome: 'Google Ads', cor: 'var(--s1)' }, { nome: 'Meta Ads', cor: 'var(--s2)' }])}</div>
    <div class="card larga"><h2>Por campanha</h2><div class="desc">${PERIODOS[S.periodo]} · o gasto entra pela campanha escolhida em "+ Lançar gasto"</div>
      ${t.campanhas.length ? `<div class="tabela"><table><tr><th>Campanha</th><th>Canal</th><th class="n">Investido</th><th class="n">Leads</th><th class="n">Custo/lead</th><th class="n">Orçados</th><th class="n">Fechados</th><th class="n">Conversão</th><th class="n">Custo/cliente</th><th class="n">Faturado</th><th class="n">Retorno</th></tr>
      ${t.campanhas.map(c => `<tr><td>${esc(c.k)}</td><td>${esc(c.canal)}</td><td class="n">${c.gasto ? brl0(c.gasto) : '—'}</td><td class="n">${c.leads}</td><td class="n">${c.gasto && c.leads ? brl0(c.gasto / c.leads) : '—'}</td><td class="n">${c.orc}</td><td class="n">${c.fech}</td><td class="n">${c.leads ? pct(c.fech / c.leads) : '—'}</td>
        <td class="n">${c.gasto && c.fech ? `<span class="${cacMax && c.gasto / c.fech > cacMax ? 'tag t-crit' : ''}">${brl0(c.gasto / c.fech)}</span>` : '—'}</td><td class="n">${brl0(c.fat)}</td><td class="n">${c.gasto ? (c.fat / c.gasto).toFixed(1).replace('.', ',') + 'x' : '—'}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Ainda sem leads ou gastos de anúncios no período</div>'}</div>
    <div class="card"><h2>Termos que trouxeram leads</h2><div class="desc">Palavra-chave do Google (utm_term) · use para decidir lances e negativas</div>
      ${t.termos.length ? `<div class="tabela"><table><tr><th>Termo</th><th class="n">Leads</th><th class="n">Fechados</th></tr>${t.termos.map(x => `<tr><td>${esc(x.t)}</td><td class="n">${x.n}</td><td class="n">${x.f}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Aparece quando os leads chegarem com o sufixo do URL do Google</div>'}</div>
    <div class="card"><h2>Gastos lançados</h2><div class="desc">${PERIODOS[S.periodo]} · clique para editar</div>
      ${t.gastos.length ? `<div class="tabela"><table><tr><th>Data</th><th>Canal</th><th>Campanha</th><th class="n">Valor</th></tr>${[...t.gastos].sort((a, b) => b.data.localeCompare(a.data)).map(d => `<tr class="clic" data-despesa="${d.id}"><td>${dataBR(d.data)}</td><td>${esc(d.canal)}</td><td>${esc(d.campanha || '—')}</td><td class="n">${brl(d.valor)}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Nenhum gasto lançado</div>'}</div>
  </div>`;
}

const lista = (itens, f = x => esc(x)) => `<ul class="kit">${itens.map(i => `<li>${f(i)}</li>`).join('')}</ul>`;
const contaChars = (txt, max) => `<span class="${txt.length > max ? 'tag t-crit' : 'chars'}">${txt.length}/${max}</span>`;
function trafegoCampanhas() {
  return `<div class="demo" style="background:#eef4fc;border-color:var(--s1)"><span>Cada campanha tem as configurações na ordem em que aparecem nas telas do Google/Meta. Use os botões 📋 para copiar e colar. Marque "Criada" quando terminar.</span></div>
  <div class="grade">${KIT.map(k => `<div class="card larga camp">
    <div class="linha" style="justify-content:space-between"><h2>${k.canal === 'Google Ads' ? '🔎' : '📱'} ${esc(k.canal)} · ${esc(k.nome)}</h2>
      <label class="linha"><input type="checkbox" data-feito="camp_${k.id}" ${feito('camp_' + k.id) ? 'checked' : ''}> <b>Criada</b></label></div>
    <div class="desc">${esc(k.resumo)} · Verba sugerida: <b>${brl0(k.diaria)}/dia</b> (${brl0(k.verbaMes)}/mês) · nome no painel: <code>${k.id}</code> ${btnCopiar(k.id, 'nome')}</div>
    <h3 class="sub">Configurações</h3>
    <div class="tabela"><table>${k.config.map(([a, b]) => `<tr><td style="width:170px"><b>${esc(a)}</b></td><td>${esc(b)}</td><td style="width:90px">${/URL|Sufixo|Parâmetros|Mensagem|Nome/.test(a) ? btnCopiar(b) : ''}</td></tr>`).join('')}</table></div>
    ${k.grupos ? `<h3 class="sub">Grupos de anúncios e palavras-chave <span class="desc">(cole em cada grupo; "aspas" = frase, [colchetes] = exata)</span></h3>
      <div class="kit-grade">${k.grupos.map(([g, kws]) => { const txt = kws.flatMap(w => [`"${w}"`, `[${w}]`]).join('\n'); return `<div class="kit-bloco"><div class="linha" style="justify-content:space-between"><b>${esc(g)}</b>${btnCopiar(txt)}</div>${lista(kws)}</div>`; }).join('')}</div>` : ''}
    ${k.negativas ? `<h3 class="sub">Palavras-chave negativas <span class="desc">(nível da campanha · essenciais para não pagar clique de trabalhador e estudante)</span> ${btnCopiar(k.negativas.join('\n'), 'Copiar todas')}</h3><div class="kit-tags">${k.negativas.map(n => `<span class="tag t-neutro">−${esc(n)}</span>`).join(' ')}</div>` : ''}
    ${k.titulos ? `<h3 class="sub">Títulos (até 30 caracteres) ${btnCopiar(k.titulos.join('\n'), 'Copiar todos')}</h3><div class="kit-grade">${k.titulos.map(x => `<div class="kit-linha"><span>${esc(x)}</span>${contaChars(x, 30)}</div>`).join('')}</div>` : ''}
    ${k.descricoes ? `<h3 class="sub">Descrições (até 90 caracteres) ${btnCopiar(k.descricoes.join('\n'), 'Copiar todas')}</h3>${k.descricoes.map(x => `<div class="kit-linha"><span>${esc(x)}</span>${contaChars(x, 90)}</div>`).join('')}` : ''}
    ${k.sitelinks ? `<h3 class="sub">Sitelinks</h3><div class="tabela"><table><tr><th>Texto (25)</th><th>Linha 1 (35)</th><th>Linha 2 (35)</th><th>URL</th><th></th></tr>${k.sitelinks.map(s => `<tr><td>${esc(s[0])}</td><td>${esc(s[1])}</td><td>${esc(s[2])}</td><td><code>${esc(s[3])}</code></td><td>${btnCopiar(s[3], 'URL')}</td></tr>`).join('')}</table></div>` : ''}
    ${k.destaques ? `<h3 class="sub">Frases de destaque ${btnCopiar(k.destaques.join('\n'), 'Copiar todas')}</h3><div class="kit-tags">${k.destaques.map(d => `<span class="tag t-azul">${esc(d)}</span>`).join(' ')}</div>
      <p class="desc" style="margin-top:8px">Adicione também o recurso de <b>Ligação</b> e o de <b>WhatsApp/Mensagem</b> com o número (21) 98770-8652.</p>` : ''}
    ${k.criativos ? `<h3 class="sub">Anúncios</h3><div class="kit-grade">${k.criativos.map(([titulo, arte, texto, manchete]) => `<div class="kit-bloco"><b>${esc(titulo)}</b><div class="desc">${esc(arte)}</div>
      <div class="kit-texto">${esc(texto)}</div><div class="linha">${btnCopiar(texto, 'Texto principal')} ${btnCopiar(manchete, 'Título')}</div></div>`).join('')}</div>` : ''}
    ${k.extra ? `<p class="desc" style="margin-top:10px">${esc(k.extra)}</p>` : ''}
  </div>`).join('')}</div>`;
}

function urlUtm() {
  const u = S.utm, params = new URLSearchParams();
  if (u.source) params.set('utm_source', u.source); if (u.medium) params.set('utm_medium', u.medium);
  if (u.campaign) params.set('utm_campaign', u.campaign.trim().toLowerCase().replace(/\s+/g, '_'));
  if (u.content) params.set('utm_content', u.content.trim().toLowerCase().replace(/\s+/g, '_'));
  return SITE_URL + (params.toString() ? '?' + params : '') + (u.ancora || '');
}
function trafegoLinks() {
  const u = S.utm, url = urlUtm();
  const prontos = [
    ['Bio do Instagram', SITE_URL + '?utm_source=instagram&utm_medium=bio&utm_campaign=perfil'],
    ['Assinatura de e-mail', SITE_URL + '?utm_source=email&utm_medium=assinatura&utm_campaign=assinatura'],
    ['Google Meu Negócio', SITE_URL + '?utm_source=google&utm_medium=organico&utm_campaign=meu_negocio'],
    ['Indicação de cliente', SITE_URL + '?utm_source=indicacao&utm_medium=whatsapp&utm_campaign=indicacao'],
    ['Sufixo do Google Ads (Pesquisa)', UTM_GOOGLE('google_pesquisa_calculo')],
    ['Parâmetros do Meta Ads', UTM_META]
  ];
  return `<div class="grade">
  <div class="card larga"><h2>Gerador de link</h2><div class="desc">Use em qualquer lugar onde divulgar o site (post, grupo de advogados, e-mail). O lead chega no painel com a origem certa.</div>
    <div class="form-trafego" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px">
      <div><label class="rotulo">Origem</label><select class="f" style="width:100%" data-utm="source">${['google', 'meta', 'instagram', 'linkedin', 'email', 'whatsapp', 'indicacao', 'outro'].map(o => `<option ${o === u.source ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div><label class="rotulo">Meio</label><select class="f" style="width:100%" data-utm="medium">${['cpc', 'paid_social', 'bio', 'post', 'story', 'grupo', 'assinatura', 'organico'].map(o => `<option ${o === u.medium ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div><label class="rotulo">Campanha</label><input class="f" style="width:100%" data-utm="campaign" value="${esc(u.campaign)}" placeholder="ex.: post_erros_liquidacao"></div>
      <div><label class="rotulo">Conteúdo (opcional)</label><input class="f" style="width:100%" data-utm="content" value="${esc(u.content)}" placeholder="ex.: carrossel_1"></div>
      <div><label class="rotulo">Página</label><select class="f" style="width:100%" data-utm="ancora">${[['', 'Início'], ['#form', 'Formulário'], ['#precos', 'Preços'], ['#servicos', 'Serviços'], ['#faq', 'Perguntas']].map(([v, r]) => `<option value="${v}" ${v === u.ancora ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    </div>
    <div class="link-gerado"><code id="utmUrl">${esc(url)}</code><button class="btn mini sec" data-acao="copiarUtm">📋 Copiar</button><a class="btn mini sec" id="utmAbrir" href="${esc(url)}" target="_blank">Abrir</a></div></div>
  <div class="card larga"><h2>Links prontos</h2><div class="tabela"><table>${prontos.map(([r, l]) => `<tr><td style="width:220px"><b>${esc(r)}</b></td><td><code style="word-break:break-all">${esc(l)}</code></td><td style="width:90px">${btnCopiar(l)}</td></tr>`).join('')}</table></div></div>
  </div>`;
}

function leadsOfflineGoogle() {
  return S.leads.filter(l => l.status === 'fechado' && l.gclid && l.gclid !== 'demo' && noPeriodo(l.created_at, somaDias(hoje(), -89))).map(l => {
    const c = S.calculos.filter(x => x.lead_id === l.id).sort((a, b) => (a.data_entrada || '').localeCompare(b.data_entrada || ''))[0];
    const quando = c?.data_entrada ? c.data_entrada + ' 12:00:00' : new Date(new Date(l.created_at).getTime() + 36e5).toISOString().slice(0, 19).replace('T', ' ');
    return { l, quando, valor: valorDoLead(l) || Number(traf().ticket_medio) || 250 };
  });
}
function trafegoOffline() {
  const g = leadsOfflineGoogle();
  const nomeConv = traf().conv_offline || 'Cliente fechado';
  const clis = S.clientes.filter(c => c.whatsapp || c.email);
  const mes = hoje().slice(0, 7);
  return `<div class="grade">
  <div class="card larga"><h2>Google Ads · clientes que fecharam</h2>
    <div class="desc">Ensina o Google a buscar quem paga, não só quem clica. Envie 1 vez por mês (o Google aceita cliques dos últimos 90 dias e ignora repetidos).</div>
    <ol style="margin-top:8px"><li>No Google Ads: Metas → Conversões → <b>+ Nova ação</b> → <b>Importar</b> → "Outras fontes de dados ou CRMs" → "Rastrear conversões de cliques" → nome <b>${esc(nomeConv)}</b>, categoria <b>Compra</b>. (Só na primeira vez.)</li>
    <li>Baixe o arquivo abaixo e envie em Ferramentas → <b>Envios</b> → <b>+</b> → selecione o arquivo → Aplicar.</li>
    <li>Na ação <b>Lead do site</b>, mude "Meta da conta" para secundária depois de ~30 envios, deixando <b>${esc(nomeConv)}</b> como principal.</li></ol>
    <div class="linha" style="margin:10px 0"><label class="rotulo" style="margin:0">Nome da conversão no Google:</label><input class="f" data-traf-direto="conv_offline" value="${esc(nomeConv)}" style="width:200px">
      <button class="btn" data-acao="exportGoogle" ${g.length ? '' : 'disabled'}>⬇ Baixar CSV (${g.length})</button>
      <label class="linha"><input type="checkbox" data-feito="offline_${mes}" ${feito('offline_' + mes) ? 'checked' : ''}> Enviado este mês</label></div>
    ${g.length ? `<div class="tabela"><table><tr><th>Cliente</th><th>Campanha</th><th>Fechou em</th><th class="n">Valor</th></tr>${g.map(x => `<tr><td>${esc(x.l.nome || '—')}</td><td>${esc(x.l.utm_campaign || '—')}</td><td>${dataBR(x.quando.slice(0, 10))}</td><td class="n">${brl(x.valor)}</td></tr>`).join('')}</table></div>`
      : '<div class="vazio">Nenhum cliente do Google com gclid nos últimos 90 dias. O gclid chega sozinho quando o "auto-tagging" do Google Ads está ligado (vem ligado por padrão).</div>'}</div>
  <div class="card larga"><h2>Meta Ads · lista de clientes</h2>
    <div class="desc">Use para (1) <b>excluir</b> quem já é cliente do remarketing e (2) criar um <b>público semelhante</b> (Lookalike 1%) quando tiver 50+ clientes.</div>
    <ol style="margin-top:8px"><li>Gerenciador de Anúncios → Públicos → Criar público → <b>Público personalizado</b> → <b>Lista de clientes</b>.</li>
    <li>Envie o arquivo abaixo (o Meta criptografa os dados antes de usar).</li>
    <li>Depois: Criar público → <b>Público semelhante</b> → origem "Clientes Pontes Ferreira" → Brasil → 1%.</li></ol>
    <div class="linha" style="margin-top:10px"><button class="btn" data-acao="exportMeta" ${clis.length ? '' : 'disabled'}>⬇ Baixar lista (${clis.length} clientes)</button></div></div>
  </div>`;
}

async function novoGasto(d = null) {
  const v = await abrirForm(d ? 'Editar gasto' : 'Lançar gasto com anúncios', [
    { k: 'data', rot: 'Data', tipo: 'date', padrao: hoje(), req: true },
    { k: 'canal', rot: 'Canal', tipo: 'select', opcoes: CANAIS_ADS, req: true, vazio: false },
    { k: 'campanha', rot: 'Campanha', tipo: 'select', opcoes: campanhasConhecidas() },
    { k: 'valor', rot: 'Valor (R$)', tipo: 'number', req: true },
    { k: 'descricao', rot: 'Descrição', ph: 'ex.: semana 1, total do mês…', full: true }
  ], d || {});
  if (!v) return;
  await seguro(async () => { await criar('despesas', v); toast('Gasto lançado'); render(); });
}
async function salvarRast() {
  const r = { ...rast() };
  Object.entries(S.rascRast).forEach(([k, v]) => { r[k] = String(v).trim(); });
  const m = (r.gads_id || '').match(/(AW-\d+)\s*\/\s*([A-Za-z0-9_-]+)/); // colou o send_to inteiro
  if (m) { r.gads_id = m[1]; r.gads_label = m[2]; }
  r.ga4_id = (r.ga4_id || '').toUpperCase(); r.gads_id = (r.gads_id || '').toUpperCase(); r.meta_pixel_id = digitos(r.meta_pixel_id); r.clarity_id = (r.clarity_id || '').trim().toLowerCase();
  r.valor_lead = numBR(r.valor_lead) || 250;
  const erros = Object.entries(VALIDA_RAST).filter(([k, [ok]]) => r[k] && !ok(r[k])).map(([k, [, msg]]) => msg);
  if (erros.length) { S.rascRast = { ...r }; render(); return toast('Confira: ' + erros.join(' · ')); }
  if (!(r.ga4_id || r.gads_id || r.meta_pixel_id || r.clarity_id)) r.ativo = false;
  await seguro(async () => { await ajustesDb.salvar('rastreamento', r); S.ajustes.rastreamento = r; S.rascRast = {}; toast(r.ativo ? 'Códigos salvos · o site já usa os novos códigos' : 'Códigos salvos · agora ligue no passo 3'); render(); });
}
async function salvarMetas() {
  const patch = {};
  document.querySelectorAll('[data-traf]').forEach(el => { patch[el.dataset.traf] = el.value === '' ? null : Number(el.value); });
  await seguro(async () => { await salvarTrafego(patch); toast('Metas salvas'); render(); });
}
function exportGoogle() {
  const nome = traf().conv_offline || 'Cliente fechado';
  const linhas = [['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency'], ...leadsOfflineGoogle().map(x => [x.l.gclid, nome, x.quando, x.valor.toFixed(2), 'BRL'])];
  baixarArquivo(`google-ads-conversoes-${hoje()}.csv`, 'Parameters:TimeZone=-0300\n' + csv(linhas));
}
function exportMeta() {
  const linhas = [['phone', 'email', 'fn', 'ln', 'ct', 'country'], ...S.clientes.filter(c => c.whatsapp || c.email).map(c => {
    let tel = digitos(c.whatsapp); if (tel && tel.length <= 11) tel = '55' + tel;
    const partes = (c.nome || '').replace(/^(dra?\.?)\s+/i, '').split(/\s+/);
    return [tel, (c.email || '').toLowerCase(), partes[0] || '', partes.length > 1 ? partes[partes.length - 1] : '', (c.cidade || '').split('/')[0], 'BR'];
  })];
  baixarArquivo(`meta-clientes-${hoje()}.csv`, csv(linhas));
}

/* ---------------- Ler o cadastro nas mensagens do cliente ---------------- */
const cpfValido = d => { if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false; const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; return dv(9) === +d[9] && dv(10) === +d[10]; };
const cnpjValido = d => { if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false; const dv = n => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = p.reduce((t, w, i) => t + +d[i] * w, 0) % 11; return s < 2 ? 0 : 11 - s; }; return dv(12) === +d[12] && dv(13) === +d[13]; };
const fmtCpf = d => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
const fmtCnpj = d => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
const tituloNome = s => s.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, x => x.toLowerCase());
const ROTULOS_CAD = [
  ['nome', /^(nome( completo)?|raz[aã]o social|advogad[oa])$/], ['oab', /^(n[ºo°.]*\s*)?oab(\s*\/?\s*uf)?$/], ['doc', /^(cpf|cnpj|cpf\s*\/\s*cnpj|cpf ou cnpj|documento)$/],
  ['email', /^e-?mail$/], ['cidade', /^(cidade(\s*\/\s*uf)?|cidade e estado|local(idade)?)$/], ['escritorio', /^(escrit[oó]rio|sociedade|empresa)$/]
];
function lerCadastro(texto, tel = '') {
  const r = {}, telD = digitos(tel).slice(-11);
  const SAUDA = /^(ol[aá]|oi|bom dia|boa tarde|boa noite|segue[m]?( (os )?meus)?( dados)?|meus dados( s[aã]o)?|tudo bem|obrigad[oa])[!,.:\s]*/i;
  // pedaços: linhas, vírgulas e ponto e vírgula; tira marcadores de lista ("1.", "-", "•") e saudações
  const partes = String(texto || '').split(/\r?\n|;|,(?!\d)/).map(x => x.replace(/^\s*(?:[-•✔*>]|\d{1,2}[.)])\s+/, '').trim()).map(x => { let y = x, a; do { a = y; y = y.replace(SAUDA, '').trim(); } while (y !== a); return y; }).filter(Boolean);
  const usadas = new Set(), marca = x => usadas.add(x);
  // 1) "Campo: valor"
  partes.forEach(l => {
    const m = l.match(/^([^:–]{2,24}?)\s*[:–]\s*(.+)$/) || l.match(/^(nome completo|nome|oab|cpf|cnpj|e-?mail|cidade|escrit[oó]rio)\s+-\s+(.+)$/i); if (!m) return;
    const rot = roboNorm(m[1]).replace(/[^a-z /º°.]/g, '').trim(), val = m[2].trim();
    const campo = (ROTULOS_CAD.find(([, re]) => re.test(rot)) || [])[0];
    if (campo && val && !r[campo]) { r[campo] = val; marca(l); }
  });
  // 2) e-mail
  const em = (r.email || partes.join(' ')).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/); if (em) { r.email = em[0].toLowerCase(); partes.filter(l => l.includes(em[0])).forEach(marca); }
  // 3) CPF/CNPJ: confere os dígitos; número solto de 11 dígitos só vale se estiver sozinho e não for o WhatsApp do cliente
  const docs = [];
  if (r.doc) docs.push([r.doc, true]);
  partes.forEach(l => (l.match(/\d[\d.\-\/ ]{9,20}\d/g) || []).forEach(c => docs.push([c, /cpf|cnpj/i.test(l) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(c.trim()) || /\//.test(c) || l.replace(/\D/g, '') === c.replace(/\D/g, ''), l])));
  for (const [c, confiavel, l] of docs) {
    const d = c.replace(/\D/g, '');
    if (cnpjValido(d)) { r.cpf_cnpj = fmtCnpj(d); if (l) marca(l); break; }
    if (cpfValido(d) && confiavel && d !== telD && !(d.length === 11 && d[2] === '9' && !/[.\-]/.test(c) && !/cpf/i.test(l || 'cpf'))) { r.cpf_cnpj = fmtCpf(d); if (l) marca(l); break; }
  }
  delete r.doc;
  // 4) OAB: "OAB RJ 123.456", "OAB/RJ 123456", "OAB 45678/MG", "RJ 123.456", "112233/RS"
  const lerOab = t => {
    const s2 = t.replace(/\boab\b/ig, ' ');
    for (const re of [/\b([a-z]{2})[\s:nº°/.\-]+(\d[\d.]{2,8})\b/ig, /\b(\d[\d.]{2,8})[\s/\-]+([a-z]{2})\b/ig]) for (const m of s2.matchAll(re)) {
      const [uf, num] = /\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
      if (UF_NOME[uf.toUpperCase()]) return `${uf.toUpperCase()} ${num.replace(/\D/g, '')}`;
    }
    return null;
  };
  if (r.oab) r.oab = lerOab(r.oab) || r.oab.replace(/[^\d]/g, '') || r.oab;
  else { const l = partes.find(x => /oab/i.test(x) && lerOab(x)) || partes.find(x => /^\d{3,7}\s*\/\s*[a-z]{2}$/i.test(x) && !usadas.has(x)); if (l) { r.oab = lerOab(l); marca(l); } }
  // 5) cidade/UF (pedaço "Cidade/UF" ou "Cidade - UF")
  const lerCid = t => { const m = t.match(/^([A-Za-zÀ-ú][A-Za-zÀ-ú .']{1,40}?)[ \t]*[\/\-–][ \t]*([A-Za-z]{2})$/); return m && UF_NOME[m[2].toUpperCase()] ? `${tituloNome(m[1].trim())}/${m[2].toUpperCase()}` : null; };
  if (r.cidade) r.cidade = lerCid(r.cidade) || tituloNome(r.cidade);
  else { const l = partes.find(x => !usadas.has(x) && lerCid(x)); if (l) { r.cidade = lerCid(l); marca(l); } }
  // 6) escritório
  if (!r.escritorio) { const l = partes.find(x => !usadas.has(x) && /advogad[oa]s|advocacia|sociedade de advogados|escrit[oó]rio/i.test(x) && x.length < 80); if (l) { r.escritorio = l.replace(/^escrit[oó]rio\s*/i, '').trim(); marca(l); } }
  // 7) nome: primeiro pedaço "Nome Sobrenome" (2 a 7 palavras, sem números)
  const nomeRotulado = !!r.nome;
  if (!r.nome) { const l = partes.find(x => !usadas.has(x) && /^(dra?\.?\s+)?[A-Za-zÀ-ú'´]+(\s+[A-Za-zÀ-ú'´.]+){1,6}$/i.test(x) && !/advogad|advocacia|escrit|processo|c[aá]lculo/i.test(x)); if (l) r.nome = l; }
  if (r.nome) r.nome = /^[^a-zà-ú]+$|^[^A-ZÀ-Ú]+$/.test(r.nome.replace(/[^A-Za-zÀ-ú]/g, '')) ? tituloNome(r.nome) : r.nome;
  Object.keys(r).forEach(k => { if (!r[k]) delete r[k]; });
  // nome solto só vale junto de outro dado de cadastro (evita ler "Pode seguir" como nome)
  if (r.nome && !nomeRotulado && !['oab', 'cpf_cnpj', 'email', 'cidade', 'escritorio'].some(k => r[k])) delete r.nome;
  return r;
}
const camposAchados = r => ['nome', 'oab', 'cpf_cnpj', 'email', 'cidade', 'escritorio'].filter(k => r[k]).length;
// junta os dados das últimas mensagens recebidas (o cliente pode mandar em partes)
function cadastroDaConversa(c) {
  const msgs = (S.wa_mensagens[c.wa_id] || []).filter(m => m.direcao === 'in' && m.texto).slice(-12);
  const r = {}; msgs.forEach(m => Object.assign(r, lerCadastro(m.texto, c.wa_id)));
  return r;
}
async function preencherCadastro(waId) {
  const c = S.wa_conversas.find(x => x.wa_id === waId); if (!c) return;
  const l = leadDaConversa(c), achado = cadastroDaConversa(c);
  let cli = (c.cliente_id && cliente(c.cliente_id)) || (l?.cliente_id && cliente(l.cliente_id)) || S.clientes.find(x => x.whatsapp && digitos(x.whatsapp).slice(-9) === digitos(waId).slice(-9));
  const base = { ...(cli || {}), whatsapp: cli?.whatsapp || fmtTel(waId), origem: cli?.origem || (l ? canalLead(l) : 'WhatsApp direto') };
  Object.entries(achado).forEach(([k, v]) => { if (v) base[k] = v; });
  if (!base.nome) base.nome = l?.nome && !/^\d+$/.test(digitos(l.nome)) ? l.nome : (c.nome || '');
  const v = await abrirForm(cli ? 'Atualizar cadastro do cliente' : 'Cadastrar cliente', [
    { k: 'nome', rot: 'Nome completo (ou razão social)', req: true, full: true },
    { k: 'escritorio', rot: 'Escritório' }, { k: 'oab', rot: 'OAB (UF e número)' },
    { k: 'cpf_cnpj', rot: 'CPF ou CNPJ' }, { k: 'email', rot: 'E-mail', tipo: 'email' },
    { k: 'cidade', rot: 'Cidade/UF' }, { k: 'whatsapp', rot: 'WhatsApp' },
    { k: 'origem', rot: 'Como chegou', tipo: 'select', opcoes: CANAIS },
    { k: 'obs', rot: 'Observações', tipo: 'textarea', full: true }
  ], base);
  if (!v) return;
  await seguro(async () => {
    const salvar = async dados => cli ? atualizar('clientes', cli.id, dados) : criar('clientes', dados);
    try { cli = await salvar(v); }
    catch (e) { // banco ainda sem as colunas cpf_cnpj/escritorio: guarda nas observações
      if (!/cpf_cnpj|escritorio|column|schema cache/i.test(e.message || '')) throw e;
      const { cpf_cnpj, escritorio, ...resto } = v;
      cli = await salvar({ ...resto, obs: [resto.obs, cpf_cnpj && 'CPF/CNPJ: ' + cpf_cnpj, escritorio && 'Escritório: ' + escritorio].filter(Boolean).join(' · ') || null });
    }
    if (c.cliente_id !== cli.id || c.nome !== cli.nome) await atualizar('wa_conversas', c.id, { cliente_id: cli.id, nome: cli.nome });
    if (l) { await atualizar('leads', l.id, { cliente_id: cli.id, ...(l.nome && !/^\+?\d[\d\s()-]+$/.test(l.nome) ? {} : { nome: cli.nome }) }); await registrar(l.id, 'nota', `Cadastro preenchido: ${[cli.oab && 'OAB ' + cli.oab, cli.email, cli.cidade].filter(Boolean).join(' · ')}`, cli.id); }
    S.cadastroDispensado = { ...(S.cadastroDispensado || {}), [waId]: true };
    toast('Cadastro salvo'); render();
  });
}
// a faixa só aparece se houver dados novos (pelo menos 2) que o cadastro ainda não tem
function faixaCadastro(c) {
  if (!c || (S.cadastroDispensado || {})[c.wa_id]) return '';
  const r = cadastroDaConversa(c); if (camposAchados(r) < 2) return '';
  const cli = (c.cliente_id && cliente(c.cliente_id)) || null;
  const novos = Object.entries(r).filter(([k, v]) => !cli || !cli[k] || String(cli[k]).trim() !== String(v).trim());
  if (novos.length < 2 && cli) return '';
  const rot = { nome: 'nome', oab: 'OAB', cpf_cnpj: 'CPF/CNPJ', email: 'e-mail', cidade: 'cidade', escritorio: 'escritório' };
  return `<div class="wa-cadastro"><span>📋 <b>Encontramos dados de cadastro</b> nesta conversa: ${Object.keys(r).map(k => rot[k]).filter(Boolean).join(', ')}.</span>
    <span class="linha"><button class="btn mini ouro" data-cadastro="${c.wa_id}">${cli ? 'Atualizar cadastro' : 'Preencher cadastro'}</button><button class="btn mini sec" data-cadastro-ok="${c.wa_id}" title="Esconder">Agora não</button></span></div>`;
}

/* ---------------- Painel do cliente (link pessoal) ---------------- */
const novoToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
const linkPortal = c => `https://pontesferreiracalculos.com/cliente/?t=${c.portal_token}`;
async function abrirPortal(id, renovar) {
  let c = cliente(id); if (!c) return;
  await seguro(async () => {
    if (!c.portal_token || renovar) c = await atualizar('clientes', c.id, { portal_token: novoToken() });
    const url = linkPortal(c);
    const msg = `Olá, ${(c.nome || '').split(' ').slice(0, 2).join(' ')}! Este é o seu painel na Pontes Ferreira Cálculos: por ele você acompanha seus cálculos, baixa os arquivos (.PJC e relatório) e vê o que está em aberto.\n\n${url}\n\nO link é pessoal, não compartilhe. 🙂`;
    const f = document.createElement('div'); f.className = 'modal-fundo';
    f.innerHTML = `<div class="modal" style="width:min(560px,100%)"><h2>🔗 Painel do cliente</h2>
      <p class="desc" style="margin-bottom:10px">${esc(c.nome)} acompanha os cálculos, baixa os arquivos entregues e vê o que está a pagar. Sem senha: quem tem o link entra.</p>
      <div class="link-gerado"><code>${esc(url)}</code></div>
      <div class="linha" style="margin-top:12px">
        <button class="btn mini sec" data-p="copiar">📋 Copiar link</button>
        ${c.whatsapp ? '<button class="btn mini ouro" data-p="wa">💬 Enviar pelo WhatsApp</button>' : ''}
        <a class="btn mini sec" href="${esc(url)}" target="_blank" rel="noopener">Ver como o cliente ↗</a>
        <button class="btn mini perigo" data-p="renovar" style="margin-left:auto" title="O link antigo para de funcionar">Gerar novo link</button></div>
      <div class="rodape"><button class="btn sec" data-p="fechar">Fechar</button></div></div>`;
    document.body.appendChild(f);
    f.addEventListener('click', e => { if (e.target === f) f.remove(); });
    f.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const a = b.dataset.p; if (a === 'fechar') return f.remove();
      if (a === 'copiar') return copiarTexto(url);
      if (a === 'wa') { f.remove(); return abrirNoPainel(c.whatsapp, c.nome, msg, { cliente_id: c.id }); }
      if (a === 'renovar' && confirm('Gerar um novo link? O link antigo deixa de funcionar.')) { f.remove(); abrirPortal(id, true); }
    });
  });
}

/* ---------------- Entregas do cálculo (arquivos que o cliente baixa no portal) ---------------- */
async function anexarEntregas(calcId, arquivosSel) {
  const c = S.calculos.find(x => x.id === calcId); if (!c) return;
  const lista = [...(c.arquivos || [])];
  for (const f of arquivosSel) {
    if (f.size > 50 * 1048576) { toast(`${f.name}: maior que 50 MB`); continue; }
    const path = await db.upload(`entregas/${calcId}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`, f);
    lista.push({ path, nome: f.name });
  }
  return atualizar('calculos', calcId, { arquivos: lista });
}
function abrirEntregas(calcId) {
  const c = S.calculos.find(x => x.id === calcId); if (!c) return;
  const f = document.createElement('div'); f.className = 'modal-fundo'; f.id = 'entregas';
  const desenhar = () => {
    const cc = S.calculos.find(x => x.id === calcId), arq = cc.arquivos || [];
    f.innerHTML = `<div class="modal" style="width:min(560px,100%)"><h2>📎 Arquivos de entrega</h2>
      <p class="desc">${esc(cc.numero_processo || 'Cálculo')} · ${esc(cliente(cc.cliente_id)?.nome || 'sem cliente')}. ${cc.status === 'entregue' ? 'O cliente já pode baixar pelo painel dele.' : 'O cliente vê os arquivos quando o cálculo estiver como <b>Entregue</b>.'}</p>
      ${arq.length ? `<div class="tabela" style="margin-top:10px"><table>${arq.map((a, i) => `<tr><td>📄 ${esc(a.nome)}</td><td style="text-align:right;white-space:nowrap"><button class="btn mini sec" data-e="abrir" data-i="${i}">Abrir</button> <button class="btn mini perigo" data-e="tirar" data-i="${i}">Remover</button></td></tr>`).join('')}</table></div>` : '<div class="vazio">Nenhum arquivo ainda. Anexe o .PJC e o relatório em PDF.</div>'}
      <div class="rodape"><button class="btn sec" data-e="fechar">Fechar</button><button class="btn ouro" data-e="anexar">+ Anexar arquivos</button></div></div>`;
    f.querySelectorAll('[data-e]').forEach(b => b.onclick = () => seguro(async () => {
      const a = b.dataset.e, i = Number(b.dataset.i);
      if (a === 'fechar') { f.remove(); return render(); }
      if (a === 'abrir') return abrirPdf(arq[i].path);
      if (a === 'tirar') { if (!confirm(`Remover ${arq[i].nome}?`)) return; await atualizar('calculos', calcId, { arquivos: arq.filter((_, j) => j !== i) }); return desenhar(); }
      if (a === 'anexar') {
        const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pjc,.PJC,.pdf,.xlsx,.xls,.docx,.zip';
        inp.onchange = () => seguro(async () => { if (!inp.files.length) return; toast('Enviando…'); await anexarEntregas(calcId, [...inp.files]); toast('Arquivos anexados'); desenhar(); });
        inp.click();
      }
    }));
  };
  document.body.appendChild(f); f.addEventListener('click', e => { if (e.target === f) { f.remove(); render(); } }); desenhar();
}

/* ---------------- Fluxo de caixa ---------------- */
const cfgFin = () => ({ meta_mensal: 0, ...(S.ajustes.financeiro || {}) });
function telaFluxoCaixa() {
  const n = 12, ms = meses(n), meta = Number(cfgFin().meta_mensal) || 0;
  const linhas = ms.map(x => {
    const ent = soma(S.calculos.filter(c => c.pago && (c.data_pagamento || '').slice(0, 7) === x.chave), c => c.valor_cobrado);
    const fat = soma(S.calculos.filter(c => c.status === 'entregue' && (c.data_entrega || '').slice(0, 7) === x.chave), c => c.valor_cobrado);
    const sai = soma(S.despesas.filter(d => (d.data || '').slice(0, 7) === x.chave), d => d.valor);
    const ads = soma(S.despesas.filter(d => (d.data || '').slice(0, 7) === x.chave && CANAIS_ADS.includes(d.canal)), d => d.valor);
    return { ...x, ent, fat, sai, ads, res: ent - sai };
  });
  let acum = 0; linhas.forEach(l => { acum += l.res; l.acum = acum; });
  const atual = linhas[linhas.length - 1], hojeD = new Date(), diasMes = new Date(hojeD.getFullYear(), hojeD.getMonth() + 1, 0).getDate();
  const ritmo = meta ? meta * hojeD.getDate() / diasMes : 0;
  const aReceber = soma(S.calculos.filter(c => c.status === 'entregue' && !c.pago), c => c.valor_cobrado);
  const emProducao = soma(S.calculos.filter(c => c.status !== 'entregue'), c => c.valor_cobrado);
  const ltv = S.clientes.map(c => { const cs = S.calculos.filter(x => x.cliente_id === c.id); return { c, n: cs.length, total: soma(cs, x => x.valor_cobrado), pago: soma(cs.filter(x => x.pago), x => x.valor_cobrado), desde: cs.map(x => x.data_entrada).sort()[0] }; }).filter(x => x.n).sort((a, b) => b.total - a.total).slice(0, 10);
  const total12 = soma(linhas, l => l.ent), mediaMes = total12 / n;
  return `<div class="kpis">
    ${kpi('Recebido no mês', brl0(atual.ent), meta ? `meta ${brl0(meta)} · ${pct(atual.ent / meta)}` : 'defina a meta mensal', meta && atual.ent < ritmo)}
    ${kpi('Despesas no mês', brl0(atual.sai), `anúncios: ${brl0(atual.ads)}`)}
    ${kpi('Resultado do mês', brl0(atual.res), 'recebido − despesas', atual.res < 0)}
    ${kpi('A receber', brl0(aReceber), 'cálculos entregues não pagos')}
    ${kpi('Em produção', brl0(emProducao), 'cálculos ainda não entregues')}
    ${kpi('Média mensal', brl0(mediaMes), 'recebido, últimos 12 meses')}
  </div>
  <div class="grade">
    <div class="card"><div class="linha" style="justify-content:space-between"><h2>Meta do mês</h2><button class="btn mini sec" data-acao="definirMeta">${meta ? 'Alterar meta' : 'Definir meta'}</button></div>
      <div class="desc">${meta ? `Recebido até hoje × meta de ${brl0(meta)} · a linha marca onde deveria estar hoje` : 'Defina quanto quer receber por mês para acompanhar o ritmo.'}</div>
      ${meta ? `<div class="verba" style="height:16px;margin-top:14px"><div style="width:${Math.min(100, atual.ent / meta * 100).toFixed(1)}%;background:${atual.ent >= ritmo ? 'var(--good)' : 'var(--selo)'}"></div><i style="left:${Math.min(100, ritmo / meta * 100).toFixed(1)}%"></i></div>
        <p style="margin-top:10px">${atual.ent >= meta ? '🎉 Meta batida!' : `Faltam <b>${brl0(meta - atual.ent)}</b> · cerca de <b>${Math.ceil((meta - atual.ent) / (Number(traf().ticket_medio) || 250))}</b> cálculo(s) de ${brl0(Number(traf().ticket_medio) || 250)}`}${atual.ent < ritmo ? ' · abaixo do ritmo' : ''}</p>` : ''}</div>
    <div class="card"><h2>Entradas × saídas</h2><div class="desc">Recebido e despesas por mês, últimos 12 meses</div>
      <div class="legenda"><span><i style="background:var(--s1)"></i>Recebido</span><span><i style="background:var(--s2)"></i>Despesas</span></div>
      ${graficoColunas(linhas.map(l => ({ rot: l.rot, valores: [l.ent, l.sai] })), [{ nome: 'Recebido', cor: 'var(--s1)' }, { nome: 'Despesas', cor: 'var(--s2)' }], v => v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : brl0(v))}</div>
    <div class="card larga"><h2>Fluxo de caixa mês a mês</h2><div class="desc">Recebido = pagamentos com data no mês · Faturado = cálculos entregues no mês</div>
      <div class="tabela"><table><tr><th>Mês</th><th class="n">Faturado</th><th class="n">Recebido</th><th class="n">Despesas</th><th class="n">Anúncios</th><th class="n">Resultado</th><th class="n">Acumulado</th></tr>
      ${[...linhas].reverse().map(l => `<tr><td>${l.rot}</td><td class="n">${brl0(l.fat)}</td><td class="n">${brl0(l.ent)}</td><td class="n">${brl0(l.sai)}</td><td class="n">${brl0(l.ads)}</td><td class="n" style="color:${l.res < 0 ? 'var(--crit)' : 'inherit'}">${brl0(l.res)}</td><td class="n">${brl0(l.acum)}</td></tr>`).join('')}
      <tr><td><b>12 meses</b></td><td class="n"><b>${brl0(soma(linhas, l => l.fat))}</b></td><td class="n"><b>${brl0(total12)}</b></td><td class="n"><b>${brl0(soma(linhas, l => l.sai))}</b></td><td class="n"><b>${brl0(soma(linhas, l => l.ads))}</b></td><td class="n"><b>${brl0(soma(linhas, l => l.res))}</b></td><td></td></tr></table></div></div>
    <div class="card larga"><h2>Quanto cada cliente rende</h2><div class="desc">Os 10 clientes com mais valor em cálculos (todo o período)</div>
      ${ltv.length ? `<div class="tabela"><table><tr><th>Cliente</th><th>Cliente desde</th><th class="n">Cálculos</th><th class="n">Total</th><th class="n">Pago</th><th class="n">Ticket médio</th></tr>
      ${ltv.map(x => `<tr class="clic" data-cliente="${x.c.id}"><td><b>${esc(x.c.nome)}</b></td><td>${dataBR(x.desde)}</td><td class="n">${x.n}</td><td class="n">${brl0(x.total)}</td><td class="n">${brl0(x.pago)}</td><td class="n">${brl0(x.total / x.n)}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Sem cálculos com cliente ainda</div>'}</div>
  </div>`;
}
async function definirMeta() {
  const v = await abrirForm('Meta mensal de recebimento', [{ k: 'meta_mensal', rot: 'Quanto quer receber por mês (R$)', tipo: 'number', req: true, full: true }], cfgFin());
  if (!v) return;
  await seguro(async () => { const novo = { ...cfgFin(), meta_mensal: v.meta_mensal }; await ajustesDb.salvar('financeiro', novo); S.ajustes.financeiro = novo; toast('Meta salva'); render(); });
}

/* ---------------- Agenda (prazos, retornos e follow-ups por dia) ---------------- */
function itensAgenda() {
  const h = hoje(), itens = [];
  S.calculos.filter(c => c.status !== 'entregue' && c.prazo_entrega).forEach(c => itens.push({ dia: c.prazo_entrega, tipo: 'prazo', ic: '📑', titulo: `Entrega: ${c.numero_processo || 'cálculo'}`, sub: `${cliente(c.cliente_id)?.nome || 'sem cliente'} · ${c.tipo || ''} · ${STATUS_CALC[c.status] || c.status}`, attr: `data-calc="${c.id}"`, critico: c.prazo_entrega < h }));
  S.leads.filter(l => ativo(l) && l.proximo_contato).forEach(l => itens.push({ dia: l.proximo_contato, tipo: 'retorno', ic: '📞', titulo: `Retorno: ${l.nome || 'lead'}`, sub: `${STATUS_LEAD[l.status]}${l.valor_orcado ? ' · ' + brl0(l.valor_orcado) : ''}`, attr: `data-ficha="${l.id}"`, critico: l.proximo_contato < h }));
  S.prospects.filter(p => contatavel(p) && p.status === 'contatado' && p.proximo_contato && (p.tentativas || 0) < cfgProsp().max_tentativas).forEach(p => itens.push({ dia: p.proximo_contato, tipo: 'prosp', ic: '🎯', titulo: `Follow-up: ${p.nome}`, sub: `${p.cidade || ''} · ${p.tentativas}ª tentativa feita`, attr: `data-abordar="${p.id}"`, critico: false }));
  S.calculos.filter(c => c.status === 'entregue' && !c.pago && c.data_entrega).forEach(c => { const d = somaDias(c.data_entrega, 7); itens.push({ dia: d, tipo: 'cobrar', ic: '💰', titulo: `Cobrar: ${cliente(c.cliente_id)?.nome || c.numero_processo || 'cálculo'}`, sub: `${brl(c.valor_cobrado)} · entregue ${dataBR(c.data_entrega)}`, attr: `data-calc="${c.id}"`, critico: d < h }); });
  return itens;
}
function telaAgenda() {
  const h = hoje(), filtro = S.filtroAgenda || 'todos', itens = itensAgenda().filter(i => filtro === 'todos' || i.tipo === filtro);
  const atrasados = itens.filter(i => i.dia < h), dias = Array.from({ length: 14 }, (_, k) => somaDias(h, k));
  const nomeDia = d => d === h ? 'Hoje' : d === somaDias(h, 1) ? 'Amanhã' : new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const item = i => `<div class="ag-item ${i.critico ? 'critico' : ''} clic" ${i.attr}><span class="ag-ic">${i.ic}</span><div><b>${esc(i.titulo)}</b><div class="desc" style="margin:0">${esc(i.sub)}</div></div></div>`;
  const cont = t => itensAgenda().filter(i => i.tipo === t && i.dia <= somaDias(h, 6)).length;
  return `<div class="topo"><h1>Agenda</h1><div class="acoes"><div class="seg">${[['todos', 'Tudo'], ['prazo', '📑 Entregas'], ['retorno', '📞 Retornos'], ['prosp', '🎯 Prospecção'], ['cobrar', '💰 Cobranças']].map(([k, v]) => `<button class="${k === filtro ? 'on' : ''}" data-filtro-agenda="${k}">${v}</button>`).join('')}</div></div></div>
  <div class="kpis">${kpi('Atrasados', atrasados.length, 'prazos e retornos vencidos', atrasados.length > 0)}${kpi('Entregas em 7 dias', cont('prazo'))}${kpi('Retornos em 7 dias', cont('retorno'))}${kpi('Follow-ups em 7 dias', cont('prosp'))}${kpi('Cobranças em 7 dias', cont('cobrar'))}</div>
  ${atrasados.length ? `<div class="card larga ag-dia" style="border-color:#f3c2c2"><h2>⚠ Atrasados</h2>${atrasados.sort((a, b) => a.dia.localeCompare(b.dia)).map(i => item({ ...i, sub: `${dataBR(i.dia)} · ${i.sub}` })).join('')}</div>` : ''}
  <div class="agenda">${dias.map(d => { const doDia = itens.filter(i => i.dia === d); return `<div class="card ag-dia ${d === h ? 'hoje' : ''}"><h2>${nomeDia(d)} <span class="desc">${dataBR(d)}</span></h2>${doDia.length ? doDia.map(item).join('') : '<div class="desc">Livre</div>'}</div>`; }).join('')}</div>
  <p class="desc" style="margin-top:12px">Todo dia às 8h você recebe por e-mail o que vence hoje e amanhã, os atrasos e os leads sem resposta (Configurações > Ajustes).</p>`;
}
async function testarEmail(tipo) {
  if (DEMO) return toast('O e-mail de teste funciona depois de ligar o Supabase.');
  await seguro(async () => {
    toast('Enviando e-mail de teste…');
    const { data, error } = await sb.functions.invoke('alertas', { body: { tipo, teste: true } });
    if (error) { let d = {}; try { d = await error.context.json(); } catch { } throw new Error(d.mensagem || error.message); }
    toast(data?.enviado ? `E-mail ${tipo === 'diario' ? 'diário' : 'semanal'} enviado para adm@` : 'Nada enviado');
  });
}
async function alternarEmail(tipo, ligado) {
  await seguro(async () => { const a = S.ajustes.alertas || {}; const novo = { ...a, desligado: { ...(a.desligado || {}), [tipo]: !ligado } }; await ajustesDb.salvar('alertas', novo); S.ajustes.alertas = novo; toast(ligado ? 'Ligado' : 'Desligado'); render(); });
}

/* ---------------- Configurações + Monitor de respostas ---------------- */
// Palavras que o monitor procura nas mensagens RECEBIDAS (editáveis em Configurações)
const MONITOR_PADRAO = {
  fechamento: 'pode seguir, pode fazer, pode começar, pode iniciar, fechado, fechamos, aprovado, vamos fazer, vamos seguir, ok pode, manda o pix, qual o pix, chave pix, dados para pagamento, vou pagar, segue o comprovante, comprovante, pago',
  interesse: 'quanto, valor, preço, preco, orçamento, orcamento, prazo, como funciona, vocês fazem, voces fazem, atende, consegue, tenho um processo, preciso de um cálculo, preciso de calculo, liquidação, impugnação, inicial',
  urgencia: 'urgente, urgência, prazo vence, vence amanhã, vence hoje, amanhã, até sexta, essa semana, prazo curto',
  objecao: 'caro, muito caro, está caro, desconto, mais barato, valor alto',
  desinteresse: 'não tenho interesse, nao tenho interesse, sem interesse, não preciso, nao preciso, já tenho calculista, ja tenho calculista, faço internamente, fazemos internamente, não obrigado, nao obrigado, remover, pare de, não me mande, nao me mande, descadastrar, não quero, nao quero'
};
const cfgMonitor = () => ({ ...MONITOR_PADRAO, ...(S.ajustes.monitor || {}) });
const termos = txt => String(txt || '').split(',').map(x => roboNorm(x)).filter(Boolean);
const temTermo = (texto, lista) => lista.find(t => roboNorm(texto).includes(t));

async function carregarMensagensMonitor(forcar) {
  if (S.monitor && !forcar && Date.now() - S.monitor.em < 120000) return;
  S.monitor = { em: Date.now(), carregando: true, msgs: S.monitor?.msgs || [] };
  try {
    let msgs = [];
    if (DEMO) msgs = L.get('wa_mensagens');
    else {
      const desde = new Date(Date.now() - 45 * 864e5).toISOString();
      for (let pag = 0; pag < 10; pag++) { // até 10 mil mensagens, em páginas de 1000
        const { data, error } = await sb.from('wa_mensagens').select('wa_id,direcao,tipo,texto,arquivo_nome,created_at,bot').gte('created_at', desde).order('created_at', { ascending: true }).range(pag * 1000, pag * 1000 + 999);
        if (error) throw error; msgs = msgs.concat(data || []); if (!data || data.length < 1000) break;
      }
    }
    S.monitor = { em: Date.now(), carregando: false, msgs };
  } catch (e) { console.warn('monitor', e); S.monitor = { em: Date.now(), carregando: false, msgs: [], erro: e.message }; }
  if (rota() === 'configuracoes') render();
}

/* nota de 0 a 100 + motivos + próxima ação, para cada conversa */
function avaliarConversa(c, msgs) {
  const cfg = cfgMonitor(), l = leadDaConversa(c);
  const prosp = S.prospects.find(p => p.whatsapp && digitos(p.whatsapp).slice(-9) === digitos(c.wa_id).slice(-9));
  const entrada = msgs.filter(m => m.direcao === 'in'), saida = msgs.filter(m => m.direcao === 'out');
  const ultima = msgs[msgs.length - 1], ultIn = entrada[entrada.length - 1];
  const motivos = []; let nota = 10, negativo = false;
  const add = (pts, txt) => { nota += pts; motivos.push([pts, txt]); };
  if (l?.status === 'fechado' || c.cliente_id) return { c, l, prosp, nota: 100, faixa: 'cliente', motivos: [[0, 'já é cliente']], acao: ['cliente', 'Atender / novo cálculo'], ultima, ultIn };
  if (l?.status === 'perdido') return { c, l, prosp, nota: 0, faixa: 'perdido', motivos: [[0, `marcado como perdido${l.motivo_perda ? ': ' + l.motivo_perda : ''}`]], acao: ['nada', '—'], ultima, ultIn };
  if (!entrada.length) {
    add(0, saida.length ? 'ainda não respondeu' : 'sem mensagens');
    if (ultima && minutosDesde(ultima.created_at) > 3 * 1440) add(-5, 'sem resposta há mais de 3 dias');
  } else {
    const primeiraIn = msgs[0]?.direcao === 'in';
    if (primeiraIn) add(15, 'procurou você primeiro'); else add(20, 'respondeu à sua mensagem');
    const textos = entrada.map(m => m.texto || '').join(' \n ');
    const f = temTermo(textos, termos(cfg.fechamento)); if (f) add(35, `sinal de fechamento: "${f}"`);
    const i = temTermo(textos, termos(cfg.interesse)); if (i) add(15, `demonstrou interesse: "${i}"`);
    const u = temTermo(textos, termos(cfg.urgencia)); if (u) add(10, `tem urgência: "${u}"`);
    if (entrada.some(m => roboCnj(m.texto)) || l?.numero_processo) add(20, 'enviou o número do processo');
    else if (entrada.some(m => m.tipo === 'document' && /\.pdf$/i.test(m.arquivo_nome || ''))) add(20, 'enviou o PDF do processo');
    const o = temTermo(textos, termos(cfg.objecao)); if (o) add(-10, `objeção de preço: "${o}"`);
    const d = temTermo(textos, termos(cfg.desinteresse)); if (d) { add(-60, `sem interesse: "${d}"`); negativo = true; }
    if (entrada.length >= 3) add(10, `${entrada.length} mensagens dele(a)`);
    // respondeu rápido a alguma mensagem sua
    const rapida = entrada.some(m => { const antes = saida.filter(s => s.created_at < m.created_at).pop(); return antes && (new Date(m.created_at) - new Date(antes.created_at)) < 3600e3; });
    if (rapida) add(10, 'responde rápido');
    const diasSemFalar = Math.max(0, minutosDesde(ultIn.created_at)) / 1440;
    if (diasSemFalar > 14) add(-25, `não fala há ${Math.floor(diasSemFalar)} dias`); else if (diasSemFalar > 7) add(-15, `não fala há ${Math.floor(diasSemFalar)} dias`);
  }
  if (l?.status === 'orcamento') add(10, 'orçamento enviado');
  if (/48h|urgente/i.test(l?.prazo || '')) add(10, 'pedido urgente no site');
  nota = Math.max(0, Math.min(99, Math.round(nota)));
  const faixa = negativo || nota < 15 ? 'fria' : nota >= 70 ? 'alta' : nota >= 40 ? 'media' : 'baixa';
  // próxima ação sugerida
  const esperando = ultima?.direcao === 'in' && !ultima.bot;
  const minEsp = esperando ? Math.max(0, minutosDesde(ultima.created_at)) : 0;
  let acao;
  if (negativo) acao = prosp ? ['naocontatar', 'Marcar "Não contatar"'] : ['perdido', 'Marcar como perdido'];
  else if (esperando) acao = ['responder', `Responder agora (esperando há ${fmtMin(minEsp)})`];
  else if (motivos.some(([, t]) => t.startsWith('sinal de fechamento'))) acao = ['calculo', 'Converter em cálculo'];
  else if ((motivos.some(([, t]) => /processo|interesse/.test(t))) && l?.status !== 'orcamento') acao = ['orcamento', 'Enviar orçamento'];
  else if (motivos.some(([, t]) => t.startsWith('objeção'))) acao = ['negociar', 'Mostrar o que está incluído / negociar'];
  else if (ultima?.direcao === 'out' && minutosDesde(ultima.created_at) > 2 * 1440) acao = ['followup', 'Fazer follow-up'];
  else acao = ['aguardar', 'Aguardar resposta'];
  return { c, l, prosp, nota, faixa, motivos, acao, ultima, ultIn, esperando, minEsp };
}
const FAIXAS = { alta: ['🔥 Alta chance', 't-good'], media: ['🌤 Média', 't-warn'], baixa: ['❄ Baixa', 't-azul'], fria: ['⛔ Sem interesse', 't-crit'], cliente: ['✅ Cliente', 't-good'], perdido: ['Perdido', 't-neutro'] };

function telaConfiguracoes() {
  const aba = S.abaConfig || 'monitor';
  const abas = { monitor: 'Monitor de respostas', ajustes: 'Ajustes do sistema' };
  return `<div class="topo"><h1>Configurações</h1><div class="acoes">${aba === 'monitor' ? '<button class="btn sec" data-acao="atualizarMonitor">↻ Atualizar</button><button class="btn sec" data-acao="configMonitor">⚙ Palavras do monitor</button>' : ''}</div></div>
  <div class="seg" style="margin-bottom:16px">${Object.entries(abas).map(([k, v]) => `<button class="${k === aba ? 'on' : ''}" data-aba-config="${k}">${v}</button>`).join('')}</div>
  ${aba === 'monitor' ? telaMonitor() : telaAjustes()}`;
}

function telaMonitor() {
  carregarMensagensMonitor();
  const porWa = {};
  (S.monitor?.msgs || []).forEach(m => (porWa[m.wa_id] = porWa[m.wa_id] || []).push(m));
  const filtro = S.filtroMonitor || 'ativos';
  const todos = S.wa_conversas.map(c => avaliarConversa(c, (porWa[c.wa_id] || []).sort((a, b) => a.created_at.localeCompare(b.created_at))));
  const ativos = todos.filter(x => !['cliente', 'perdido'].includes(x.faixa));
  const lista = (filtro === 'ativos' ? ativos : filtro === 'esperando' ? ativos.filter(x => x.esperando) : filtro === 'todos' ? todos : todos.filter(x => x.faixa === filtro))
    .sort((a, b) => (b.esperando - a.esperando) || (b.nota - a.nota));
  const previsao = soma(ativos, x => (x.nota / 100) * (Number(x.l?.valor_orcado) || 250));
  const esperando = ativos.filter(x => x.esperando);
  const abordados = S.prospects.filter(p => p.tentativas > 0), resp = S.prospects.filter(p => ['respondeu', 'interessado', 'cliente'].includes(p.status));
  const cont = f => ativos.filter(x => x.faixa === f).length;
  return `
  ${S.monitor?.carregando && !S.monitor.msgs.length ? '<div class="demo"><span>Lendo as conversas…</span></div>' : ''}
  ${S.monitor?.erro ? `<div class="demo"><span>Não foi possível ler as mensagens: ${esc(S.monitor.erro)}</span></div>` : ''}
  <div class="kpis">
    ${kpi('Esperando sua resposta', esperando.length, esperando.length ? `a mais antiga há ${fmtMin(Math.max(...esperando.map(x => x.minEsp)))}` : 'tudo respondido 🎉', esperando.some(x => x.minEsp > MIN_RESPOSTA))}
    ${kpi('🔥 Alta chance', cont('alta'), 'prováveis clientes')}
    ${kpi('🌤 Média', cont('media'), 'precisam de um empurrão')}
    ${kpi('❄ Baixa / ⛔', cont('baixa') + cont('fria'), `${cont('fria')} sem interesse`)}
    ${kpi('Previsão de receita', brl0(previsao), 'soma de valor × chance de fechar')}
    ${kpi('Taxa de resposta', abordados.length ? pct(resp.length / abordados.length) : '—', 'na prospecção')}
  </div>
  <div class="card larga"><div class="linha" style="justify-content:space-between"><h2>Quem vai virar cliente</h2>
    <div class="seg">${[['ativos', 'Em aberto'], ['esperando', 'Esperando você'], ['alta', '🔥 Alta'], ['media', '🌤 Média'], ['baixa', '❄ Baixa'], ['fria', '⛔ Sem interesse'], ['todos', 'Todos']].map(([k, v]) => `<button class="${k === filtro ? 'on' : ''}" data-filtro-monitor="${k}">${v}</button>`).join('')}</div></div>
    <div class="desc">Nota de 0 a 100 calculada pelas mensagens recebidas nos últimos 45 dias. Passe o mouse na nota para ver os motivos.</div>
    ${lista.length ? `<div class="tabela"><table><tr><th>Contato</th><th>Chance</th><th>Por quê</th><th>Última mensagem</th><th>Próxima ação</th></tr>
    ${lista.map(x => { const [rot, cls] = FAIXAS[x.faixa]; const ult = x.ultima; return `<tr>
      <td><b class="link" data-conv-monitor="${x.c.wa_id}">${esc(x.c.nome || fmtTel(x.c.wa_id))}</b><div class="desc" style="margin:0">${x.l ? esc(STATUS_LEAD[x.l.status]) : x.prosp ? 'Prospecção · ' + esc(STATUS_PROSP[x.prosp.status]) : 'Conversa'}${x.l?.valor_orcado ? ' · ' + brl0(x.l.valor_orcado) : ''}</div></td>
      <td style="white-space:nowrap"><div class="nota-barra" data-tip="${esc(x.motivos.map(([p, t]) => `${p > 0 ? '+' : ''}${p} ${t}`).join('\n'))}"><i style="width:${x.nota}%" class="${cls}"></i></div><span class="tag ${cls}">${rot} · ${x.nota}</span></td>
      <td class="motivos">${x.motivos.filter(([p]) => p !== 0).slice(0, 3).map(([p, t]) => `<span class="${p > 0 ? 'mais' : 'menos'}">${p > 0 ? '▲' : '▼'} ${esc(t)}</span>`).join('') || '<span class="desc">—</span>'}</td>
      <td style="max-width:260px"><span class="desc">${ult ? `${ult.direcao === 'in' ? '⬅' : '➡'} ${quandoCurto(ult.created_at)}` : ''}</span><div class="trecho">${esc((ult?.texto || (ult?.arquivo_nome ? '📎 ' + ult.arquivo_nome : '')).slice(0, 90))}</div></td>
      <td>${botaoAcaoMonitor(x)}</td></tr>`; }).join('')}</table></div>`
      : `<div class="vazio">${S.wa_conversas.length ? 'Nenhuma conversa neste filtro.' : 'As conversas do WhatsApp aparecem aqui assim que chegarem.'}</div>`}
  </div>`;
}
function botaoAcaoMonitor(x) {
  const [tipo, rot] = x.acao, cor = { responder: 'ouro', calculo: 'ouro', orcamento: '', naocontatar: 'perigo', perdido: 'perigo' }[tipo] ?? 'sec';
  if (tipo === 'nada' || tipo === 'aguardar') return `<span class="desc">${esc(rot)}</span>`;
  return `<button class="btn mini ${cor}" data-acao-monitor="${tipo}" data-wa="${x.c.wa_id}">${esc(rot)}</button>`;
}
async function executarAcaoMonitor(tipo, waId) {
  const c = S.wa_conversas.find(x => x.wa_id === waId); if (!c) return;
  const l = leadDaConversa(c), prosp = S.prospects.find(p => p.whatsapp && digitos(p.whatsapp).slice(-9) === digitos(waId).slice(-9));
  await seguro(async () => {
    if (tipo === 'responder' || tipo === 'negociar') return abrirConversa(waId);
    if (tipo === 'orcamento' || tipo === 'followup') { await abrirConversa(waId); preencherRapida(RESPOSTAS_RAPIDAS.findIndex(r => r[1] === (tipo === 'orcamento' ? 'orcamento' : 'followup'))); return; }
    if (tipo === 'calculo') return l ? leadParaCalculo(l) : toast('Crie o lead pela conversa antes de converter.');
    if (tipo === 'naocontatar' && prosp) { await atualizar('prospects', prosp.id, { status: 'nao_contatar', proximo_contato: null }); if (l) await atualizar('leads', l.id, { status: 'perdido', motivo_perda: 'Sem interesse' }); toast('Marcado como Não contatar'); return render(); }
    if (tipo === 'perdido' && l) { await atualizar('leads', l.id, { status: 'perdido', motivo_perda: 'Sem interesse' }); await registrar(l.id, 'status', 'Perdido: sem interesse (monitor de respostas)'); toast('Marcado como perdido'); return render(); }
    if (tipo === 'cliente' && l) return editarCalculo(null);
  });
}
async function configMonitor() {
  const c = cfgMonitor();
  const v = await abrirForm('⚙ Palavras do monitor de respostas', [
    { k: 'fechamento', rot: 'Sinais de fechamento (+35) · separe por vírgula', tipo: 'textarea', full: true },
    { k: 'interesse', rot: 'Sinais de interesse (+15)', tipo: 'textarea', full: true },
    { k: 'urgencia', rot: 'Urgência (+10)', tipo: 'textarea', full: true },
    { k: 'objecao', rot: 'Objeção de preço (−10)', tipo: 'textarea', full: true },
    { k: 'desinteresse', rot: 'Sem interesse (−60, sugere "Não contatar")', tipo: 'textarea', full: true }
  ], c);
  if (!v) return;
  const novo = {}; Object.keys(MONITOR_PADRAO).forEach(k => { if (v[k] && v[k] !== MONITOR_PADRAO[k]) novo[k] = v[k]; });
  await seguro(async () => { await ajustesDb.salvar('monitor', novo); S.ajustes.monitor = novo; toast('Palavras salvas'); render(); });
}
function telaAjustes() {
  const c = (rot, desc, botoes) => `<div class="card"><h2>${rot}</h2><div class="desc">${desc}</div><div class="linha">${botoes}</div></div>`;
  const wa = EVOLUTION() ? (S.waEstado === 'open' ? `🟢 conectado${S.waNumero ? ' · ' + esc(fmtTel(S.waNumero)) : ''}` : '📵 desconectado') : (WA_PAINEL() ? 'API oficial' : 'manual (app do celular)');
  return `<div class="grade">
    ${c('WhatsApp', `Situação: <b>${wa}</b>`, `<a class="btn mini sec" href="#whatsapp">Abrir WhatsApp</a>${EVOLUTION() && S.waEstado !== 'open' ? '<button class="btn mini ouro" data-acao="waConectar">Conectar</button>' : ''}`)}
    ${c('Mensagens prontas', 'Variações das respostas rápidas e das mensagens da prospecção.', '<button class="btn mini sec" data-acao="configRespostas">⚡ Respostas rápidas</button><button class="btn mini sec" data-acao="configProsp">🎯 Mensagens da prospecção</button>')}
    ${c('Atendimento automático', `Robô do WhatsApp: <b>${cfgRobo().ativo ? 'ligado' : 'desligado'}</b>.`, '<button class="btn mini sec" data-acao="configurarRobo">⚙ Configurar robô</button><button class="btn mini sec" data-acao="testarRobo">🧪 Testar</button>')}
    ${c('E-mails automáticos', `Para adm@pontesferreiracalculos.com. <label class="linha" style="margin-top:6px"><input type="checkbox" data-email-tipo="diario" ${(S.ajustes.alertas?.desligado || {}).diario ? '' : 'checked'}> Agenda do dia (todo dia, 8h)</label><label class="linha"><input type="checkbox" data-email-tipo="semanal" ${(S.ajustes.alertas?.desligado || {}).semanal ? '' : 'checked'}> Resumo da semana (segunda, 8h)</label>`, '<button class="btn mini sec" data-acao="emailTesteDiario">Enviar teste: agenda</button><button class="btn mini sec" data-acao="emailTesteSemanal">Enviar teste: semana</button>')}
    ${c('Monitor de respostas', 'Palavras que indicam fechamento, interesse, urgência, objeção e desinteresse.', '<button class="btn mini sec" data-acao="configMonitor">⚙ Palavras do monitor</button>')}
    ${c('Anúncios e rastreamento', `Google, Meta Pixel e Clarity: <b>${rast().ativo ? 'ligados' : 'desligados'}</b>.`, '<a class="btn mini sec" href="#trafego" data-aba-trafego="ativacao">Abrir Ativação</a>')}
    ${c('Conta', DEMO ? 'Modo demonstração.' : 'Login: adm@pontesferreiracalculos.com', DEMO ? '' : '<button class="btn mini sec" data-acao="trocarSenha">Trocar senha</button><button class="btn mini sec" data-acao="sair">Sair</button>')}
  </div>`;
}

/* ---------------- menu e busca rápida (Ctrl+K) ---------------- */
const GRUPOS_NAV = [['Operação', ['painel', 'agenda', 'leads', 'prospeccao', 'whatsapp', 'calculos', 'clientes']], ['Crescimento', ['mapa', 'trafego']], ['Gestão', ['financeiro', 'configuracoes']]];
const ic = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONES = {
  painel: ic('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  agenda: ic('<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h3M13.5 13.5h3M7.5 17h3"/>'),
  mapa: ic('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  leads: ic('<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'),
  prospeccao: ic('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>'),
  whatsapp: ic('<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/>'),
  calculos: ic('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4"/>'),
  clientes: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'),
  financeiro: ic('<path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/>'),
  trafego: ic('<path d="M4 15V9l12-5v16L4 15z"/><path d="M8 16.5 9.5 21h3L11 17"/>'),
  configuracoes: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
};
const PAL = { aberta: false, q: '', i: 0, itens: [] };
function itensPaleta(q) {
  const n = roboNorm(q), dig = digitos(q), bate = (...v) => !n || v.some(x => roboNorm(x).includes(n)) || (dig.length >= 4 && v.some(x => digitos(x).includes(dig)));
  const out = [];
  Object.entries(ROTAS).filter(([k]) => k !== 'whatsapp' || WA_PAINEL()).forEach(([k, [rot]]) => { if (bate(rot, 'ir para ' + rot)) out.push({ g: 'Ir para', rot, ic: ICONES[k], run: () => { location.hash = k; } }); });
  [['Novo lead', () => editarLead(null)], ['Novo cálculo', () => editarCalculo(null)], ['Novo cliente', () => editarCliente(null)], ['Novo contato de prospecção', () => { location.hash = 'prospeccao'; editarProsp(null); }],
   ['Próximo da fila de prospecção', () => { location.hash = 'prospeccao'; proximoDaFila(null); }], ['Lançar gasto com anúncios', () => novoGasto()], ['Lançar despesa', () => editarDespesa(null)], ['Importar .PJC', () => importarPJC()]]
    .forEach(([rot, run]) => { if (bate(rot)) out.push({ g: 'Ações', rot, ic: '＋', run }); });
  if (q.trim().length >= 2) {
    S.leads.filter(l => bate(l.nome, l.whatsapp, l.numero_processo, l.email)).slice(0, 6).forEach(l => out.push({ g: 'Leads', rot: l.nome || l.whatsapp || 'Lead', sub: [STATUS_LEAD[l.status], l.numero_processo].filter(Boolean).join(' · '), ic: ICONES.leads, run: () => { location.hash = 'leads'; setTimeout(() => abrirFicha(l.id), 30); } }));
    S.calculos.filter(c => bate(c.numero_processo, c.reclamante, c.reclamada, cliente(c.cliente_id)?.nome)).slice(0, 6).forEach(c => out.push({ g: 'Cálculos', rot: c.numero_processo || 'Cálculo', sub: [cliente(c.cliente_id)?.nome, STATUS_CALC[c.status]].filter(Boolean).join(' · '), mono: true, ic: ICONES.calculos, run: () => editarCalculo(c) }));
    S.clientes.filter(c => bate(c.nome, c.whatsapp, c.email, c.oab)).slice(0, 5).forEach(c => out.push({ g: 'Clientes', rot: c.nome, sub: c.cidade || '', ic: ICONES.clientes, run: () => editarCliente(c) }));
    S.prospects.filter(p => bate(p.nome, p.escritorio, p.cidade, p.whatsapp, p.email)).slice(0, 5).forEach(p => out.push({ g: 'Prospecção', rot: p.nome, sub: [STATUS_PROSP[p.status], p.cidade].filter(Boolean).join(' · '), ic: ICONES.prospeccao, run: () => { location.hash = 'prospeccao'; setTimeout(() => abrirAbordagem(p.id), 30); } }));
  }
  return out.slice(0, 40);
}
function abrirPaleta() {
  if (PAL.aberta) return;
  PAL.aberta = true; PAL.q = ''; PAL.i = 0;
  const f = document.createElement('div'); f.className = 'paleta-fundo'; f.id = 'paleta';
  f.innerHTML = `<div class="paleta" role="dialog" aria-label="Busca rápida"><div class="paleta-in"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="palQ" placeholder="Buscar lead, cliente, nº do processo… ou digite uma ação" autocomplete="off"><kbd>Esc</kbd></div><div class="paleta-lista" id="palLista" role="listbox"></div>
    <div class="paleta-pe"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div></div>`;
  document.body.appendChild(f);
  f.addEventListener('mousedown', e => { if (e.target === f) fecharPaleta(); });
  const inp = $('#palQ');
  inp.addEventListener('input', () => { PAL.q = inp.value; PAL.i = 0; desenharPaleta(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); PAL.i = Math.min(PAL.itens.length - 1, PAL.i + 1); desenharPaleta(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); PAL.i = Math.max(0, PAL.i - 1); desenharPaleta(); }
    else if (e.key === 'Enter') { e.preventDefault(); executarPaleta(PAL.i); }
    else if (e.key === 'Escape') fecharPaleta();
  });
  desenharPaleta(); inp.focus();
}
function desenharPaleta() {
  PAL.itens = itensPaleta(PAL.q);
  let g = '';
  $('#palLista').innerHTML = PAL.itens.length ? PAL.itens.map((it, i) => {
    const cab = it.g !== g ? `<div class="paleta-g">${esc(it.g)}</div>` : ''; g = it.g;
    return `${cab}<div class="paleta-item ${i === PAL.i ? 'on' : ''}" role="option" data-pal="${i}"><span class="paleta-ic">${it.ic || ''}</span><span class="paleta-t"><b class="${it.mono ? 'mono' : ''}">${esc(it.rot)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span><span class="paleta-ent">↵</span></div>`;
  }).join('') : `<div class="vazio">Nada encontrado para "${esc(PAL.q)}". Tente o nome, o WhatsApp ou o número do processo.</div>`;
  $('#palLista').querySelectorAll('[data-pal]').forEach(el => { el.onclick = () => executarPaleta(Number(el.dataset.pal)); el.onmousemove = () => { if (PAL.i !== Number(el.dataset.pal)) { PAL.i = Number(el.dataset.pal); desenharPaleta(); } }; });
  $('#palLista .paleta-item.on')?.scrollIntoView({ block: 'nearest' });
}
function executarPaleta(i) { const it = PAL.itens[i]; if (!it) return; fecharPaleta(); it.run(); }
function fecharPaleta() { PAL.aberta = false; $('#paleta')?.remove(); }
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); PAL.aberta ? fecharPaleta() : abrirPaleta(); }
  else if (e.key === '/' && !PAL.aberta && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !document.querySelector('.modal-fundo')) { e.preventDefault(); abrirPaleta(); }
});

/* ---------------- shell, rotas e eventos ---------------- */
const ROTAS = { painel: ['Painel', telaPainel], mapa: ['Mapa do Brasil', telaMapa], leads: ['Leads · CRM', telaLeads], agenda: ['Agenda', telaAgenda], prospeccao: ['Prospecção', telaProspeccao], whatsapp: ['WhatsApp', telaWhatsapp], calculos: ['Cálculos', telaCalculos], clientes: ['Clientes', telaClientes], financeiro: ['Financeiro', telaFinanceiro], configuracoes: ['Configurações', telaConfiguracoes], trafego: ['Tráfego pago', telaTrafego] };
const rota = () => { const r = location.hash.slice(1); return ROTAS[r] && (r !== 'whatsapp' || WA_PAINEL()) ? r : 'painel'; };
const CAMPOS_FOCO = ['busca', 'buscaLeads', 'buscaWa', 'waTexto', 'buscaProsp'];

// caixa de mensagem do WhatsApp cresce até mostrar o texto inteiro (máx. metade da tela)
function ajustarCaixaWa() {
  const t = $('#waTexto'); if (!t) return;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight + 2, Math.round(innerHeight * 0.42)) + 'px';
  const box = $('#waMsgs'); if (box) box.scrollTop = box.scrollHeight;
}
function render() {
  const r = rota();
  const pendentes = S.leads.filter(l => semResposta(l) || retornoPendente(l)).length;
  const atras = S.calculos.filter(atrasado).length;
  const naoLidas = soma(S.wa_conversas, c => c.nao_lidas);
  const ae = document.activeElement, foco = ae && CAMPOS_FOCO.includes(ae.id) ? { id: ae.id, ini: ae.selectionStart, fim: ae.selectionEnd } : null;
  const msgsAntes = $('#waMsgs'), noFim = !msgsAntes || msgsAntes.scrollHeight - msgsAntes.scrollTop - msgsAntes.clientHeight < 60;
  const pill = n => n ? `<span class="pill">${n}</span>` : '';
  const sel = (S._ultimaRota !== r); S._ultimaRota = r;
  const contador = k => k === 'leads' ? pill(pendentes) : k === 'whatsapp' ? pill(naoLidas) : k === 'calculos' ? pill(atras) : k === 'prospeccao' ? pill(filaProsp().filter(p => p.tentativas > 0).length) : k === 'agenda' ? pill(itensAgenda().filter(i => i.dia < hoje()).length) : '';
  const itemNav = k => `<a href="#${k}" class="${k === r ? 'on' : ''}" ${k === r ? 'aria-current="page"' : ''}>${ICONES[k] || ''}<span class="rot">${ROTAS[k][0]}</span>${contador(k)}</a>`;
  const grupos = GRUPOS_NAV.map(([g, ks]) => { const vis = ks.filter(k => ROTAS[k] && (k !== 'whatsapp' || WA_PAINEL())); return vis.length ? `<div class="grupo">${g}</div>${vis.map(itemNav).join('')}` : ''; }).join('');
  $('#raiz').innerHTML = `<div class="app"><nav>
    <div class="marca"><img src="/img/marca.svg" alt="" width="40" height="40"><div><b>Pontes Ferreira</b><small>Cálculos</small></div></div>
    <button class="busca-btn" data-acao="paleta"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>Buscar ou fazer…<kbd>Ctrl K</kbd></button>
    <div class="itens">${grupos}</div>
    <div class="rodape">${DEMO ? '<span class="ponto demo-p"></span>Modo demonstração' : `<span class="ponto"></span>Conectado<div><button data-acao="trocarSenha">Trocar senha</button> · <button data-acao="sair">Sair</button></div>`}</div></nav>
    <main class="${r === 'whatsapp' ? 'main-wa' : ''} ${sel ? 'entra' : ''}">${DEMO ? `<div class="demo"><span><b>Modo demonstração:</b> dados de exemplo, salvos só neste navegador. Conecte o Supabase em <code>config.js</code> para usar de verdade.</span><button class="btn mini sec" data-acao="limparDemo">Limpar exemplos</button></div>` : ''}
    ${ROTAS[r][1]()}</main></div>`;
  document.title = `${(naoLidas + pendentes) ? `(${naoLidas + pendentes}) ` : ''}${ROTAS[r][0]} · Pontes Ferreira`;
  if (foco) { const el = document.getElementById(foco.id); if (el && !el.disabled) { el.focus(); try { el.setSelectionRange(foco.ini, foco.fim); } catch { } } }
  ajustarCaixaWa();
  const box = $('#waMsgs'); if (box && noFim) box.scrollTop = box.scrollHeight;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-aba-prosp],[data-pag-prosp],[data-cidade-prosp],[data-filtro-wa],[data-cadastro],[data-cadastro-ok],[data-excluir-lead],[data-portal],[data-entregas],[data-aba-fin],[data-filtro-agenda],[data-aba-config],[data-filtro-monitor],[data-conv-monitor],[data-acao-monitor],[data-wa-abrir],[data-wa-prosp],[data-mail-prosp],[data-uf-mapa],[data-metrica-mapa],[data-prospectar-uf],[data-prosp],[data-abordar],[data-robo-assumir],[data-robo-devolver],[data-copiar],[data-aba-trafego],[data-feito],[data-acao],[data-calc],[data-lead],[data-converter],[data-pdf],[data-pagar],[data-cliente],[data-despesa],[data-ficha],[data-fechar-ficha],[data-prox],[data-adiar],[data-vista],[data-wa-lead],[data-conv],[data-usar-pdf]');
  if (!t) return;
  const d = t.dataset;
  if (d.filtroWa) { S.filtroWa = d.filtroWa; return render(); }
  if (d.cadastro) return preencherCadastro(d.cadastro);
  if (d.cadastroOk) { S.cadastroDispensado = { ...(S.cadastroDispensado || {}), [d.cadastroOk]: true }; return render(); }
  if (d.excluirLead) { e.stopPropagation(); return excluirLead(d.excluirLead); }
  if (d.portal) { e.stopPropagation(); return abrirPortal(d.portal); }
  if (d.entregas) { e.stopPropagation(); return abrirEntregas(d.entregas); }
  if (d.abaFin) { S.abaFin = d.abaFin; return render(); }
  if (d.filtroAgenda) { S.filtroAgenda = d.filtroAgenda; return render(); }
  if (d.abaConfig) { S.abaConfig = d.abaConfig; return render(); }
  if (d.filtroMonitor) { S.filtroMonitor = d.filtroMonitor; return render(); }
  if (d.convMonitor) return abrirConversa(d.convMonitor);
  if (d.acaoMonitor) return executarAcaoMonitor(d.acaoMonitor, d.wa);
  if (d.waAbrir) { e.stopPropagation(); return abrirNoPainel(d.waAbrir, d.waNome, d.waTxt, { lead_id: d.waLeadId, cliente_id: d.waClienteId }); }
  if (d.waProsp) return enviarDiretoProsp(d.waProsp, 'wa');
  if (d.mailProsp) return enviarDiretoProsp(d.mailProsp, 'email');
  if (d.ufMapa !== undefined) { S.ufMapa = d.ufMapa || null; if (rota() !== 'mapa') location.hash = 'mapa'; return render(); }
  if (d.metricaMapa) { S.metricaMapa = d.metricaMapa; localSet('pf_metrica_mapa', d.metricaMapa); return render(); }
  if (d.prospectarUf) return prospectarUF(d.prospectarUf);
  if (d.abaProsp) { S.filtroProsp.aba = d.abaProsp; S.filtroProsp.pag = 1; S.filtroProsp.ordem = ''; return render(); }
  if (d.pagProsp) { S.filtroProsp.pag = Number(d.pagProsp); render(); return document.querySelector('#buscaProsp')?.closest('.card')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  if (d.cidadeProsp) { S.buscaProsp.cidade = d.cidadeProsp; return buscarAuto(false); }
  if (d.prosp) return editarProsp(S.prospects.find(x => x.id === d.prosp));
  if (d.abordar) return abrirAbordagem(d.abordar);
  if (d.roboAssumir) return roboAssumir(d.roboAssumir, true);
  if (d.roboDevolver) return roboAssumir(d.roboDevolver, false);
  if (d.copiar !== undefined) return copiarTexto(COPIAS[Number(d.copiar)]);
  if (d.abaTrafego) { e.preventDefault(); S.abaTrafego = d.abaTrafego; localSet('pf_aba_trafego', d.abaTrafego); if (location.hash !== '#trafego') location.hash = 'trafego'; return render(); }
  if (d.feito) return;
  if (d.pdf) { e.stopPropagation(); return abrirPdf(d.pdf); }
  if (d.pagar) { e.stopPropagation(); return seguro(async () => { await atualizar('calculos', d.pagar, { pago: true, data_pagamento: hoje() }); toast('Pagamento registrado'); render(); }); }
  if (d.fecharFicha !== undefined) return fecharFicha();
  if (d.ficha) return abrirFicha(d.ficha);
  if (d.vista) { S.vistaLeads = d.vista; localSet('pf_vista', d.vista); return render(); }
  if (d.waLead) return seguro(() => conversaParaLead(S.leads.find(x => x.id === d.waLead)));
  if (d.conv) return abrirConversa(d.conv);
  if (d.usarPdf) { const l = leadDaConversa(convAtiva()); return l && seguro(async () => { await atualizar('leads', l.id, { arquivo_path: d.usarPdf }); toast('PDF vinculado ao lead'); render(); }); }
  if (d.prox !== undefined) { const n = Number(d.prox); return atualizarLeadFicha({ proximo_contato: n ? somaDias(hoje(), n) : null }, n ? `Próximo contato agendado para ${dataBR(somaDias(hoje(), n))}` : null); }
  if (d.adiar) { const n = Number(d.dias); return seguro(async () => { await atualizar('leads', d.adiar, { proximo_contato: somaDias(hoje(), n) }); await registrar(d.adiar, 'status', `Retorno adiado para ${dataBR(somaDias(hoje(), n))}`); render(); }); }
  if (d.calc) return editarCalculo(S.calculos.find(x => x.id === d.calc));
  if (d.lead) return editarLead(S.leads.find(x => x.id === d.lead)).then(() => fichaId && renderFicha());
  if (d.converter) { fecharFicha(); return leadParaCalculo(S.leads.find(x => x.id === d.converter)); }
  if (d.cliente) return editarCliente(S.clientes.find(x => x.id === d.cliente));
  if (d.despesa) return editarDespesa(S.despesas.find(x => x.id === d.despesa));
  ({
    novoLead: () => editarLead(null), novoCalculo: () => editarCalculo(null), novoCliente: () => editarCliente(null),
    novaDespesa: () => editarDespesa(null), buscarAuto: () => buscarAuto(false), limparFiltroProsp: () => { S.filtroProsp = { status: '', q: '', aba: S.filtroProsp.aba, ordem: S.filtroProsp.ordem || '' }; render(); }, buscarMais: () => buscarAuto(true), addAchados,
    selCelulares: () => { const A = S.achados; if (A) { A.sel = new Set(A.lugares.filter(l => !l.ja && tipoTel(l.telefone) === 'celular').map(l => l.id)); render(); } },
    selNenhum: () => { if (S.achados) { S.achados.sel = new Set(); render(); } }, importarPJC, limparDemo, novaConversa,
    novoGasto: () => novoGasto(), importarGads, gadsLancarGasto, novoProsp: () => editarProsp(null), definirMeta, emailTesteDiario: () => testarEmail('diario'), emailTesteSemanal: () => testarEmail('semanal'), atualizarMonitor: () => carregarMensagensMonitor(true), configMonitor, outraVersao: () => S.ultRapida && preencherRapida(S.ultRapida.i), configRespostas, waConectar: () => conectarWhatsapp('qr'), waStatus: () => atualizarEstadoWa(false), waDesconectar: () => confirm('Desconectar o WhatsApp do painel? O celular continua funcionando normalmente.') && seguro(async () => { await chamarConexao('desconectar'); S.waEstado = 'close'; render(); }), paleta: abrirPaleta, atualizarMapa: () => carregarMapa(true), colarProsp, exportProsp, configProsp, proximoProsp: () => proximoDaFila(null), configurarRobo, testarRobo: () => { SIM.etapa = null; SIM.msgs = []; SIM.fora = undefined; renderSimulador(); }, salvarRast, salvarMetas, exportGoogle, exportMeta, copiarUtm: () => copiarTexto(urlUtm()), trocarSenha: () => trocarSenha(false),
    waEnviar: waEnviarTexto, waAnexar,
    waModelo: () => seguro(() => waEnviar({ template: CFG.WA_TEMPLATE || 'retomar_contato', idioma: CFG.WA_TEMPLATE_IDIOMA || 'pt_BR' })),
    addAtividade: () => seguro(async () => {
      const txt = $('#ativTexto').value.trim(); if (!txt) return toast('Escreva o que aconteceu');
      const l = S.leads.find(x => x.id === fichaId);
      await registrar(l.id, $('#ativTipo').value, txt, l.cliente_id || null);
      await atualizar('leads', l.id, { ultimo_contato: new Date().toISOString(), ...(l.respondido_em ? {} : { respondido_em: new Date().toISOString() }) });
      render(); renderFicha();
    }),
    sair: async () => { await sb.auth.signOut(); location.reload(); }
  })[d.acao]?.();
});
document.addEventListener('change', e => {
  const id = e.target.id;
  if (e.target.dataset.feito) { const k = e.target.dataset.feito; return seguro(async () => { await salvarTrafego({ feito: { ...(traf().feito || {}), [k]: e.target.checked } }); render(); }); }
  if (e.target.dataset && e.target.dataset.achado && S.achados) { const sel = S.achados.sel; e.target.checked ? sel.add(e.target.dataset.achado) : sel.delete(e.target.dataset.achado); return render(); }
  if (e.target.dataset && e.target.dataset.monRegra) return alternarRegraMon(e.target.dataset.monRegra, e.target.checked);
  if (id === 'monEmail') return seguro(async () => { const novo = { ...cfgMonAds(), email: e.target.checked }; await ajustesDb.salvar('monitor_ads', novo); S.ajustes.monitor_ads = novo; toast(novo.email ? 'Avisos por e-mail ligados' : 'Avisos por e-mail desligados'); });
  if (id === 'rastAtivo') return seguro(async () => { const r = { ...rast(), ativo: e.target.checked }; await ajustesDb.salvar('rastreamento', r); S.ajustes.rastreamento = r; toast(r.ativo ? 'Rastreamento LIGADO no site' : 'Rastreamento desligado'); render(); });
  if (e.target.dataset.utm && e.target.tagName === 'SELECT') { S.utm[e.target.dataset.utm] = e.target.value; return render(); }
  if (e.target.dataset.trafDireto) return seguro(() => salvarTrafego({ [e.target.dataset.trafDireto]: e.target.value.trim() || null }));
  if (e.target.dataset.emailTipo) return alternarEmail(e.target.dataset.emailTipo, e.target.checked);
  if (id === 'fProsp') { S.filtroProsp.status = e.target.value; S.filtroProsp.pag = 1; return render(); }
  if (e.target.dataset && e.target.dataset.filtroProsp) { S.filtroProsp[e.target.dataset.filtroProsp] = e.target.value; S.filtroProsp.pag = 1; return render(); }
  if (e.target.dataset.buscaProsp) { const k = e.target.dataset.buscaProsp; if (S.buscaProsp[k] === e.target.value) return; S.buscaProsp[k] = e.target.value; return render(); } // o input já guardou: não redesenha à toa
  if (id === 'periodo') { S.periodo = e.target.value; localSet('pf_periodo', S.periodo); render(); }
  if (id === 'filtroCalc') { S.filtroCalc = e.target.value; render(); }
  if (id === 'fStatus') { S.filtroLeads.status = e.target.value; render(); }
  if (id === 'fCanal') { S.filtroLeads.canal = e.target.value; render(); }
  if (id === 'fTemp') { S.filtroLeads.temp = e.target.value; render(); }
  if (id === 'waRapida' && e.target.value !== '') preencherRapida(Number(e.target.value));
  if (id === 'fichaTemp') atualizarLeadFicha({ temperatura: e.target.value || null }, e.target.value ? `Temperatura: ${TEMPERATURAS[e.target.value]}` : null);
  if (id === 'fichaProx') atualizarLeadFicha({ proximo_contato: e.target.value || null }, e.target.value ? `Próximo contato agendado para ${dataBR(e.target.value)}` : null);
  if (id === 'fichaStatus') { const l = S.leads.find(x => x.id === fichaId); moverLead(l, e.target.value).then(renderFicha); }
  if (e.target.dataset.mover) { const l = S.leads.find(x => x.id === e.target.dataset.mover); moverLead(l, e.target.value); }
});
document.addEventListener('input', e => {
  const id = e.target.id;
  if (e.target.dataset.rast) S.rascRast[e.target.dataset.rast] = e.target.value;
  if (e.target.dataset.utm && e.target.tagName === 'INPUT') { S.utm[e.target.dataset.utm] = e.target.value; const u = urlUtm(); $('#utmUrl').textContent = u; $('#utmAbrir').href = u; }
  if (id === 'buscaProsp') { S.filtroProsp.q = e.target.value; S.filtroProsp.pag = 1; render(); }
  if (e.target.dataset.buscaProsp) S.buscaProsp[e.target.dataset.buscaProsp] = e.target.value;
  if (id === 'busca') { S.busca = e.target.value; render(); }
  if (id === 'buscaLeads') { S.filtroLeads.q = e.target.value; render(); }
  if (id === 'buscaWa') { S.buscaWa = e.target.value; render(); }
  if (id === 'waTexto' && S.conversa) { S.rascunhos[S.conversa] = e.target.value; ajustarCaixaWa(); }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'waTexto' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); waEnviarTexto(); }
  if (e.target.dataset && e.target.dataset.buscaProsp && e.key === 'Enter') { e.preventDefault(); S.buscaProsp[e.target.dataset.buscaProsp] = e.target.value; setTimeout(() => buscarAuto(false)); }
  if (e.key === 'Escape' && fichaId) fecharFicha();
  if (e.key === 'Escape' && $('#abordagem') && !PAL.aberta) fecharAbordagem();
  else if (e.key === 'Escape' && !PAL.aberta && !fichaId) { const m = [...document.querySelectorAll('.modal-fundo')].pop(); if (m && m.id !== 'qrWa') { m.remove(); if (m.id === 'entregas') render(); } }
});
window.addEventListener('hashchange', render);
/* funil: arrastar os cards entre as colunas */
let arrastandoLead = null;
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-arrastar]'); if (!c) return; arrastandoLead = c.dataset.arrastar; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', arrastandoLead); c.classList.add('arrastando'); document.body.classList.add('arrastando-lead'); });
document.addEventListener('dragend', () => { arrastandoLead = null; document.body.classList.remove('arrastando-lead'); document.querySelectorAll('.arrastando,.col.alvo').forEach(x => x.classList.remove('arrastando', 'alvo')); });
document.addEventListener('dragover', e => { const col = arrastandoLead && e.target.closest?.('[data-coluna]'); if (!col) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.col.alvo').forEach(x => x !== col && x.classList.remove('alvo')); col.classList.add('alvo'); });
document.addEventListener('drop', e => {
  const col = arrastandoLead && e.target.closest?.('[data-coluna]'); if (!col) return; e.preventDefault();
  const l = S.leads.find(x => x.id === arrastandoLead), novo = col.dataset.coluna;
  arrastandoLead = null; document.body.classList.remove('arrastando-lead');
  if (l && l.status !== novo) moverLead(l, novo);
});
setInterval(() => { if (EVOLUTION() && !document.hidden) atualizarEstadoWa(true); }, 120000);
setInterval(() => { if (!arrastandoLead && !document.querySelector('.modal-fundo') && !CAMPOS_FOCO.includes(document.activeElement?.id) && !document.activeElement?.closest?.('.form-trafego')) render(); }, 60000);

/* ---------------- tempo real: lead novo e mensagens do WhatsApp ---------------- */
function avisar(titulo, corpo) {
  toast(`🔔 ${titulo}: ${corpo}`);
  try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=').play().catch(() => { }); } catch { }
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(`${titulo} · Pontes Ferreira`, { body: corpo });
}
const upsert = (arr, row, chave = 'id') => { const i = arr.findIndex(x => x[chave] === row[chave]); if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.unshift(row); };
function tempoReal() {
  if (DEMO) return;
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  sb.channel('painel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, p => {
      if (p.eventType === 'INSERT' && !S.leads.some(l => l.id === p.new.id)) { S.leads.unshift(p.new); avisar('Novo lead', `${p.new.nome || ''} · ${p.new.tipo || p.new.origem || ''}`); }
      else if (p.eventType === 'UPDATE') upsert(S.leads, p.new);
      else if (p.eventType === 'DELETE' && p.old?.id) S.leads = S.leads.filter(l => l.id !== p.old.id); // excluído em outra aba/aparelho
      if (!document.querySelector('.modal-fundo:not(#ficha)')) render();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversas' }, p => {
      if (p.eventType === 'DELETE') return;
      upsert(S.wa_conversas, p.new);
      if (p.new.wa_id === S.conversa && p.new.nao_lidas && rota() === 'whatsapp' && !document.hidden) atualizar('wa_conversas', p.new.id, { nao_lidas: 0 }).catch(() => { });
      if (!document.querySelector('.modal-fundo')) render();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_mensagens' }, p => {
      const m = p.new, lista = S.wa_mensagens[m.wa_id];
      if (lista) { const i = lista.findIndex(x => x.id === m.id); if (i >= 0) lista[i] = m; else lista.push(m); }
      if (S.monitor && p.eventType === 'INSERT') S.monitor.msgs.push(m);
      if (p.eventType === 'INSERT' && m.direcao === 'in' && !(m.wa_id === S.conversa && rota() === 'whatsapp' && !document.hidden)) {
        const c = S.wa_conversas.find(x => x.wa_id === m.wa_id);
        avisar(`WhatsApp de ${c?.nome || fmtTel(m.wa_id)}`, m.texto || `📎 ${m.arquivo_nome || 'arquivo'}`);
      }
      if (!document.querySelector('.modal-fundo')) render();
    })
    .subscribe();
}

/* ---------------- login e início ---------------- */
function telaLogin(erro = '') {
  $('#raiz').innerHTML = `<div class="login"><form id="login"><div class="login-marca"><img src="/img/marca.svg" alt="" width="72" height="72"><b>Pontes Ferreira</b><small>Cálculos</small></div><p style="color:var(--ink-2);margin-bottom:6px;text-align:center">Painel de gestão</p>
    <input type="email" id="email" placeholder="E-mail" required autocomplete="username"><input type="password" id="senha" placeholder="Senha" required autocomplete="current-password">
    ${erro ? `<p style="color:var(--crit);font-size:13px">${esc(erro)}</p>` : ''}<button class="btn">Entrar</button></form></div>`;
  $('#login').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $('#email').value, password: $('#senha').value });
    if (error) return telaLogin('E-mail ou senha incorretos.');
    iniciar();
  };
}
function trocarSenha(obrigatoria) {
  if (DEMO) return toast('A troca de senha funciona depois de ligar o Supabase.');
  const fundo = document.createElement('div'); fundo.className = obrigatoria ? 'login' : 'modal-fundo';
  fundo.innerHTML = `<form class="${obrigatoria ? '' : 'modal'}" id="formSenha" style="${obrigatoria ? '' : 'max-width:420px'}"><h2>${obrigatoria ? 'Crie sua senha' : 'Trocar senha'}</h2>
    <p style="color:var(--ink-2);margin:4px 0 8px">${obrigatoria ? 'Primeiro acesso: troque a senha temporária por uma só sua.' : 'Mínimo de 10 caracteres.'}</p>
    <input type="password" id="senha1" placeholder="Nova senha (mín. 10 caracteres)" required minlength="10" autocomplete="new-password" style="width:100%;margin-bottom:8px">
    <input type="password" id="senha2" placeholder="Repita a nova senha" required minlength="10" autocomplete="new-password" style="width:100%;margin-bottom:8px">
    <p id="erroSenha" style="color:var(--crit);font-size:13px"></p>
    <div class="linha" style="justify-content:flex-end">${obrigatoria ? '' : '<button type="button" class="btn sec" id="cancSenha">Cancelar</button>'}<button class="btn">Salvar senha</button></div></form>`;
  if (obrigatoria) $('#raiz').replaceChildren(fundo); else document.body.appendChild(fundo);
  $('#cancSenha')?.addEventListener('click', () => fundo.remove());
  $('#formSenha').onsubmit = async e => {
    e.preventDefault();
    const a = $('#senha1').value, b = $('#senha2').value;
    if (a.length < 10) return $('#erroSenha').textContent = 'Use pelo menos 10 caracteres.';
    if (a !== b) return $('#erroSenha').textContent = 'As duas senhas não são iguais.';
    const { error } = await sb.auth.updateUser({ password: a, data: { senha_definida: true } });
    if (error) return $('#erroSenha').textContent = /different|same/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.' : 'Não foi possível salvar: ' + error.message;
    toast('Senha alterada');
    if (obrigatoria) iniciar(); else fundo.remove();
  };
  setTimeout(() => $('#senha1')?.focus(), 30);
}
async function iniciar() {
  try {
    if (DEMO) semearDemo();
    else {
      const { data } = await sb.auth.getSession();
      if (!data.session) return telaLogin();
      if (!data.session.user?.user_metadata?.senha_definida) return trocarSenha(true);
    }
    await carregar();
    render();
    tempoReal();
    atualizarEstadoWa(true);
  } catch (e) {
    console.error(e);
    $('#raiz').innerHTML = `<div style="padding:30px"><h2>Não foi possível carregar</h2><p>${esc(e.message || e)}</p><p>Confira o <code>config.js</code> e se o <code>schema.sql</code> foi executado no Supabase.</p></div>`;
  }
}
iniciar();
