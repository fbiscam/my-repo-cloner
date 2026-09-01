DO $$
DECLARE _secret text;
BEGIN
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';
  IF _secret IS NULL THEN RETURN; END IF;

  BEGIN PERFORM cron.unschedule('reindex-insights-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule(
    'reindex-insights-weekly',
    '0 3 * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/reindex-insights',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
        body := '{}'::jsonb
      );
    $cmd$, _secret)
  );

  -- Fire once now to backfill existing articles
  PERFORM net.http_post(
    url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/reindex-insights?limit=500',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', _secret),
    body := '{}'::jsonb
  );
END $$;