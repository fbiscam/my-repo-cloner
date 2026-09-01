ALTER TABLE public.saved_signals
  ALTER COLUMN alert_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS snapshot jsonb;