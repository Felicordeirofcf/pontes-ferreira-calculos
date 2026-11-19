-- Encerramento: desliga tudo o que roda sozinho. Os dados (leads, clientes, cálculos, prospecção) ficam guardados.
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.

-- 1) agendamentos (robô de e-mail, vigia, e-mails diário e semanal)
select cron.unschedule(jobname) from cron.job
where jobname in ('pf-robo-email', 'pf-vigia', 'pf-alertas-diarios', 'pf-relatorio-semanal');

-- 2) robôs desligados no painel (atendimento automático do WhatsApp, robô de e-mail e vigia)
update ajustes set valor = coalesce(valor, '{}'::jsonb) || '{"ativo": false}'::jsonb
where chave in ('atendimento', 'robo_email', 'vigia');

-- conferência: não deve sobrar nenhum agendamento do sistema
select jobname, schedule, active from cron.job where jobname like 'pf-%';
