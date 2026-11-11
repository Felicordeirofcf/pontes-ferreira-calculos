-- =====================================================================
-- Pontes Ferreira Cálculos Judiciais · Banco de dados do painel
-- Cole TUDO no Supabase > SQL Editor > New query > Run
-- Login autorizado no painel: adm@pontesferreiracalculos.com
-- =====================================================================

create extension if not exists pgcrypto;

-- Quem pode ver os dados (só o dono)
create table if not exists admins (email text primary key);
insert into admins (email) values ('adm@pontesferreiracalculos.com') on conflict do nothing;

create or replace function is_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where email = auth.jwt() ->> 'email');
$$;

-- Clientes (advogados / escritórios)
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null,
  whatsapp text,
  email text,
  oab text,
  cidade text,
  origem text,          -- canal que trouxe o cliente (Google Ads, Meta Ads, Indicação…)
  obs text
);

-- Leads (pedidos de orçamento do site, WhatsApp, indicação…)
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text,
  whatsapp text,
  tipo text,
  prazo text,
  modo text,                 -- pdf | numero | manual
  numero_processo text,
  arquivo_path text,         -- PDF no Storage (bucket "processos")
  origem text,
  utm_source text,
  utm_campaign text,
  gclid text,
  fbclid text,
  status text not null default 'novo',   -- novo | orcamento | fechado | perdido
  valor_orcado numeric,
  respondido_em timestamptz,
  motivo_perda text,
  cliente_id uuid references clientes(id) on delete set null,
  obs text
);

-- Cálculos (entrada e saída)
create table if not exists calculos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cliente_id uuid references clientes(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  numero_processo text,
  reclamante text,
  reclamada text,
  tipo text,
  autores int not null default 1,
  complexidade text default 'simples',
  status text not null default 'recebido',  -- recebido | andamento | revisao | entregue
  data_entrada date not null default current_date,
  prazo_entrega date,
  data_entrega date,
  valor_cobrado numeric,
  valor_apurado numeric,
  pago boolean not null default false,
  data_pagamento date,
  arquivo_path text,
  obs text
);

-- Despesas (investimento em anúncios e outros custos)
create table if not exists despesas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  data date not null default current_date,
  canal text not null,       -- Google Ads | Meta Ads | Outros anúncios | Software | Outros
  descricao text,
  valor numeric not null
);

-- ---------------- Segurança (RLS) ----------------
alter table admins   enable row level security;
alter table clientes enable row level security;
alter table leads    enable row level security;
alter table calculos enable row level security;
alter table despesas enable row level security;

drop policy if exists dono_clientes on clientes;
drop policy if exists dono_leads on leads;
drop policy if exists dono_calculos on calculos;
drop policy if exists dono_despesas on despesas;
drop policy if exists site_insere_lead on leads;

create policy dono_clientes on clientes for all to authenticated using (is_dono()) with check (is_dono());
create policy dono_leads    on leads    for all to authenticated using (is_dono()) with check (is_dono());
create policy dono_calculos on calculos for all to authenticated using (is_dono()) with check (is_dono());
create policy dono_despesas on despesas for all to authenticated using (is_dono()) with check (is_dono());

-- O formulário do site (visitante anônimo) só pode CRIAR lead novo; não lê nada.
create policy site_insere_lead on leads for insert to anon
  with check (status = 'novo' and cliente_id is null and respondido_em is null);

-- ---------------- Arquivos (PDF dos processos) ----------------
-- aceita qualquer tipo (PDF, .PJC, imagens e áudios do WhatsApp); o visitante do site só pode enviar PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('processos', 'processos', false, 52428800, null)
on conflict (id) do update set allowed_mime_types = null, file_size_limit = 52428800;

drop policy if exists site_envia_pdf on storage.objects;
drop policy if exists dono_pdf on storage.objects;

create policy site_envia_pdf on storage.objects for insert to anon
  with check (bucket_id = 'processos' and lower(storage.extension(name)) = 'pdf');
create policy dono_pdf on storage.objects for all to authenticated
  using (bucket_id = 'processos' and is_dono()) with check (bucket_id = 'processos' and is_dono());

-- ---------------- CRM ----------------
alter table leads add column if not exists temperatura text;        -- quente | morno | frio
alter table leads add column if not exists proximo_contato date;    -- data do próximo retorno
alter table leads add column if not exists tags text;               -- separadas por vírgula
alter table leads add column if not exists ultimo_contato timestamptz;

create table if not exists atividades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references leads(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade,
  tipo text not null default 'nota',   -- nota | ligacao | whatsapp | email | reuniao | status
  texto text
);

-- ---------------- WhatsApp ----------------
create table if not exists wa_conversas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  wa_id text not null unique,          -- telefone internacional só com dígitos (5521…)
  nome text,
  ultima_msg text,
  ultima_msg_em timestamptz,
  ultima_entrada_em timestamptz,       -- última mensagem RECEBIDA (abre a janela de 24h)
  nao_lidas int not null default 0,
  lead_id uuid references leads(id) on delete set null,
  cliente_id uuid references clientes(id) on delete set null
);

create table if not exists wa_mensagens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  wa_id text not null references wa_conversas(wa_id) on delete cascade,
  direcao text not null,               -- in | out
  tipo text not null default 'text',   -- text | document | image | audio | template | outro
  texto text,
  arquivo_path text,
  arquivo_nome text,
  wamid text unique,
  status text,                         -- sent | delivered | read | failed | received
  erro text
);
create index if not exists wa_mensagens_wa_id_idx on wa_mensagens (wa_id, created_at);

alter table atividades   enable row level security;
alter table wa_conversas enable row level security;
alter table wa_mensagens enable row level security;
drop policy if exists dono_atividades on atividades;
drop policy if exists dono_wa_conversas on wa_conversas;
drop policy if exists dono_wa_mensagens on wa_mensagens;
create policy dono_atividades   on atividades   for all to authenticated using (is_dono()) with check (is_dono());
create policy dono_wa_conversas on wa_conversas for all to authenticated using (is_dono()) with check (is_dono());
create policy dono_wa_mensagens on wa_mensagens for all to authenticated using (is_dono()) with check (is_dono());

-- Avisos em tempo real no painel (lead novo, mensagem nova)
do $$ begin alter publication supabase_realtime add table leads;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table wa_conversas; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table wa_mensagens; exception when duplicate_object then null; end $$;

-- ---------------- Tráfego pago ----------------
-- Origem detalhada do lead e gasto por campanha
alter table leads    add column if not exists utm_medium text;
alter table leads    add column if not exists utm_content text;
alter table leads    add column if not exists utm_term text;
alter table despesas add column if not exists campanha text;

-- Ajustes do painel. "rastreamento" é público (o site lê os IDs do Google/Meta);
-- "trafego" (verba, metas, checklist) só o dono vê.
create table if not exists ajustes (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  publico boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into ajustes (chave, publico) values ('rastreamento', true), ('trafego', false) on conflict do nothing;

alter table ajustes enable row level security;
drop policy if exists site_le_ajustes on ajustes;
drop policy if exists dono_ajustes on ajustes;
create policy site_le_ajustes on ajustes for select to anon using (publico);
create policy dono_ajustes    on ajustes for all to authenticated using (is_dono()) with check (is_dono());

-- ---------------- Atendimento automático (robô do WhatsApp) ----------------
alter table wa_conversas add column if not exists bot_etapa text;              -- menu | aguardando_processo | humano…
alter table wa_conversas add column if not exists bot_atualizado_em timestamptz;
alter table wa_conversas add column if not exists humano_ate timestamptz;      -- até quando o robô fica em silêncio
alter table wa_mensagens add column if not exists bot boolean not null default false;
insert into ajustes (chave, publico) values ('atendimento', false) on conflict do nothing;

-- ---------------- Aviso por e-mail a cada pedido novo ----------------
-- O banco chama a função "aviso-lead" (Edge Function) quando entra um lead.
-- A função relê o lead e só manda e-mail se ele for novo e ainda não avisado.
alter table leads add column if not exists aviso_enviado_em timestamptz;
create extension if not exists pg_net with schema extensions;

create or replace function avisar_lead_novo() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://ywlnsaypcghizwyhaual.supabase.co/functions/v1/aviso-lead',
    body := jsonb_build_object('record', jsonb_build_object('id', new.id)),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
exception when others then
  return new; -- o aviso nunca impede o pedido de ser gravado
end $$;

drop trigger if exists aviso_lead_novo on leads;
create trigger aviso_lead_novo after insert on leads for each row execute function avisar_lead_novo();

-- ---------------- Prospecção (advogados e escritórios para abordar) ----------------
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null,                  -- advogado(a) ou escritório
  escritorio text,
  cidade text,
  area text default 'Trabalhista',
  whatsapp text,
  email text,
  site text,
  instagram text,
  linkedin text,
  maps text,                           -- link do Google Maps
  oab text,
  fonte text,                          -- Google Maps, Instagram, indicação…
  status text not null default 'a_contatar', -- a_contatar | contatado | respondeu | interessado | cliente | sem_interesse | nao_contatar
  tentativas int not null default 0,
  ultimo_contato timestamptz,
  proximo_contato date,
  obs text,
  lead_id uuid references leads(id) on delete set null,
  cliente_id uuid references clientes(id) on delete set null
);
alter table prospects enable row level security;
drop policy if exists dono_prospects on prospects;
create policy dono_prospects on prospects for all to authenticated using (is_dono()) with check (is_dono());
insert into ajustes (chave, publico) values ('prospeccao', false) on conflict do nothing;
