// @ts-nocheck
// Supabase Edge Function: buscar-escritorios
// Busca automática da Prospecção: procura escritórios/advogados no Google Maps (Places API, dados públicos de empresas)
// e devolve nome, telefone, site, endereço e avaliação para o painel adicionar com um clique.
// Só o dono logado no painel pode usar. Deixe "Verify JWT" LIGADO.
// Secret: GOOGLE_PLACES_KEY (chave do Google Cloud com a "Places API (New)" ativada).
// Custo: o Google dá uma cota gratuita mensal; cada busca traz até 20 resultados.

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
