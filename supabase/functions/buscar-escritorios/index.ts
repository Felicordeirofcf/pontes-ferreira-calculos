// @ts-nocheck
// Supabase Edge Function: buscar-escritorios
// Busca automática da Prospecção: procura escritórios/advogados no Google Maps (Places API, dados públicos de empresas)
// e devolve nome, telefone, site, endereço e avaliação para o painel adicionar com um clique.
// Só o dono logado no painel pode usar. Deixe "Verify JWT" LIGADO.
// Secret: GOOGLE_PLACES_KEY (chave do Google Cloud com a "Places API (New)" ativada).
// Custo: o Google dá uma cota gratuita mensal; cada busca traz até 20 resultados.
// Com { acao: 'emails', sites: [...] }: abre o site público de cada escritório (início e página de contato)
// e devolve os e-mails de contato publicados nele. O Google Maps não informa e-mail.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const CAMPOS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.rating', 'places.userRatingCount', 'places.businessStatus', 'places.primaryTypeDisplayName', 'nextPageToken'].join(',');

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: dono } = await usuario.rpc('is_dono');
    if (dono !== true) return resp({ erro: 'nao_autorizado' }, 401);
    const chave = Deno.env.get('GOOGLE_PLACES_KEY');
    if (!chave) return resp({ erro: 'sem_chave', mensagem: 'Falta o secret GOOGLE_PLACES_KEY no Supabase.' }, 400);

    const b = await req.json().catch(() => ({}));
    if (b.acao === 'emails') {
      const sites = (Array.isArray(b.sites) ? b.sites : []).map((x: unknown) => String(x || '').trim()).filter(Boolean).slice(0, 8);
      const res: Record<string, string[]> = {};
      await Promise.all(sites.map(async (site: string) => { res[site] = await emailsDoSite(site).catch(() => []); }));
      return resp({ emails: res });
    }
    const termo = String(b.termo || 'advogado trabalhista').slice(0, 80).trim();
    const cidade = String(b.cidade || '').slice(0, 80).trim();
    if (!cidade) return resp({ erro: 'sem_cidade', mensagem: 'Informe a cidade.' }, 400);

    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': CAMPOS },
      body: JSON.stringify({ textQuery: `${termo} em ${cidade}`, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, ...(b.pagina ? { pageToken: String(b.pagina) } : {}) })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return resp({ erro: 'google', mensagem: d?.error?.message || `Google respondeu ${r.status}` }, 502);

    const comp = (p: any, tipo: string) => (p.addressComponents || []).find((c: any) => (c.types || []).includes(tipo));
    const lugares = (d.places || []).filter((p: any) => p.businessStatus !== 'CLOSED_PERMANENTLY').map((p: any) => {
      const cid = comp(p, 'administrative_area_level_2')?.longText || comp(p, 'locality')?.longText || '';
      const uf = comp(p, 'administrative_area_level_1')?.shortText || '';
      return {
        id: p.id, nome: p.displayName?.text || '', endereco: p.formattedAddress || '',
        cidade: cid ? `${cid}${uf ? '/' + uf : ''}` : cidade,
        telefone: p.internationalPhoneNumber || p.nationalPhoneNumber || '', site: p.websiteUri || '', maps: p.googleMapsUri || '',
        nota: p.rating || null, avaliacoes: p.userRatingCount || 0, tipo: p.primaryTypeDisplayName?.text || ''
      };
    });
    return resp({ lugares, proxima: d.nextPageToken || null });
  } catch (e) {
    console.error(e);
    return resp({ erro: 'interno' }, 500);
  }
});

// ---------- e-mails publicados no site do escritório ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
async function baixar(url: string) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow', signal: ctl.signal });
    if (!r.ok || !/html|text/i.test(r.headers.get('content-type') || 'text/html')) return { html: '', url };
    return { html: (await r.text()).slice(0, 1_500_000), url: r.url || url };
  } finally { clearTimeout(t); }
}
function achaEmails(html: string) {
  const achados = new Set<string>();
  // e-mails protegidos pelo Cloudflare (data-cfemail / #email-protection)
  for (const m of html.matchAll(/(?:data-cfemail="|email-protection#)([0-9a-f]{6,})/gi)) {
    const h = m[1], k = parseInt(h.slice(0, 2), 16); let e = '';
    for (let i = 2; i < h.length; i += 2) e += String.fromCharCode(parseInt(h.slice(i, i + 2), 16) ^ k);
    achados.add(e);
  }
  const txt = html.replace(/&#64;|&#x40;|\s*\[at\]\s*|\s*\(at\)\s*|\s+arroba\s+/gi, '@').replace(/%40/g, '@');
  for (const m of txt.matchAll(/[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi)) achados.add(m[0]);
  return [...achados].map(e => e.toLowerCase().replace(/^u00[0-9a-f]{2}/, '').replace(/\.+$/, '')).filter(e =>
    !/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(e) && !/(sentry|wixpress|example|exemplo|seudominio|seuemail|dominio\.com|email\.com$|domain\.com|yourdomain|godaddy|wordpress|\.wix|cloudflare|schema\.org)/.test(e) && e.length <= 80);
}
async function emailsDoSite(site: string) {
  let base: URL; try { base = new URL(/^https?:\/\//i.test(site) ? site : 'https://' + site); } catch { return []; }
  const inicio = await baixar(base.href).catch(() => ({ html: '', url: base.href }));
  const todos = new Set(achaEmails(inicio.html));
  if (todos.size < 1) { // procura na página de contato
    const host = new URL(inicio.url).host;
    const links = [...inicio.html.matchAll(/href="([^"#]*(?:contato|contatos|fale|contact|atendimento)[^"#]*)"/gi)].map(m => { try { return new URL(m[1], inicio.url); } catch { return null; } })
      .filter((u): u is URL => !!u && u.host === host).map(u => u.href);
    const extras = [...new Set([...links, new URL('/contato', inicio.url).href, new URL('/fale-conosco', inicio.url).href])].slice(0, 3);
    for (const u of extras) { const pg = await baixar(u).catch(() => ({ html: '' })); achaEmails(pg.html).forEach(e => todos.add(e)); if (todos.size) break; }
  }
  const dom = base.host.replace(/^www\./, '');
  return [...todos].sort((a, b) => Number(b.endsWith('@' + dom) || b.endsWith('.' + dom)) - Number(a.endsWith('@' + dom) || a.endsWith('.' + dom))).slice(0, 5);
}

