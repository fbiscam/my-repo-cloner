
CREATE TABLE public.cookie_consents (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK (choice IN ('accepted','rejected')),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cookie_consents TO authenticated;
GRANT ALL ON public.cookie_consents TO service_role;
ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own consent" ON public.cookie_consents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER cookie_consents_updated_at BEFORE UPDATE ON public.cookie_consents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
