DROP POLICY IF EXISTS "Anyone can subscribe" ON public.signal_alert_subscribers;
REVOKE INSERT ON public.signal_alert_subscribers FROM anon;