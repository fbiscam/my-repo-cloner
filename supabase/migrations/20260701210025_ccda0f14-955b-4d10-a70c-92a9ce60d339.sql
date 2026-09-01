
-- 1. Store CRON_SECRET in vault (readable by SECURITY DEFINER functions & pg_cron jobs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    UPDATE vault.secrets SET secret = '78102da0a873fdb0ef66cee2652e7470ee80d369843a8de675f6cb10d5256d0a' WHERE name = 'cron_secret';
  ELSE
    PERFORM vault.create_secret('78102da0a873fdb0ef66cee2652e7470ee80d369843a8de675f6cb10d5256d0a', 'cron_secret');
  END IF;
END $$;

-- 2. Lock down search_path on email queue helper functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

-- 3. Update the insight trigger to send x-cron-secret header (not the anon apikey)
CREATE OR REPLACE FUNCTION public.notify_subscribers_on_insight()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _secret text;
BEGIN
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';
  PERFORM net.http_post(
    url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/notify-subscribers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _secret
    ),
    body := jsonb_build_object('slug', NEW.slug, 'id', NEW.id::text)
  );
  RETURN NEW;
END;
$function$;

-- 4. Reschedule cron jobs to send x-cron-secret (dynamic SQL reads secret at schedule time)
DO $$
DECLARE _secret text; _cmd text;
BEGIN
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  PERFORM cron.unschedule('scan-gold-signals');
  _cmd := format($f$
    SELECT net.http_post(
      url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/scan-signals',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
      body := '{"pair":"XAUUSD"}'::jsonb
    );
  $f$, _secret);
  PERFORM cron.schedule('scan-gold-signals', '*/15 * * * 1-5', _cmd);

  PERFORM cron.unschedule('jenvu-generate-insight-morning');
  _cmd := format($f$
    SELECT net.http_post(
      url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/generate-insight',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
      body := '{}'::jsonb
    );
  $f$, _secret);
  PERFORM cron.schedule('jenvu-generate-insight-morning', '0 9 * * *', _cmd);

  PERFORM cron.unschedule('jenvu-generate-insight-evening');
  PERFORM cron.schedule('jenvu-generate-insight-evening', '0 17 * * *', _cmd);
END $$;

-- 5. Plan-feature helper
CREATE OR REPLACE FUNCTION public.user_has_plan_feature(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
     WHERE s.user_id = _user_id
       AND s.status = 'active'
       AND (
         (_feature = 'feature_journal' AND p.feature_journal = true) OR
         (_feature = 'feature_realtime_alerts' AND p.feature_realtime_alerts = true)
       )
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_has_plan_feature(uuid, text) TO authenticated;

-- 6. Enforce plan feature at RLS layer for Trade Journal
DROP POLICY IF EXISTS "own journal" ON public.trade_journal;
CREATE POLICY "trade_journal_select_own"
  ON public.trade_journal FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "trade_journal_insert_paid"
  ON public.trade_journal FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.user_has_plan_feature(auth.uid(), 'feature_journal'));
CREATE POLICY "trade_journal_update_paid"
  ON public.trade_journal FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.user_has_plan_feature(auth.uid(), 'feature_journal'))
  WITH CHECK (auth.uid() = user_id AND public.user_has_plan_feature(auth.uid(), 'feature_journal'));
CREATE POLICY "trade_journal_delete_own"
  ON public.trade_journal FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 7. Enforce plan feature for Alert Preferences
DROP POLICY IF EXISTS "own prefs" ON public.alert_preferences;
CREATE POLICY "alert_prefs_select_own"
  ON public.alert_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "alert_prefs_insert_paid"
  ON public.alert_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.user_has_plan_feature(auth.uid(), 'feature_realtime_alerts'));
CREATE POLICY "alert_prefs_update_paid"
  ON public.alert_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.user_has_plan_feature(auth.uid(), 'feature_realtime_alerts'))
  WITH CHECK (auth.uid() = user_id AND public.user_has_plan_feature(auth.uid(), 'feature_realtime_alerts'));

-- 8. Restrict "service_role" policies to the service_role grantee explicitly (defense in depth)
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "svc_email_send_log_all" ON public.email_send_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "svc_email_send_state_all" ON public.email_send_state FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "svc_suppressed_emails_all" ON public.suppressed_emails FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
CREATE POLICY "svc_email_unsub_tokens_all" ON public.email_unsubscribe_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
