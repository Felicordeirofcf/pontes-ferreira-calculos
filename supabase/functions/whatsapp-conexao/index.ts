// @ts-nocheck
// Supabase Edge Function: whatsapp-conexao
// O painel usa para conectar o WhatsApp na Evolution API (QR code), ver o status e desconectar.
// Deixe "Enforce JWT verification" LIGADO: só você (logado no painel) consegue usar.
//
// Secrets: EVOLUTION_URL (ex.: https://wa.pontesferreiracalculos.com), EVOLUTION_KEY (chave da API),
//          EVOLUTION_INSTANCIA (opcional, padrão "pontes"), EVOLUTION_WEBHOOK_KEY (senha do webhook)
// Corpo: { acao: 'status' | 'conectar' | 'codigo' | 'desconectar' | 'webhook', numero? }

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const EVO_URL = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_KEY') || '';
const INST = Deno.env.get('EVOLUTION_INSTANCIA') || 'pontes';
const evo = async (metodo: string, caminho: string, corpo?: unknown) => {
  const r = await fetch(`${EVO_URL}${caminho}`, { method: metodo, headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { ok: r.ok, status: r.status, dados: await r.json().catch(() => ({})) };
};

async function estado() {
  const r = await evo('GET', `/instance/connectionState/${INST}`);
  if (r.status === 404) return 'inexistente';
  return r.dados?.instance?.state || r.dados?.state || (r.ok ? 'desconhecido' : 'erro');
}
// MESSAGES_UPDATE traz os tiques de entregue/lido das mensagens enviadas
const EVENTOS_WEBHOOK = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'];
async function configurarWebhook() {
  const chave = Deno.env.get('EVOLUTION_WEBHOOK_KEY');
  if (!chave) throw new Error('Crie o secret EVOLUTION_WEBHOOK_KEY no Supabase.');
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook?k=${encodeURIComponent(chave)}`;
  const r = await evo('POST', `/webhook/set/${INST}`, { webhook: { enabled: true, url, byEvents: false, base64: true, events: EVENTOS_WEBHOOK } });
  if (!r.ok) throw new Error('Falha ao configurar o webhook: ' + JSON.stringify(r.dados).slice(0, 200));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: dono } = await usuario.rpc('is_dono');
    if (dono !== true) return resp({ erro: 'nao_autorizado' }, 401);
    if (!EVO_URL || !EVO_KEY) return resp({ erro: 'nao_configurado', mensagem: 'Configure EVOLUTION_URL e EVOLUTION_KEY nos Secrets do Supabase.' }, 400);

    const b = await req.json().catch(() => ({}));
    const acao = b.acao || 'status';

    if (acao === 'status') {
      const st = await estado();
      let numero = null, nome = null;
      if (st === 'open') {
        const r = await evo('GET', `/instance/fetchInstances?instanceName=${INST}`);
        const i = Array.isArray(r.dados) ? r.dados[0] : r.dados;
        numero = String(i?.ownerJid || i?.owner || i?.instance?.owner || '').split('@')[0] || null;
        nome = i?.profileName || i?.instance?.profileName || null;
        // webhook antigo (sem os tiques) ou desligado: corrige sozinho
        try {
          const w = await evo('GET', `/webhook/find/${INST}`);
          const ev = (w.dados?.events || []).map((x: string) => String(x).toUpperCase());
          if (!w.dados?.enabled || EVENTOS_WEBHOOK.some(e => !ev.includes(e))) await configurarWebhook();
        } catch (e) { console.warn('webhook', e); }
      }
      return resp({ estado: st, numero, nome, instancia: INST });
    }

    if (acao === 'conectar' || acao === 'codigo') {
      let st = await estado();
      if (st === 'inexistente') {
        const r = await evo('POST', '/instance/create', { instanceName: INST, integration: 'WHATSAPP-BAILEYS', qrcode: true, groupsIgnore: true, alwaysOnline: false, readMessages: false, syncFullHistory: false });
        if (!r.ok) return resp({ erro: 'criar', mensagem: 'Não foi possível criar a instância: ' + JSON.stringify(r.dados).slice(0, 200) }, 502);
        st = 'close';
      }
      await configurarWebhook();
      if (st === 'open') return resp({ estado: 'open' });
      const num = String(b.numero || '').replace(/\D/g, '');
      const r = await evo('GET', `/instance/connect/${INST}${acao === 'codigo' && num ? `?number=${num.length <= 11 ? '55' + num : num}` : ''}`);
      return resp({ estado: st, qrcode: r.dados?.base64 || null, codigo: r.dados?.pairingCode || null });
    }

    if (acao === 'webhook') { await configurarWebhook(); return resp({ ok: true }); }

    if (acao === 'desconectar') {
      const r = await evo('DELETE', `/instance/logout/${INST}`);
      return resp({ ok: r.ok, estado: await estado() });
    }

    return resp({ erro: 'acao_invalida' }, 400);
  } catch (e) {
    console.error(e);
    return resp({ erro: 'interno', mensagem: (e as Error).message }, 500);
  }
});
