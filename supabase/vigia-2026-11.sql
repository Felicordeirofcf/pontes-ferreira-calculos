-- 🛡 Vigia da captação (painel > Vigia da captação).
-- Chama a função "vigia" a cada 30 minutos, o dia todo. A própria função decide o que verificar e
-- quando pode mandar aviso no seu WhatsApp (regras no painel). A chave abaixo é a chave pública (anon) do site.
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('pf-vigia') where exists (select 1 from cron.job where jobname = 'pf-vigia');
select cron.schedule('pf-vigia', '*/30 * * * *', $cron$
  select net.http_post(url := 'https://ywlnsaypcghizwyhaual.supabase.co/functions/v1/vigia',
    body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3bG5zYXlwY2doaXp3eWhhdWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MjIwNzgsImV4cCI6MjEwOTk5ODA3OH0.rD8ZAHchKudQjxTAOohOv1g84rCE83l0MRoutzEFBJE"}'::jsonb,
    timeout_milliseconds := 60000);
$cron$);
