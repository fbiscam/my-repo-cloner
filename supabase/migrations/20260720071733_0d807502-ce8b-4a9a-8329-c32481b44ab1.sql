-- Paper-trading table: observational log of every qualifying signal
CREATE TABLE public.signal_paper_trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pair text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('BUY','SELL')),
  entry numeric NOT NULL,
  sl numeric NOT NULL,
  tp numeric NOT NULL,
  rr numeric,
  confidence integer NOT NULL,
  setup_score integer,
  grade text,
  htf_bias text,
  killzone text,
  session text,
  gates jsonb NOT NULL DEFAULT '{}'::jsonb,
  broadcast_alert_id uuid,
  fired_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  outcome text CHECK (outcome IN ('pending','win','loss','timeout')) DEFAULT 'pending',
  realized_r numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.signal_paper_trades TO authenticated;
GRANT ALL ON public.signal_paper_trades TO service_role;

ALTER TABLE public.signal_paper_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read paper trades"
  ON public.signal_paper_trades
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_paper_trades_pair_fired ON public.signal_paper_trades(pair, fired_at DESC);
CREATE INDEX idx_paper_trades_outcome ON public.signal_paper_trades(outcome, fired_at DESC);
CREATE INDEX idx_paper_trades_grade ON public.signal_paper_trades(grade, fired_at DESC);