CREATE TABLE public.custom_auth_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup', 'recovery')),
  code_hash text NOT NULL,
  signup_password text,
  full_name text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recovery_link text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(email) BETWEEN 3 AND 255),
  CHECK (attempts >= 0)
);

GRANT ALL ON public.custom_auth_otps TO service_role;

ALTER TABLE public.custom_auth_otps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage custom auth codes"
ON public.custom_auth_otps
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_custom_auth_otps_lookup
ON public.custom_auth_otps (email, purpose, created_at DESC)
WHERE consumed_at IS NULL;

CREATE INDEX idx_custom_auth_otps_expires
ON public.custom_auth_otps (expires_at);

CREATE TRIGGER custom_auth_otps_updated_at
BEFORE UPDATE ON public.custom_auth_otps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();