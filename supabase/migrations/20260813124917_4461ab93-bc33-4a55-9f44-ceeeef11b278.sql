CREATE TABLE IF NOT EXISTS public.news_event_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  title text NOT NULL,
  country text,
  impact text,
  event_at timestamptz,
  recipients integer NOT NULL DEFAULT 0,
  emails_enqueued integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.news_event_notifications TO service_role;
GRANT SELECT ON public.news_event_notifications TO authenticated;

ALTER TABLE public.news_event_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read news event notifications" ON public.news_event_notifications;
CREATE POLICY "Admins can read news event notifications"
ON public.news_event_notifications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

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

  BEGIN PERFORM cron.unschedule('news-alerts-15min'); EXCEPTION WHEN OTHERS THEN NULL; END;

  _cmd := format($cmd$
    SELECT net.http_post(
      url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/news-alerts',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', %L
      ),
      body := '{}'::jsonb
    );
  $cmd$, _secret);

  PERFORM cron.schedule('news-alerts-15min', '*/15 * * * *', _cmd);
END $$;