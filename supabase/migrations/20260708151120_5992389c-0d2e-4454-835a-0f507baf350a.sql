CREATE TABLE public.email_change_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_email TEXT NOT NULL,
  new_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ecr_user ON public.email_change_requests(user_id);
GRANT ALL ON public.email_change_requests TO service_role;
ALTER TABLE public.email_change_requests ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (server functions using supabaseAdmin) access this table.