-- AP-16-06-03: infrastructure-only trigger; URL and bearer token are provisioned in Vault.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $migration$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'conversation-cycle-recovery'
  loop
    perform cron.unschedule(existing_job);
  end loop;

  perform cron.schedule(
    'conversation-cycle-recovery',
    '*/5 * * * *',
    $request$
      select net.http_post(
        url := rtrim(url_secret.decrypted_secret, '/') || '/api/internal/conversation-cycles/recovery',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || auth_secret.decrypted_secret,
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )
      from vault.decrypted_secrets as url_secret
      cross join vault.decrypted_secrets as auth_secret
      where url_secret.name = 'KLIMAGUY_PRODUCTION_BASE_URL'
        and auth_secret.name = 'CONVERSATION_CYCLE_RECOVERY_SECRET'
        and url_secret.decrypted_secret ~ '^https://[^/?#]+(?:[.][^/?#]+)+$'
        and auth_secret.decrypted_secret <> ''
    $request$
  );
end
$migration$;
