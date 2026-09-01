ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS alerts_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS saved_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS journal_last_seen_at TIMESTAMPTZ;