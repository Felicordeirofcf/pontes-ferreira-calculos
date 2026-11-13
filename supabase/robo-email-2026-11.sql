-- Robô de prospecção por e-mail (Prospecção > 🤖 Robô de e-mail no painel).
-- Agenda a chamada da função enviar-calculo-email a cada 15 minutos. A própria função só envia de segunda a sexta,
-- das 9h às 22h de Brasília, se o robô estiver LIGADO no painel, respeitando o limite diário e o intervalo.
-- A chave abaixo é a chave pública (anon) do site, a mesma que está em site/config.js.
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.
-- e-mails reserva achados no site do escritório: se o 1º voltar, o robô tenta o próximo
alter table prospects add column if not exists emails_alt text[];
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('pf-robo-email') where exists (select 1 from cron.job where jobname = 'pf-robo-email');
select cron.schedule('pf-robo-email', '*/15 * * * *', $cron$
  select net.http_post(url := 'https://ywlnsaypcghizwyhaual.supabase.co/functions/v1/enviar-calculo-email',
    body := '{"tipo":"robo"}'::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3bG5zYXlwY2doaXp3eWhhdWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MjIwNzgsImV4cCI6MjEwOTk5ODA3OH0.rD8ZAHchKudQjxTAOohOv1g84rCE83l0MRoutzEFBJE"}'::jsonb);
$cron$);
