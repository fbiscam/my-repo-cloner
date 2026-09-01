
CREATE TABLE public.signal_locks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
  entry_px NUMERIC NOT NULL,
  sl_px NUMERIC NOT NULL,
  signal JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, instrument, timeframe)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_locks TO authenticated;
GRANT ALL ON public.signal_locks TO service_role;

ALTER TABLE public.signal_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own signal locks"
  ON public.signal_locks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_signal_locks_expires ON public.signal_locks(expires_at);
