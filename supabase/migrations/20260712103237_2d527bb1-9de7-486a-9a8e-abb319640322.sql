
UPDATE public.plans
SET feature_journal = true,
    feature_full_ict = true,
    feature_scanner = true,
    feature_realtime_alerts = false
WHERE id = 'free';

CREATE TABLE IF NOT EXISTS public.account_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip text,
  fingerprint text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_devices_ip_idx ON public.account_devices(ip);
CREATE INDEX IF NOT EXISTS account_devices_fp_idx ON public.account_devices(fingerprint);
CREATE INDEX IF NOT EXISTS account_devices_user_idx ON public.account_devices(user_id);

GRANT ALL ON public.account_devices TO service_role;
ALTER TABLE public.account_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.account_devices FOR ALL USING (false) WITH CHECK (false);
