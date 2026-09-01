
-- Killzone session enum
DO $$ BEGIN
  CREATE TYPE public.killzone_session AS ENUM ('london', 'new_york', 'asia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.killzone_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session public.killzone_session NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT,
  script TEXT NOT NULL,
  transcript TEXT NOT NULL,
  audio_path TEXT,
  audio_duration_seconds INTEGER,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_public BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX killzone_briefs_published_idx ON public.killzone_briefs (published_at DESC);
CREATE INDEX killzone_briefs_public_idx ON public.killzone_briefs (is_public, published_at DESC);

GRANT SELECT ON public.killzone_briefs TO anon;
GRANT SELECT ON public.killzone_briefs TO authenticated;
GRANT ALL ON public.killzone_briefs TO service_role;

ALTER TABLE public.killzone_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view public briefs"
  ON public.killzone_briefs FOR SELECT
  USING (is_public = true);

CREATE POLICY "Service role manages briefs"
  ON public.killzone_briefs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER killzone_briefs_updated_at
  BEFORE UPDATE ON public.killzone_briefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for the private 'briefs' bucket
CREATE POLICY "Service role manages brief audio"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'briefs') WITH CHECK (bucket_id = 'briefs');
