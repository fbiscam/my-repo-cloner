ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS indexed_at timestamptz;
ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS index_status jsonb;