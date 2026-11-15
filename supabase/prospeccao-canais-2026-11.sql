-- Prospecção: guarda por onde cada contato já foi abordado (evita mensagem duplicada e permite filtrar).
-- wa_contato_em = primeiro contato por WhatsApp/telefone · email_contato_em = primeiro e-mail de apresentação.
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.
alter table prospects add column if not exists wa_contato_em timestamptz;
alter table prospects add column if not exists email_contato_em timestamptz;

-- preenche o que já aconteceu: e-mails enviados pelo robô (sem os que voltaram)...
update prospects p set email_contato_em = x.em
from (
  select (e->>'id') as id, min((e->>'em')::timestamptz) as em
  from ajustes a, jsonb_array_elements(a.valor->'lista') e
  where a.chave = 'robo_email_log' and (e->>'ok')::boolean is true and coalesce((e->>'voltou')::boolean, false) is false
  group by 1
) x
where p.id::text = x.id and p.email_contato_em is null;

-- ...e abordagens anteriores pelo WhatsApp (quem já foi contatado e não recebeu e-mail do robô)
update prospects set wa_contato_em = ultimo_contato
where coalesce(tentativas, 0) > 0 and wa_contato_em is null and email_contato_em is null and whatsapp is not null and ultimo_contato is not null;
