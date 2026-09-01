ALTER TABLE public.signal_paper_trades
  ADD COLUMN IF NOT EXISTS reversal_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_paper_trades_watch
  ON public.signal_paper_trades (fired_at DESC)
  WHERE outcome = 'pending' AND reversal_notified_at IS NULL;