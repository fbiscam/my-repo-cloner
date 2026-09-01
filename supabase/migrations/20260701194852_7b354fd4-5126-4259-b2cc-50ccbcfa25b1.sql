
-- Lock down internal cron dispatchers: no anon/authenticated EXECUTE
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;

-- Explicit service-role-only management policies for internal tables
CREATE POLICY "insight_topics_service_role_all" ON public.insight_topics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "newsletter_subscribers_service_role_all" ON public.newsletter_subscribers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "signal_alert_subscribers_service_role_all" ON public.signal_alert_subscribers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
