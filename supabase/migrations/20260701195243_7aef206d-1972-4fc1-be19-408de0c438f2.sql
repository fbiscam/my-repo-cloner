CREATE TABLE public.voice_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  reply TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX voice_history_user_created_idx ON public.voice_history(user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.voice_history TO authenticated;
GRANT ALL ON public.voice_history TO service_role;
ALTER TABLE public.voice_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_select" ON public.voice_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON public.voice_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_delete" ON public.voice_history FOR DELETE TO authenticated USING (auth.uid() = user_id);