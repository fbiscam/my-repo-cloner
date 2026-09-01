
-- 1) auto_scan_state: pending confirmation per pair
CREATE TABLE public.auto_scan_state (
  pair TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
  first_conf NUMERIC NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_broadcast_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.auto_scan_state TO service_role;
GRANT SELECT ON public.auto_scan_state TO authenticated;
ALTER TABLE public.auto_scan_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read auto_scan_state" ON public.auto_scan_state
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2) auto_scan_pool_ledger: $0.10 per broadcast (system cost tracking)
CREATE TABLE public.auto_scan_pool_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL,
  direction TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  alert_id UUID,
  broadcast_count INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC NOT NULL DEFAULT 0.10,
  ai_cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.auto_scan_pool_ledger TO service_role;
GRANT SELECT ON public.auto_scan_pool_ledger TO authenticated;
ALTER TABLE public.auto_scan_pool_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read auto_scan_pool_ledger" ON public.auto_scan_pool_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX auto_scan_pool_ledger_created_idx ON public.auto_scan_pool_ledger (created_at DESC);

-- 3) system_settings: admin-controlled flags
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.system_settings TO service_role;
GRANT SELECT ON public.system_settings TO authenticated;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read system_settings" ON public.system_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update system_settings" ON public.system_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed defaults: auto-scan ON, 60min cooldown, confirm 45min, 8/day cap
INSERT INTO public.system_settings (key, value) VALUES
  ('auto_scan_enabled', '{"enabled": true}'::jsonb),
  ('auto_scan_config', '{"pairs":["XAUUSD","GBPUSD","EURUSD","US30","NAS100"],"min_conf":59,"confirm_window_min":45,"cooldown_min":60,"max_broadcasts_per_day":8,"news_skip_min":30}'::jsonb)
ON CONFLICT (key) DO NOTHING;
