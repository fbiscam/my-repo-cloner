
-- Documents table: earning proof files uploaded by founding applicants
CREATE TABLE IF NOT EXISTS public.founding_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.founding_applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  original_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS founding_documents_app_idx ON public.founding_documents(application_id);
CREATE INDEX IF NOT EXISTS founding_documents_user_idx ON public.founding_documents(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.founding_documents TO authenticated;
GRANT ALL ON public.founding_documents TO service_role;

ALTER TABLE public.founding_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON public.founding_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own documents"
  ON public.founding_documents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own documents"
  ON public.founding_documents FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update documents"
  ON public.founding_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage RLS: users manage their own folder (user_id/*); admins read all
CREATE POLICY "Users upload own founding docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'founding-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users read own founding docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'founding-docs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Users delete own founding docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'founding-docs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
  );
