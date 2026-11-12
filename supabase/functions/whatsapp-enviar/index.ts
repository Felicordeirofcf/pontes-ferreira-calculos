// Supabase Edge Function: whatsapp-enviar
// Chamada pelo painel para enviar mensagem/arquivo/modelo pelo WhatsApp.
// Provedor: Evolution API (se EVOLUTION_URL e EVOLUTION_KEY existirem) ou API oficial da Meta.
// Deixe "Enforce JWT verification" LIGADO: só você (logado no painel) consegue enviar.
//
// Secrets: WA_TOKEN, WA_PHONE_NUMBER_ID, WA_GRAPH_VERSION (opcional)
// Corpo: { wa_id, nome?, texto?, arquivo_path?, arquivo_nome?, template?, idioma? }

import { createClient } from 'npm:@supabase/supabase-js@2';

const GRAPH = `https://graph.facebook.com/${Deno.env.get('WA_GRAPH_VERSION') || 'v23.0'}`;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const digitos = (s: string) => String(s || '').replace(/\D/g, '');

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    // só o dono do painel pode enviar
    const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
    });
    const { data: dono } = await usuario.rpc('is_dono');
    if (dono !== true) return resp({ erro: 'nao_autorizado' }, 401);

    const TOKEN = Deno.env.get('WA_TOKEN'), PHONE_ID = Deno.env.get('WA_PHONE_NUMBER_ID');
    const EVO_URL = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/+$/, ''), EVO_KEY = Deno.env.get('EVOLUTION_KEY') || '', EVO_INST = Deno.env.get('EVOLUTION_INSTANCIA') || 'pontes';
    const usaEvo = !!(EVO_URL && EVO_KEY);
    if (!usaEvo && (!TOKEN || !PHONE_ID)) return resp({ erro: 'whatsapp_nao_configurado', mensagem: 'Configure a Evolution API (EVOLUTION_URL e EVOLUTION_KEY) ou a API da Meta nos Secrets do Supabase.' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const b = await req.json();
    let waId = digitos(b.wa_id);
    if (waId.length <= 11) waId = '55' + waId;
    if (waId.length < 12) return resp({ erro: 'numero_invalido' }, 400);

    // garante a conversa
    let { data: conv } = await db.from('wa_conversas').select('*').eq('wa_id', waId).maybeSingle();
    if (!conv) {
      const r = await db.from('wa_conversas').insert({ wa_id: waId, nome: b.nome || waId, lead_id: b.lead_id || null, cliente_id: b.cliente_id || null }).select().single();
      if (r.error) throw r.error; conv = r.data;
    }

    // Regra da Meta: fora de 24h da última mensagem do cliente, só modelo (template) aprovado
    const janelaAberta = conv.ultima_entrada_em && (Date.now() - new Date(conv.ultima_entrada_em).getTime()) < 24 * 3600e3;
    if (!usaEvo && !b.template && !janelaAberta) return resp({ erro: 'janela_24h', mensagem: 'O cliente não escreve há mais de 24h. Envie um modelo aprovado para reabrir a conversa.' }, 409);

    let payload: Record<string, unknown>, tipo = 'text', texto = b.texto || '';
    if (usaEvo) {
      // Evolution API (WhatsApp Web): sem janela de 24h e sem modelos
      let r: Response;
      if (b.template) return resp({ erro: 'nao_suportado', mensagem: 'Com a Evolution API não é preciso modelo: envie uma mensagem normal.' }, 400);
      if (b.arquivo_path) {
        const { data: assinado, error } = await db.storage.from('processos').createSignedUrl(b.arquivo_path, 3600);
        if (error) throw error;
        const nome = b.arquivo_nome || 'documento.pdf', img = /\.(jpe?g|png|webp)$/i.test(nome);
        tipo = img ? 'image' : 'document';
        r = await fetch(`${EVO_URL}/message/sendMedia/${EVO_INST}`, { method: 'POST', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: waId, mediatype: img ? 'image' : 'document', mimetype: img ? 'image/jpeg' : (/\.pdf$/i.test(nome) ? 'application/pdf' : 'application/octet-stream'), media: assinado.signedUrl, fileName: nome, caption: b.texto || undefined }) });
      } else {
        if (!texto.trim()) return resp({ erro: 'mensagem_vazia' }, 400);
        r = await fetch(`${EVO_URL}/message/sendText/${EVO_INST}`, { method: 'POST', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: waId, text: texto }) });
      }
      const out = await r.json().catch(() => ({}));
      if (!r.ok) return resp({ erro: 'evolution', mensagem: out?.response?.message?.[0]?.exists === false ? 'Este número não tem WhatsApp.' : (out?.message || out?.error || 'Falha ao enviar pela Evolution API'), detalhe: out }, 502);
      return await registrarEnvio(db, conv, waId, tipo, tipo === 'text' ? texto : (b.texto || ''), b, out?.key?.id);
    }
    if (b.template) {
      tipo = 'template'; texto = `[modelo: ${b.template}]`;
      payload = { type: 'template', template: { name: b.template, language: { code: b.idioma || 'pt_BR' } } };
    } else if (b.arquivo_path) {
      const { data: assinado, error } = await db.storage.from('processos').createSignedUrl(b.arquivo_path, 3600);
      if (error) throw error;
      tipo = 'document';
      payload = { type: 'document', document: { link: assinado.signedUrl, filename: b.arquivo_nome || 'documento.pdf', caption: b.texto || undefined } };
    } else {
      if (!texto.trim()) return resp({ erro: 'mensagem_vazia' }, 400);
      payload = { type: 'text', text: { body: texto, preview_url: false } };
    }

    const r = await fetch(`${GRAPH}/${Deno.env.get('WA_PHONE_NUMBER_ID')}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: waId, ...payload })
    });
    const out = await r.json();
    if (!r.ok) return resp({ erro: 'meta', mensagem: out?.error?.message || 'Falha ao enviar', detalhe: out?.error }, 502);

    return await registrarEnvio(db, conv, waId, tipo, texto, b, out.messages?.[0]?.id);
  } catch (e) {
    console.error(e);
    return resp({ erro: 'interno', mensagem: (e as Error).message }, 500);
  }
});

async function registrarEnvio(db: any, conv: any, waId: string, tipo: string, texto: string, b: any, wamid: string | undefined) {
    const linha = {
      wa_id: waId, direcao: 'out', tipo, texto, arquivo_path: b.arquivo_path || null, arquivo_nome: b.arquivo_nome || null,
      wamid: wamid || null, status: 'sent'
    };
    // upsert: se o eco do WhatsApp já gravou esta mensagem, completa a linha em vez de dar erro (a mensagem já foi enviada)
    const { data: msg, error: e2 } = wamid
      ? await db.from('wa_mensagens').upsert(linha, { onConflict: 'wamid' }).select().single()
      : await db.from('wa_mensagens').insert(linha).select().single();
    if (e2) throw e2;

    // a equipe assumiu a conversa: o robô fica em silêncio por algumas horas (Painel > WhatsApp > Atendimento automático)
    const { data: aj } = await db.from('ajustes').select('valor').eq('chave', 'atendimento').maybeSingle();
    const pausa = Number(aj?.valor?.pausa_horas) || 12;
    const resumo = tipo === 'document' ? `📎 ${b.arquivo_nome || 'documento'}` : texto;
    await db.from('wa_conversas').update({
      ultima_msg: resumo.slice(0, 200), ultima_msg_em: new Date().toISOString(), nao_lidas: 0,
      humano_ate: new Date(Date.now() + pausa * 3600e3).toISOString(), bot_etapa: 'humano'
    }).eq('wa_id', waId);
    if (conv.lead_id) await db.from('leads').update({ ultimo_contato: new Date().toISOString() }).eq('id', conv.lead_id);

    return resp({ ok: true, mensagem: msg });
}
