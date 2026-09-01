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

  BEGIN PERFORM cron.unschedule('scan-gold-signals'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('auto-scan-15min'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('auto-scan-5min'); EXCEPTION WHEN OTHERS THEN NULL; END;

  _cmd := format($cmd$
    SELECT net.http_post(
      url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/auto-scan',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
      body := '{}'::jsonb
    );
  $cmd$, _secret);

  PERFORM cron.schedule('auto-scan-5min', '*/5 * * * 1-5', _cmd);
END $$;

UPDATE public.system_settings
SET value = jsonb_build_object(
  'pairs', jsonb_build_array('XAUUSD','XAUEUR','XAUGBP','XAUJPY','XAUAUD','XAUCHF'),
  'min_conf', 70,
  'confirm_window_min', COALESCE((value->>'confirm_window_min')::int, 45),
  'cooldown_min', COALESCE((value->>'cooldown_min')::int, 60),
  'same_direction_lock_min', COALESCE((value->>'same_direction_lock_min')::int, 240),
  'max_broadcasts_per_day', COALESCE((value->>'max_broadcasts_per_day')::int, 30),
  'news_pause_min', COALESCE((value->>'news_pause_min')::int, COALESCE((value->>'news_skip_min')::int, 30))
),
updated_at = now()
WHERE key = 'auto_scan_config';

CREATE OR REPLACE FUNCTION public.admin_auto_scan_cron_history()
RETURNS TABLE (
  runid bigint,
  jobid bigint,
  job_pid integer,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT r.runid, r.jobid, r.job_pid, r.status, r.return_message, r.start_time, r.end_time
    FROM cron.job_run_details r
    JOIN cron.job j ON j.jobid = r.jobid
    WHERE j.jobname IN ('auto-scan-5min', 'auto-scan-15min', 'scan-gold-signals')
    ORDER BY r.start_time DESC
    LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_auto_scan_cron_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auto_scan_cron_history() TO authenticated;