DO $$
DECLARE
  _secret text;
  _cmd text;
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret';

  IF _secret IS NULL THEN
    RETURN;
  END IF;

  BEGIN PERFORM cron.unschedule('auto-scan-5min'); EXCEPTION WHEN OTHERS THEN NULL; END;

  _cmd := format($cmd$
    SELECT net.http_post(
      url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/auto-scan',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', %L,
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1dWRkcnF2bmp3b3Jmcmhhc2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzIzOTEsImV4cCI6MjA5ODMwODM5MX0.wG7--PrCNB8687TLNoNyVamXkI5FO4Z_SsQYTIZbfgU'
      ),
      body := '{}'::jsonb
    );
  $cmd$, _secret);

  PERFORM cron.schedule('auto-scan-5min', '*/5 * * * 1-5', _cmd);
END $$;