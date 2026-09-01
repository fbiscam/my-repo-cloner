
CREATE TABLE public.signup_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.signup_attempts TO service_role;
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX signup_attempts_ip_created_idx ON public.signup_attempts (ip, created_at DESC);
