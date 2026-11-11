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
const CANAIS = ['Google Ads', 'Meta Ads', 'Site orgânico', 'Indicação', 'WhatsApp direto', 'Instagram orgânico', 'Outros'];
const CANAIS_DESPESA = ['Google Ads', 'Meta Ads', 'Outros anúncios', 'Software', 'Outros'];
const CANAIS_ADS = ['Google Ads', 'Meta Ads', 'Outros anúncios'];
const PERIODOS = { mes: 'Este mês', '30': 'Últimos 30 dias', '90': 'Últimos 90 dias', ano: 'Este ano', tudo: 'Tudo' };
const MIN_RESPOSTA = 15; // minutos para responder um lead novo

const TABELAS = ['leads', 'calculos', 'clientes', 'despesas', 'atividades', 'wa_conversas'];
const S = {
  leads: [], calculos: [], clientes: [], despesas: [], atividades: [], wa_conversas: [], wa_mensagens: {},
  periodo: localGet('pf_periodo') || 'mes', filtroCalc: 'abertos', busca: '',
  vistaLeads: localGet('pf_vista') || 'funil', filtroLeads: { status: '', canal: '', temp: '', q: '' },
  conversa: null, buscaWa: ''
};
const TEMPERATURAS = { quente: '🔥 Quente', morno: '🌤 Morno', frio: '❄ Frio' };
const TIPOS_ATIV = { nota: '📝 Nota', ligacao: '📞 Ligação', whatsapp: '💬 WhatsApp', email: '✉ E-mail', reuniao: '🤝 Reunião', status: '🔄 Status' };
const RESPOSTAS_RAPIDAS = [
  ['Saudação', 'Olá, {nome}! Aqui é da Pontes Ferreira Cálculos Judiciais. Recebemos seu pedido e já vamos analisar. 😊'],
  ['Pedir PDF', 'Para orçarmos, pode nos enviar o PDF integral do processo (baixado do PJe)? Se preferir, basta o número do processo que puxamos os autos.'],
  ['Orçamento', 'Analisamos o processo: o cálculo fica em R$ {valor}, com entrega em até 48h. Você recebe o arquivo .PJC, o relatório em PDF e o resumo do que foi deferido. Podemos seguir?'],
  ['Vários autores', 'Como o processo tem mais de um autor, o valor é calculado por reclamante. Te passo o orçamento fechado em instantes.'],
  ['Confirmação', 'Perfeito! Já iniciamos o cálculo. Entregamos até {prazo}.'],
  ['Entrega', 'Cálculo pronto! Segue o relatório em PDF e o arquivo .PJC. Qualquer ajuste, é só chamar.'],
  ['Cobrança', 'Olá, {nome}! Passando para lembrar do pagamento do cálculo, no valor de R$ {valor}. Obrigado!'],
  ['Follow-up', 'Olá, {nome}! Conseguiu ver o orçamento? Se o prazo estiver curto, conseguimos priorizar.']
];

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
const waLink = (num, txt = '') => { let d = digitos(num); if (d.length <= 11) d = '55' + d; return `https://wa.me/${d}${txt ? '?text=' + encodeURIComponent(txt) : ''}`; };
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
    const { data, error } = await sb.from(t).select('*').order('created_at', { ascending: false }).limit(10000);
    if (error) throw error; return data;
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
    const { data, error } = await sb.from(t).select('*').eq(col, val).order('created_at', { ascending: true }).limit(2000);
    if (error) throw error; return data;
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

async function criar(t, row) { const r = await db.insert(t, row); S[t].unshift(r); return r; }
async function atualizar(t, id, patch) { const r = await db.update(t, id, patch); S[t] = S[t].map(x => x.id === id ? r : x); return r; }
async function apagar(t, id) { await db.remove(t, id); S[t] = S[t].filter(x => x.id !== id); }
async function seguro(fn) { try { return await fn(); } catch (e) { console.error(e); toast('Erro: ' + (e.message || e)); } }

async function carregar() {
  const dados = await Promise.all(TABELAS.map(t => db.list(t).catch(e => { console.warn(t, e); return []; })));
  TABELAS.forEach((t, i) => S[t] = dados[i]);
}

/* ---------------- dados de demonstração ---------------- */
function semearDemo() {
  if (localGet('pf_semeado') === '2') return;
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
      valor_orcado: 150 + Math.floor(rnd() * 4) * 50, respondido_em: status === 'novo' ? null : new Date(d.getTime() + (5 + rnd() * 90) * 6e4).toISOString(),
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
        valor_cobrado: autores > 1 ? 150 * autores * .8 : l.valor_orcado, valor_apurado: Math.round(15000 + rnd() * 120000),
        pago: entregue && rnd() < .8, data_pagamento: null
      });
      const c2 = calculos[calculos.length - 1]; if (c2.pago) c2.data_pagamento = somaDias(c2.data_entrega, Math.floor(rnd() * 6));
    }
  }
  for (let m = 0; m < 6; m++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - m, 5);
    despesas.push({ id: uid(), created_at: d.toISOString(), data: isoLocal(d), canal: 'Google Ads', descricao: 'Campanha Pesquisa', valor: 450 + Math.round(rnd() * 150) });
    despesas.push({ id: uid(), created_at: d.toISOString(), data: isoLocal(d), canal: 'Meta Ads', descricao: 'Reels + remarketing', valor: 200 + Math.round(rnd() * 80) });
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
  L.set('atividades', ord(atividades)); L.set('wa_conversas', ord(wa_conversas)); L.set('wa_mensagens', wa_mensagens);
  localSet('pf_semeado', '2');
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
  { k: 'valor_cobrado', rot: 'Valor cobrado (R$)', tipo: 'number', padrao: 150 },
  { k: 'valor_apurado', rot: 'Valor apurado no cálculo (R$)', tipo: 'number' },
  { k: 'pago', rot: 'Pago', tipo: 'checkbox' }, { k: 'data_pagamento', rot: 'Pago em', tipo: 'date' },
  { k: 'obs', rot: 'Observações', tipo: 'textarea', full: true }
];
const camposDespesa = () => [
  { k: 'data', rot: 'Data', tipo: 'date', padrao: hoje(), req: true },
  { k: 'canal', rot: 'Categoria', tipo: 'select', opcoes: CANAIS_DESPESA, req: true, vazio: false },
  { k: 'valor', rot: 'Valor (R$)', tipo: 'number', req: true },
  { k: 'descricao', rot: 'Descrição' }
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
    const v = prompt('Valor orçado (R$):', '150');
    if (v) patch.valor_orcado = Number(v.replace(',', '.')) || null;
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
    numero_processo: l.numero_processo, tipo: l.tipo, valor_cobrado: l.valor_orcado || 150,
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
      if (!porProc[m[1]] || porProc[m[1]].chave < chave) porProc[m[1]] = { data, chave, calc: m[2] };
    });
    let entregues = 0, novos = 0, jaEstavam = 0;
    for (const [proc, info] of Object.entries(porProc)) {
      const doProc = S.calculos.filter(c => digitos(c.numero_processo) === proc);
      const aberto = doProc.find(c => c.status !== 'entregue');
      if (aberto) { await atualizar('calculos', aberto.id, { status: 'entregue', data_entrega: info.data }); entregues++; }
      else if (doProc.length) jaEstavam++;
      else { await criar('calculos', { numero_processo: cnj(proc), status: 'entregue', data_entrada: info.data, data_entrega: info.data, prazo_entrega: info.data, autores: 1, complexidade: 'simples', valor_cobrado: null, pago: false, obs: `Importado do PJe-Calc (cálculo nº ${info.calc}). Defina cliente e valor.` }); novos++; }
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
    return `<div class="lead ${urg ? 'urgente' : ''}">
      <b class="link" data-ficha="${l.id}">${esc(l.nome || 'Sem nome')}</b>
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
  return topo + `<div class="kanban">${cols.map(s => { const ls = visiveis.filter(l => l.status === s); return `<div class="col"><h3><span>${STATUS_LEAD[s]}</span><span>${ls.length} · ${brl0(soma(ls, l => l.valor_orcado))}</span></h3>${ls.map(card).join('') || '<div class="vazio">—</div>'}</div>`; }).join('')}</div>
  <p class="desc" style="margin-top:10px;color:var(--muted);font-size:12px">Clique no nome para abrir a ficha completa. Fechados e perdidos dos últimos 60 dias.</p>`;
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
const janelaAberta = c => c && c.ultima_entrada_em && (Date.now() - new Date(c.ultima_entrada_em).getTime()) < 24 * 36e5;
const convAtiva = () => S.wa_conversas.find(c => c.wa_id === S.conversa);
const leadDaConversa = c => c && (S.leads.find(l => l.id === c.lead_id) || S.leads.find(l => l.whatsapp && digitos(l.whatsapp).slice(-9) === digitos(c.wa_id).slice(-9)));
S.rascunhos = {};
const hora = ts => new Date(ts).toTimeString().slice(0, 5);
const quandoCurto = ts => { if (!ts) return ''; const d = dia(ts); return d === hoje() ? hora(ts) : d === somaDias(hoje(), -1) ? 'ontem' : dataBR(ts).slice(0, 5); };
const ticks = m => m.direcao !== 'out' ? '' : ({ sent: '✓', delivered: '✓✓', read: '<span style="color:#34b7f1">✓✓</span>', failed: `<span style="color:var(--crit)" title="${esc(m.erro || '')}">⚠ falhou</span>` }[m.status] || '🕓');

function telaWhatsapp() {
  const q = S.buscaWa.toLowerCase();
  const convs = [...S.wa_conversas].filter(c => !q || [c.nome, c.wa_id, c.ultima_msg].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.ultima_msg_em || b.created_at).localeCompare(a.ultima_msg_em || a.created_at));
  const c = convAtiva(), l = leadDaConversa(c);
  const msgs = c ? (S.wa_mensagens[c.wa_id] || null) : null;
  let corpo = '<div class="wa-vazio">Escolha uma conversa à esquerda</div>';
  if (c) {
    let ultDia = '';
    const bolhas = msgs === null ? '<div class="vazio">Carregando…</div>' : msgs.length ? msgs.map(m => {
      const d = dia(m.created_at), sep = d !== ultDia ? `<div class="wa-dia">${d === hoje() ? 'Hoje' : dataBR(d)}</div>` : ''; ultDia = d;
      const arq = m.arquivo_nome ? `<div class="wa-arq">📎 ${esc(m.arquivo_nome)} ${m.arquivo_path ? `<button class="btn mini sec" data-pdf="${esc(m.arquivo_path)}">Abrir</button>` : ''}${m.arquivo_path && m.direcao === 'in' && l ? `<button class="btn mini sec" data-usar-pdf="${esc(m.arquivo_path)}" title="Definir como PDF do processo do lead">Usar no lead</button>` : ''}</div>` : '';
      return `${sep}<div class="wa-msg ${m.direcao}">${arq}${m.texto ? `<div>${esc(m.texto).replace(/\n/g, '<br>')}</div>` : ''}<span class="wa-hora">${hora(m.created_at)} ${ticks(m)}</span></div>`;
    }).join('') : '<div class="vazio">Nenhuma mensagem ainda</div>';
    const aberta = janelaAberta(c);
    const fimJanela = aberta ? new Date(new Date(c.ultima_entrada_em).getTime() + 24 * 36e5) : null;
    corpo = `<div class="wa-cab"><div><b>${esc(c.nome || fmtTel(c.wa_id))}</b><div class="desc" style="margin:0">${fmtTel(c.wa_id)}${l ? ` · ${esc(STATUS_LEAD[l.status])}` : ''}</div></div>
        <div class="linha">${l ? `<button class="btn mini sec" data-ficha="${l.id}">Ficha do lead</button>` : ''}${l && l.status !== 'fechado' ? `<button class="btn mini" data-converter="${l.id}">→ Cálculo</button>` : ''}<a class="btn mini sec" target="_blank" href="${waLink(c.wa_id)}">Abrir no app ↗</a></div></div>
      <div class="wa-janela ${aberta ? 'ok' : 'fechada'}">${aberta ? `✔ Conversa aberta: pode responder livremente até ${fimJanela.toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR') ? 'hoje' : 'amanhã'} às ${hora(fimJanela)}.`
        : `⏸ O cliente não escreve há mais de 24h. Pela regra do WhatsApp, só dá para enviar um <b>modelo aprovado</b> para retomar a conversa. <button class="btn mini" data-acao="waModelo">Enviar modelo "${esc(CFG.WA_TEMPLATE || 'retomar_contato')}"</button>`}</div>
      <div class="wa-msgs" id="waMsgs">${bolhas}</div>
      <div class="wa-compor">
        <select class="f" id="waRapida"><option value="">⚡ Respostas rápidas</option>${RESPOSTAS_RAPIDAS.map(([r], i) => `<option value="${i}">${r}</option>`).join('')}</select>
        <textarea id="waTexto" rows="2" placeholder="${aberta ? 'Digite a mensagem… (Enter envia, Shift+Enter quebra linha)' : 'Fora da janela de 24h: envie o modelo acima'}" ${aberta ? '' : 'disabled'}>${esc(S.rascunhos[c.wa_id] || '')}</textarea>
        <button class="btn sec" data-acao="waAnexar" title="Enviar arquivo (relatório PDF, .PJC…)" ${aberta ? '' : 'disabled'}>📎</button>
        <button class="btn" data-acao="waEnviar" ${aberta ? '' : 'disabled'}>Enviar</button>
      </div>`;
  }
  return `<div class="topo"><h1>WhatsApp</h1><div class="acoes"><button class="btn" data-acao="novaConversa">+ Nova conversa</button></div></div>
  ${DEMO ? '' : (CFG.WA_ATIVO ? '' : '<div class="demo">O WhatsApp ainda não está conectado à API oficial. Veja o passo 5 do <b>COMO_ATIVAR.md</b>. Até lá, use o botão "Abrir no app ↗".</div>')}
  <div class="wa">
    <div class="wa-lista"><input class="f" id="buscaWa" placeholder="Buscar conversa…" value="${esc(S.buscaWa)}">
      ${convs.length ? convs.map(x => { const lx = leadDaConversa(x); return `<div class="wa-item ${x.wa_id === S.conversa ? 'on' : ''}" data-conv="${x.wa_id}">
        <div class="wa-l1"><b>${esc(x.nome || fmtTel(x.wa_id))}</b><span>${quandoCurto(x.ultima_msg_em)}</span></div>
        <div class="wa-l2"><span>${esc((x.ultima_msg || '').slice(0, 60))}</span>${x.nao_lidas ? `<i>${x.nao_lidas}</i>` : ''}</div>
        ${lx ? `<div class="wa-l3">${esc(STATUS_LEAD[lx.status])} ${lx.temperatura ? '· ' + TEMPERATURAS[lx.temperatura] : ''}</div>` : ''}</div>`; }).join('') : '<div class="vazio">Nenhuma conversa</div>'}
    </div>
    <div class="wa-chat">${corpo}</div>
  </div>`;
}

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
async function conversaParaLead(l) {
  let c = conversaDoLead(l);
  if (!c) {
    let wa = digitos(l.whatsapp); if (wa.length <= 11) wa = '55' + wa;
    c = S.wa_conversas.find(x => x.wa_id === wa) || await criar('wa_conversas', { wa_id: wa, nome: l.nome, lead_id: l.id, cliente_id: l.cliente_id || null, nao_lidas: 0 });
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
function preencherRapida(i) {
  const c = convAtiva(), l = leadDaConversa(c);
  const calc = l ? S.calculos.filter(x => x.lead_id === l.id || (l.cliente_id && x.cliente_id === l.cliente_id)).sort((a, b) => (b.data_entrada || '').localeCompare(a.data_entrada || ''))[0] : null;
  const nome = ((c && c.nome) || '').split(' ').slice(0, 2).join(' ');
  const txt = RESPOSTAS_RAPIDAS[i][1].replace('{nome}', nome).replace('{valor}', ((calc && calc.valor_cobrado) || (l && l.valor_orcado) || 150).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
    .replace('{prazo}', calc && calc.prazo_entrega ? dataBR(calc.prazo_entrega) : 'em até 48h');
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
  (S.wa_mensagens[c.wa_id] = S.wa_mensagens[c.wa_id] || []).push(msg);
  const resumo = msg.tipo === 'document' ? `📎 ${msg.arquivo_nome}` : msg.texto;
  await atualizar('wa_conversas', c.id, { ultima_msg: (resumo || '').slice(0, 200), ultima_msg_em: msg.created_at, nao_lidas: 0 });
  if (l) {
    const patch = { ultimo_contato: new Date().toISOString() };
    if (!l.respondido_em) patch.respondido_em = patch.ultimo_contato;
    await atualizar('leads', l.id, patch);
  }
  render();
}
async function waEnviarTexto() {
  const c = convAtiva(), t = $('#waTexto'); if (!c || !t) return;
  const texto = t.value.trim(); if (!texto) return;
  const btn = $('[data-acao=waEnviar]'); if (btn) btn.disabled = true;
  await seguro(async () => { await waEnviar({ texto }); S.rascunhos[c.wa_id] = ''; render(); $('#waTexto')?.focus(); });
  if (btn) btn.disabled = false;
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
  ${lista.map(c => `<tr class="clic" data-calc="${c.id}"><td>${dataBR(c.data_entrada)}</td><td>${esc(c.numero_processo || '—')}${c.arquivo_path ? ` <button class="btn mini sec" data-pdf="${esc(c.arquivo_path)}">PDF</button>` : ''}</td>
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
  <div class="card"><div class="tabela">${linhas.length ? `<table><tr><th>Cliente</th><th>WhatsApp</th><th>OAB</th><th>Cidade</th><th>Origem</th><th class="n">Cálculos</th><th class="n">Faturado</th><th class="n">Em aberto</th><th>Último</th></tr>
  ${linhas.map(({ c, n, fat, ult, aberto }) => `<tr class="clic" data-cliente="${c.id}"><td><b>${esc(c.nome)}</b></td><td>${c.whatsapp ? `<a target="_blank" href="${waLink(c.whatsapp)}" onclick="event.stopPropagation()">${esc(c.whatsapp)}</a>` : '—'}</td>
  <td>${esc(c.oab || '—')}</td><td>${esc(c.cidade || '—')}</td><td>${esc(c.origem || '—')}</td><td class="n">${n}</td><td class="n">${brl(fat)}</td><td class="n">${aberto ? brl(aberto) : '—'}</td><td>${dataBR(ult)}</td></tr>`).join('')}</table>` : '<div class="vazio">Nenhum cliente ainda. Eles são criados ao converter um lead em cálculo.</div>'}</div></div>`;
}

function telaFinanceiro() {
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
      <td style="white-space:nowrap">${cl?.whatsapp ? `<a class="btn mini sec" target="_blank" href="${waLink(cl.whatsapp, `Olá, ${cl.nome}! Tudo bem? Passando para lembrar do pagamento do cálculo do processo ${c.numero_processo || ''}, no valor de ${brl(c.valor_cobrado)}. Obrigado!`)}">Cobrar</a>` : ''} <button class="btn mini" data-pagar="${c.id}">Pago</button></td></tr>`; }).join('')}</table></div>` : '<div class="vazio">Nada a receber 🎉</div>'}</div>
    <div class="card"><h2>Despesas</h2><div class="desc">${PERIODOS[S.periodo]}</div>
    ${m.despesasP.length ? `<div class="tabela"><table><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="n">Valor</th></tr>
    ${[...m.despesasP].sort((a, b) => b.data.localeCompare(a.data)).map(d => `<tr class="clic" data-despesa="${d.id}"><td>${dataBR(d.data)}</td><td>${esc(d.canal)}</td><td>${esc(d.descricao || '')}</td><td class="n">${brl(d.valor)}</td></tr>`).join('')}</table></div>` : '<div class="vazio">Nenhuma despesa lançada</div>'}</div>
  </div>`;
}

/* ---------------- shell, rotas e eventos ---------------- */
const ROTAS = { painel: ['Painel', telaPainel], leads: ['Leads · CRM', telaLeads], whatsapp: ['WhatsApp', telaWhatsapp], calculos: ['Cálculos', telaCalculos], clientes: ['Clientes', telaClientes], financeiro: ['Financeiro', telaFinanceiro] };
const rota = () => { const r = location.hash.slice(1); return ROTAS[r] ? r : 'painel'; };
const CAMPOS_FOCO = ['busca', 'buscaLeads', 'buscaWa', 'waTexto'];

function render() {
  const r = rota();
  const pendentes = S.leads.filter(l => semResposta(l) || retornoPendente(l)).length;
  const atras = S.calculos.filter(atrasado).length;
  const naoLidas = soma(S.wa_conversas, c => c.nao_lidas);
  const ae = document.activeElement, foco = ae && CAMPOS_FOCO.includes(ae.id) ? { id: ae.id, ini: ae.selectionStart, fim: ae.selectionEnd } : null;
  const msgsAntes = $('#waMsgs'), noFim = !msgsAntes || msgsAntes.scrollHeight - msgsAntes.scrollTop - msgsAntes.clientHeight < 60;
  const pill = n => n ? `<span class="pill">${n}</span>` : '';
  $('#raiz').innerHTML = `<div class="app"><nav>
    <div class="marca">Pontes Ferreira<span>Cálculos Judiciais</span></div>
    ${Object.entries(ROTAS).map(([k, [rot]]) => `<a href="#${k}" class="${k === r ? 'on' : ''}">${rot}${k === 'leads' ? pill(pendentes) : k === 'whatsapp' ? pill(naoLidas) : k === 'calculos' ? pill(atras) : ''}</a>`).join('')}
    <div class="rodape">${DEMO ? 'Modo demonstração' : `Conectado<br><button data-acao="sair">Sair</button>`}</div></nav>
    <main class="${r === 'whatsapp' ? 'main-wa' : ''}">${DEMO ? `<div class="demo"><span><b>Modo demonstração:</b> dados de exemplo, salvos só neste navegador. Conecte o Supabase em <code>config.js</code> para usar de verdade.</span><button class="btn mini sec" data-acao="limparDemo">Limpar exemplos</button></div>` : ''}
    ${ROTAS[r][1]()}</main></div>`;
  document.title = `${(naoLidas + pendentes) ? `(${naoLidas + pendentes}) ` : ''}${ROTAS[r][0]} · Pontes Ferreira`;
  if (foco) { const el = document.getElementById(foco.id); if (el && !el.disabled) { el.focus(); try { el.setSelectionRange(foco.ini, foco.fim); } catch { } } }
  const box = $('#waMsgs'); if (box && noFim) box.scrollTop = box.scrollHeight;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-acao],[data-calc],[data-lead],[data-converter],[data-pdf],[data-pagar],[data-cliente],[data-despesa],[data-ficha],[data-fechar-ficha],[data-prox],[data-adiar],[data-vista],[data-wa-lead],[data-conv],[data-usar-pdf]');
  if (!t) return;
  const d = t.dataset;
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
    novaDespesa: () => editarDespesa(null), importarPJC, limparDemo, novaConversa,
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
  if (id === 'busca') { S.busca = e.target.value; render(); }
  if (id === 'buscaLeads') { S.filtroLeads.q = e.target.value; render(); }
  if (id === 'buscaWa') { S.buscaWa = e.target.value; render(); }
  if (id === 'waTexto' && S.conversa) S.rascunhos[S.conversa] = e.target.value;
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'waTexto' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); waEnviarTexto(); }
  if (e.key === 'Escape' && fichaId) fecharFicha();
});
window.addEventListener('hashchange', render);
setInterval(() => { if (!document.querySelector('.modal-fundo') && !CAMPOS_FOCO.includes(document.activeElement?.id)) render(); }, 60000);

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
  $('#raiz').innerHTML = `<div class="login"><form id="login"><h2>Pontes Ferreira</h2><p style="color:var(--ink-2);margin-bottom:6px">Painel de gestão</p>
    <input type="email" id="email" placeholder="E-mail" required autocomplete="username"><input type="password" id="senha" placeholder="Senha" required autocomplete="current-password">
    ${erro ? `<p style="color:var(--crit);font-size:13px">${esc(erro)}</p>` : ''}<button class="btn">Entrar</button></form></div>`;
  $('#login').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $('#email').value, password: $('#senha').value });
    if (error) return telaLogin('E-mail ou senha incorretos.');
    iniciar();
  };
}
async function iniciar() {
  try {
    if (DEMO) semearDemo();
    else {
      const { data } = await sb.auth.getSession();
      if (!data.session) return telaLogin();
    }
    await carregar();
    render();
    tempoReal();
  } catch (e) {
    console.error(e);
    $('#raiz').innerHTML = `<div style="padding:30px"><h2>Não foi possível carregar</h2><p>${esc(e.message || e)}</p><p>Confira o <code>config.js</code> e se o <code>schema.sql</code> foi executado no Supabase.</p></div>`;
  }
}
iniciar();
