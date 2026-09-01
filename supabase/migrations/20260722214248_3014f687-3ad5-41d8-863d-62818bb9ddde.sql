
CREATE TABLE IF NOT EXISTS public.signal_confidence_memory (
  pair text NOT NULL,
  direction text NOT NULL,
  smoothed_conf numeric NOT NULL,
  raw_conf numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pair, direction)
);

GRANT ALL ON public.signal_confidence_memory TO service_role;

ALTER TABLE public.signal_confidence_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages confidence memory"
  ON public.signal_confidence_memory FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
