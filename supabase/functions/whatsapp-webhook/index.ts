// Supabase Edge Function: whatsapp-webhook
// Recebe as mensagens do WhatsApp (API oficial da Meta) e grava no painel.
// IMPORTANTE: ao criar a função, DESLIGUE "Enforce JWT verification" (a Meta não envia login).
//
// Secrets necessários (Edge Functions > Secrets):
//   WA_VERIFY_TOKEN  -> uma senha inventada por você; a mesma vai no painel da Meta
//   WA_APP_SECRET    -> App secret do app na Meta (Configurações do app > Básico)
//   WA_TOKEN         -> token permanente do usuário do sistema (Business Manager)
//   WA_GRAPH_VERSION -> opcional, ex.: v23.0
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.

import { createClient } from 'npm:@supabase/supabase-js@2';

const GRAPH = `https://graph.facebook.com/${Deno.env.get('WA_GRAPH_VERSION') || 'v23.0'}`;
const TOKEN = Deno.env.get('WA_TOKEN') || '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const digitos = (s: string) => String(s || '').replace(/\D/g, '');
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

async function conversaDe(waId: string, nomePerfil: string, referral?: any) {
  const { data: existente } = await db.from('wa_conversas').select('*').eq('wa_id', waId).maybeSingle();
  if (existente) return existente;

  // liga ao cliente ou lead que já tem esse telefone; se não houver, cria um lead novo (CRM)
  const fim = ultimos9(waId);
  const { data: clientes } = await db.from('clientes').select('id,nome,whatsapp');
  const cliente = (clientes || []).find(c => ultimos9(c.whatsapp) === fim);
  const { data: leads } = await db.from('leads').select('id,whatsapp,status,created_at').order('created_at', { ascending: false }).limit(2000);
  let lead = (leads || []).find(l => ultimos9(l.whatsapp) === fim);
  if (!lead && !cliente) {
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

  const { error } = await db.from('wa_mensagens').insert({
    wa_id: waId, direcao: 'in', tipo, texto, arquivo_path, arquivo_nome, wamid: m.id, status: 'received',
    created_at: new Date(Number(m.timestamp) * 1000).toISOString()
  });
  if (error && !String(error.message).includes('duplicate')) throw error;

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
  if (!(await assinaturaValida(req, corpo))) return new Response('assinatura inválida', { status: 401 });

  try {
    const json = JSON.parse(corpo);
    for (const entry of json.entry || []) for (const ch of entry.changes || []) {
      const v = ch.value || {};
      for (const m of v.messages || []) await processarMensagem(m, v.contacts || []);
      for (const s of v.statuses || []) {
        await db.from('wa_mensagens').update({ status: s.status, erro: s.errors?.[0]?.title || null }).eq('wamid', s.id);
      }
    }
  } catch (e) { console.error(e); }
  return new Response('ok', { status: 200 }); // sempre 200 para a Meta não reenviar em loop
});
