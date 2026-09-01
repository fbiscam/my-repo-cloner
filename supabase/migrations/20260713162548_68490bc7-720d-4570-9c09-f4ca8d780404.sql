ALTER TABLE public.trade_journal
  ADD COLUMN IF NOT EXISTS tp1_hit_at timestamptz,
  ADD COLUMN IF NOT EXISTS tp2_hit_at timestamptz;