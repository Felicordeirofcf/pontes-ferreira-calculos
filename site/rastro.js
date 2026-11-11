// Monitoramento próprio do site (vai para o painel > Mapa do Brasil).
// Registra visitas, cliques, WhatsApp, pedidos e rolagem, com estado/cidade aproximados.
// Anônimo: sem IP, sem cookies; uma sessão = uma aba aberta.
(function () {
  const C = window.PF_CONFIG || {};
  if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY || /^(localhost|127\.)/.test(location.hostname)) { window.PF_EVENTO = () => { }; window.PF_GEO = Promise.resolve({}); return; }
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { } } };
  let sessao = ss.get('pf_sessao');
  if (!sessao) { sessao = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); ss.set('pf_sessao', sessao); }

  // origem: utm da URL (ou link curto ?r= do portfólio), guardada para a sessão
  const q = new URLSearchParams(location.search);
  if (q.get('r') && !q.get('utm_source')) { q.set('utm_source', 'prospeccao'); q.set('utm_medium', q.get('m') === 'e' ? 'email' : 'whatsapp'); q.set('utm_campaign', 'prospeccao_1a1'); q.set('utm_content', q.get('r')); }
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(k => { if (q.get(k)) ss.set(k, q.get(k)); });
  if (q.get('gclid') && !ss.get('utm_source')) ss.set('utm_source', 'google');
  if (q.get('fbclid') && !ss.get('utm_source')) ss.set('utm_source', 'meta');
  let ref = null;
  try { if (document.referrer) { const h = new URL(document.referrer).hostname; if (h && h !== location.hostname) ref = h.replace(/^www\./, '').slice(0, 120); } } catch (e) { }

  const geo = (async () => {
    const c = ss.get('pf_geo'); if (c) { try { return JSON.parse(c); } catch (e) { } }
    try { const g = await fetch('/api/geo', { cache: 'no-store' }).then(r => r.json()); ss.set('pf_geo', JSON.stringify(g)); return g; } catch (e) { return {}; }
  })();
  const dispositivo = matchMedia('(max-width: 760px)').matches ? 'celular' : 'computador';
  const corta = (s, n) => s == null ? null : String(s).slice(0, n);

  function evento(tipo, extra) {
    geo.then(g => fetch(C.SUPABASE_URL + '/rest/v1/eventos', {
      method: 'POST', keepalive: true,
      headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        sessao, tipo, pagina: corta(location.pathname, 120), pais: corta(g.pais, 4) || null, uf: corta(g.uf, 4) || null, cidade: corta(g.cidade, 80) || null,
        utm_source: corta(ss.get('utm_source'), 80), utm_medium: corta(ss.get('utm_medium'), 80), utm_campaign: corta(ss.get('utm_campaign'), 120),
        utm_term: corta(ss.get('utm_term'), 120), utm_content: corta(ss.get('utm_content'), 120), referrer: ref, dispositivo,
        alvo: corta(extra && extra.alvo, 80), secao: corta(extra && extra.secao, 60)
      })
    }).catch(() => { }));
  }
  window.PF_EVENTO = evento;
  window.PF_GEO = geo;

  evento('visita');

  // cliques: botões, links, abas
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('a,button,.tab,[data-origem],label[for]');
    if (!el) return;
    const alvo = (el.dataset.origem || el.dataset.modo || el.getAttribute('aria-label') || el.textContent || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const sec = el.closest('section,header,footer,.hero,form');
    const secao = sec ? (sec.id || (typeof sec.className === 'string' && sec.className.split(' ')[0]) || sec.tagName.toLowerCase()) : '';
    const wa = el.matches('.js-wa,[href*="wa.me"],[href*="whatsapp"]');
    evento(wa ? 'whatsapp' : 'clique', { alvo: alvo || '(sem texto)', secao });
  }, true);

  // até onde a pessoa rolou a página (25/50/75/100%)
  const marcas = [25, 50, 75, 100], vistas = new Set();
  addEventListener('scroll', () => {
    const t = document.documentElement, pct = (scrollY + innerHeight) / Math.max(t.scrollHeight, 1) * 100;
    marcas.forEach(m => { if (pct >= m - 1 && !vistas.has(m)) { vistas.add(m); evento('rolagem', { alvo: m + '%' }); } });
  }, { passive: true });
})();
