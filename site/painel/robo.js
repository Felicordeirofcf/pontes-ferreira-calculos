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
