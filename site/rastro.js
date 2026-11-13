// Consentimento de cookies (LGPD) + Modo de Consentimento v2 do Google.
// Antes do "Aceitar", Google Ads/Analytics funcionam sem cookies (medição anônima) e Meta Pixel/Clarity ficam desligados.
(function () {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { dataLayer.push(arguments); };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } } };
  const escolha = ls.get('pf_cookies'); // 'sim' | 'nao' | null
  const v = escolha === 'sim' ? 'granted' : 'denied';
  gtag('consent', 'default', { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v, wait_for_update: 500 });
  gtag('set', 'ads_data_redaction', escolha !== 'sim');
  gtag('set', 'url_passthrough', true);
  window.PF_CONSENTIU = () => ls.get('pf_cookies') === 'sim';
  if (escolha || /^\/(painel|cliente)\//.test(location.pathname)) return;
  const mostrar = () => {
    const b = document.createElement('div');
    b.id = 'pfCookies'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Aviso de cookies');
    b.style.cssText = 'position:fixed;left:12px;right:84px;bottom:12px;max-width:560px;z-index:9998;background:#0b1a3d;color:#fff;border:1px solid rgba(226,177,60,.45);border-radius:14px;padding:14px 16px;box-shadow:0 12px 34px rgba(0,0,0,.35);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif';
    b.innerHTML = 'Usamos cookies para medir nossos anúncios e melhorar o site. Os dados do seu processo nunca são usados para isso. <a href="/privacidade.html" style="color:#fbe7a1">Política de Privacidade</a>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" data-c="sim" style="background:linear-gradient(135deg,#fbe7a1,#e2b13c 45%,#b07a12);color:#1b1203;border:0;border-radius:9px;padding:8px 16px;font-weight:700;cursor:pointer">Aceitar</button>' +
      '<button type="button" data-c="nao" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:9px;padding:8px 16px;cursor:pointer">Recusar</button></div>';
    b.addEventListener('click', e => {
      const c = e.target.getAttribute && e.target.getAttribute('data-c'); if (!c) return;
      ls.set('pf_cookies', c); b.remove();
      if (c === 'sim') {
        gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
        gtag('set', 'ads_data_redaction', false);
        if (window.fbq) fbq('consent', 'grant');
        window.dispatchEvent(new Event('pf-consentiu'));
      }
    });
    document.body.appendChild(b);
  };
  if (document.body) mostrar(); else document.addEventListener('DOMContentLoaded', mostrar);
})();

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
  // link interno das páginas de SEO (utm_source=organico) não apaga a origem paga já guardada
  const interno = q.get('utm_source') === 'organico' && ss.get('utm_source') && ss.get('utm_source') !== 'organico';
  if (!interno) ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(k => { if (q.get(k)) ss.set(k, q.get(k)); });
  ['gclid', 'fbclid'].forEach(k => { if (q.get(k)) ss.set(k, q.get(k)); });
  if (q.get('gclid') && !ss.get('utm_source')) ss.set('utm_source', 'google');
  if (q.get('fbclid') && !ss.get('utm_source')) ss.set('utm_source', 'meta');
  let ref = null;
  try { if (document.referrer) { const h = new URL(document.referrer).hostname; if (h && h !== location.hostname) ref = h.replace(/^www\./, '').slice(0, 120); } } catch (e) { }

  const geo = (async () => {
    const c = ss.get('pf_geo'); if (c) { try { return JSON.parse(c); } catch (e) { } }
    try { const g = await fetch('/api/geo/', { cache: 'no-store' }).then(r => r.json()); ss.set('pf_geo', JSON.stringify(g)); return g; } catch (e) { return {}; }
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

  // Páginas de SEO e portfólio: carrega a tag do Google Ads/GA4/Meta (códigos do painel) e conta o clique no WhatsApp.
  // A página inicial faz isso ela mesma (window.PF_CONV_PROPRIO).
  if (!window.PF_CONV_PROPRIO) {
    const rast = fetch(C.SUPABASE_URL + '/rest/v1/ajustes?chave=eq.rastreamento&select=valor', { headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + C.SUPABASE_ANON_KEY } })
      .then(r => r.json()).then(d => (d && d[0] && d[0].valor) || {}).catch(() => (C.RASTREAMENTO || {}))
      .then(r => {
        if (!r.ativo) return r;
        window.dataLayer = window.dataLayer || []; window.gtag = window.gtag || function () { dataLayer.push(arguments); };
        if (r.ga4_id || r.gads_id) {
          const sc = document.createElement('script'); sc.async = true; sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(r.ga4_id || r.gads_id); document.head.appendChild(sc);
          gtag('js', new Date()); if (r.ga4_id) gtag('config', r.ga4_id); if (r.gads_id) gtag('config', r.gads_id);
        }
        if (r.meta_pixel_id && !window.fbq) {
          const n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; window._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
          const sc = document.createElement('script'); sc.async = true; sc.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.appendChild(sc);
          fbq('consent', window.PF_CONSENTIU() ? 'grant' : 'revoke'); // só usa cookies do Meta depois do "Aceitar"
          fbq('init', r.meta_pixel_id); fbq('track', 'PageView');
        }
        return r;
      });
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href*="wa.me"],a[href*="api.whatsapp.com"]');
      if (!a) return;
      // leva a origem na mensagem ("Vim pelo site (google_pesquisa_calculo)") para o painel classificar o contato
      try {
        const u = new URL(a.href), camp = ss.get('utm_campaign') || ss.get('utm_source');
        const t = u.searchParams.get('text') || '';
        // monta o link com %20 (searchParams usaria "+", que o WhatsApp pode mostrar como "+")
        if (camp && !/pelo site/i.test(t)) a.href = u.origin + u.pathname + '?text=' + encodeURIComponent((t ? t + ' ' : '') + '(Vim pelo site (' + camp + '))');
      } catch (er) { }
      if (ss.get('pf_conv_wa')) return; // 1 conversão por visita
      ss.set('pf_conv_wa', '1');
      rast.then(r => {
        if (!r.ativo) return;
        const valor = Number(r.valor_lead) || 250;
        if (r.gads_id && r.gads_label) gtag('event', 'conversion', { send_to: r.gads_id + '/' + r.gads_label, value: valor, currency: 'BRL', transport_type: 'beacon' });
        if (r.ga4_id) gtag('event', 'generate_lead', { origem: 'whatsapp_' + location.pathname, value: valor, currency: 'BRL' });
        if (r.meta_pixel_id && window.fbq) fbq('track', 'Lead', { value: valor, currency: 'BRL' });
      });
    }, true);
  }

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
