-- Rastreador da jornada do cliente (13/11/2026). Rode UMA vez em Supabase > SQL Editor > New query > Run.
-- Pode rodar de novo sem problema. Não apaga dados.

-- 1) Código do visitante (ex.: PF7K2QA): vai na mensagem do WhatsApp e liga a conversa ao caminho no site
alter table eventos add column if not exists ref text;
create index if not exists eventos_ref_idx on eventos (ref);
create index if not exists eventos_sessao_idx on eventos (sessao);
alter table leads add column if not exists ref text;
alter table leads add column if not exists sessao text;

-- 2) Novos tipos de evento: tempo na página e início do formulário
drop policy if exists site_registra_evento on eventos;
create policy site_registra_evento on eventos for insert to anon, authenticated with check (
  tipo in ('visita', 'clique', 'whatsapp', 'pedido', 'rolagem', 'tempo', 'form_inicio')
  and coalesce(length(alvo), 0) <= 80 and coalesce(length(cidade), 0) <= 80 and coalesce(length(pagina), 0) <= 120
  and coalesce(length(referrer), 0) <= 120 and coalesce(length(sessao), 0) <= 64
  and coalesce(length(secao), 0) <= 60 and coalesce(length(pais), 0) <= 4 and coalesce(length(uf), 0) <= 4
  and coalesce(length(dispositivo), 0) <= 20 and coalesce(length(ref), 0) <= 12
  and coalesce(length(utm_source), 0) <= 80 and coalesce(length(utm_medium), 0) <= 80 and coalesce(length(utm_campaign), 0) <= 120
  and coalesce(length(utm_term), 0) <= 120 and coalesce(length(utm_content), 0) <= 120
);

-- 3) Pedido do site também leva o código (tamanho limitado)
drop policy if exists site_insere_lead on leads;
create policy site_insere_lead on leads for insert to anon with check (
  status = 'novo' and cliente_id is null and respondido_em is null
  and valor_orcado is null and tags is null and aviso_enviado_em is null and ultimo_contato is null
  and created_at > now() - interval '5 minutes'
  and (arquivo_path is null or arquivo_path ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}/[A-Za-z0-9-]+\.pdf$')
  and coalesce(length(nome), 0) <= 120 and coalesce(length(whatsapp), 0) <= 40
  and coalesce(length(tipo), 0) <= 80 and coalesce(length(prazo), 0) <= 40 and coalesce(length(modo), 0) <= 20
  and coalesce(length(numero_processo), 0) <= 40 and coalesce(length(obs), 0) <= 1000
  and coalesce(length(origem), 0) <= 160 and coalesce(length(utm_source), 0) <= 120
  and coalesce(length(utm_medium), 0) <= 120 and coalesce(length(utm_campaign), 0) <= 160
  and coalesce(length(utm_content), 0) <= 160 and coalesce(length(utm_term), 0) <= 160
  and coalesce(length(gclid), 0) <= 300 and coalesce(length(fbclid), 0) <= 300
  and coalesce(length(uf), 0) <= 4 and coalesce(length(cidade), 0) <= 80
  and coalesce(length(ref), 0) <= 12 and coalesce(length(sessao), 0) <= 64
);

select 'ok: rastreador da jornada instalado' as resultado;
