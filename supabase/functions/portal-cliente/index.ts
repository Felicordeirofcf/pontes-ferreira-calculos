// @ts-nocheck
// Supabase Edge Function: portal-cliente
// O advogado abre pontesferreiracalculos.com/cliente/?t=TOKEN e vê só os cálculos dele.
// IMPORTANTE: ao criar a função, DESLIGUE "Enforce JWT verification" (o cliente não tem login).
// Segurança: o token é aleatório e longo (48 caracteres); sem token válido, nada é devolvido.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { t } = await req.json().catch(() => ({}));
    if (!t || String(t).length < 24) return resp({ erro: 'link_invalido' }, 400);
    const { data: cli } = await db.from('clientes').select('id,nome').eq('portal_token', String(t)).maybeSingle();
    if (!cli) return resp({ erro: 'link_invalido' }, 404);

    const { data: calcs } = await db.from('calculos')
      .select('id,numero_processo,reclamante,reclamada,tipo,status,data_entrada,prazo_entrega,data_entrega,valor_cobrado,pago,data_pagamento,arquivos')
      .eq('cliente_id', cli.id).order('data_entrada', { ascending: false }).limit(200);

    const calculos = [];
    for (const c of calcs || []) {
      const arquivos = [];
      if (c.status === 'entregue') for (const a of (c.arquivos || [])) {
        const { data } = await db.storage.from('processos').createSignedUrl(a.path, 3600, { download: a.nome || true });
        if (data?.signedUrl) arquivos.push({ nome: a.nome, url: data.signedUrl });
      }
      const { arquivos: _, id, ...resto } = c;
      calculos.push({ ...resto, arquivos });
    }
    const aPagar = calculos.filter(c => c.status === 'entregue' && !c.pago);
    return resp({
      cliente: { nome: cli.nome },
      calculos,
      resumo: {
        em_andamento: calculos.filter(c => c.status !== 'entregue').length,
        entregues: calculos.filter(c => c.status === 'entregue').length,
        a_pagar: aPagar.reduce((t, c) => t + (Number(c.valor_cobrado) || 0), 0),
        qtd_a_pagar: aPagar.length
      }
    });
  } catch (e) {
    console.error(e);
    return resp({ erro: 'interno' }, 500);
  }
});
