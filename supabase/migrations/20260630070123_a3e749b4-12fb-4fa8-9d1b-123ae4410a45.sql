
CREATE TABLE IF NOT EXISTS public.insight_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL UNIQUE,
  angle text,
  category text NOT NULL DEFAULT 'Education',
  priority int NOT NULL DEFAULT 5,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.insight_topics TO service_role;
ALTER TABLE public.insight_topics ENABLE ROW LEVEL SECURITY;
-- no policies: only service_role (server engine) touches this table
