ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS index_status JSONB;

CREATE INDEX IF NOT EXISTS insights_indexed_at_idx ON public.insights (indexed_at);