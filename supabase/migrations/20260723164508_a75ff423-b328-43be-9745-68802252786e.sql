-- Tighten signal_alert_subscribers INSERT policy: no more anonymous email inserts.
-- All legitimate subscriptions flow through the subscribeToAlerts server function,
-- which uses the service role. Client inserts (if any) must be authenticated and
-- can only insert their own auth email tied to their own user_id.
DROP POLICY IF EXISTS signal_alert_subscribers_public_insert ON public.signal_alert_subscribers;

CREATE POLICY signal_alert_subscribers_authenticated_self_insert
ON public.signal_alert_subscribers
FOR INSERT
TO authenticated
WITH CHECK (
  email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND user_id = auth.uid()
  AND lower(email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
);

-- Anon INSERT is no longer permitted at the RLS layer.
REVOKE INSERT ON public.signal_alert_subscribers FROM anon;