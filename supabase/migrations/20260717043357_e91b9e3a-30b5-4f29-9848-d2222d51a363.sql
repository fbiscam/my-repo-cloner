ALTER TABLE public.founding_applications
  ADD COLUMN IF NOT EXISTS documents_info_request text,
  ADD COLUMN IF NOT EXISTS documents_info_requested_at timestamptz;