DROP POLICY IF EXISTS signal_alert_subscribers_public_insert ON public.signal_alert_subscribers;

CREATE POLICY signal_alert_subscribers_public_insert
ON public.signal_alert_subscribers
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (user_id IS NULL OR user_id = auth.uid())
);