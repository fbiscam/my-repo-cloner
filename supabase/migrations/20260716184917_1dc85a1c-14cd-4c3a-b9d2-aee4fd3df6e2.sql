
ALTER TABLE public.founding_applications
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS documents_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS documents_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS documents_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS documents_rejected_reason text,
  ADD COLUMN IF NOT EXISTS documents_note text;

DO $$ BEGIN
  ALTER TABLE public.founding_applications
    ADD CONSTRAINT founding_applications_document_status_check
    CHECK (document_status = ANY (ARRAY['not_submitted','received','pending','verified','rejected']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Users can view own application by email" ON public.founding_applications;
CREATE POLICY "Users can view own application by email"
  ON public.founding_applications FOR SELECT
  TO authenticated
  USING (lower(email) = lower((auth.jwt() ->> 'email')));
