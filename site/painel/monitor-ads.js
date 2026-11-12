// Monitoramento do tráfego pago: regras que avisam o que melhorar para chegar a mais clientes.
// O mesmo bloco roda no painel (Tráfego pago > Monitoramento) e no e-mail automático (função alertas).
// Depois de mudar este arquivo:  node scripts/sincronizar-robo.mjs   (copia o bloco para a função alertas)
// <monitor-ads>
const MON_FREQ = { diaria: 'Todo dia', semanal: 'Toda segunda', mensal: 'Todo dia 1º' };
const MON_RUINS = /gr[aá]tis|gratuit|calculadora|curso|apostila|download|baixar|como fazer|como calcular|tutorial|vaga|emprego|concurso|sal[aá]rio d|quanto ganha|meus direitos|fgts|seguro desemprego|rescis[aã]o|planilha|modelo|pdf|manual|treinamento|aplicativo|excel/i;
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
