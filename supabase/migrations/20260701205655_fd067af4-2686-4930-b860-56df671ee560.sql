
DROP POLICY IF EXISTS signal_alerts_public_read ON public.signal_alerts;
REVOKE SELECT ON public.signal_alerts FROM anon;

CREATE POLICY signal_alerts_paid_read ON public.signal_alerts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND p.feature_realtime_alerts = true
    )
  );
