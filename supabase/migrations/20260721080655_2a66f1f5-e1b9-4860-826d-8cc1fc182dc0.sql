
ALTER TABLE public.signal_alerts
  ADD COLUMN IF NOT EXISTS markings jsonb,
  ADD COLUMN IF NOT EXISTS swings jsonb,
  ADD COLUMN IF NOT EXISTS structure jsonb,
  ADD COLUMN IF NOT EXISTS narration jsonb;
