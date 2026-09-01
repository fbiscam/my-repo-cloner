
-- 1. Newsletter subscribers table
CREATE TABLE public.newsletter_subscribers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed')),
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Force lowercase emails
CREATE OR REPLACE FUNCTION public.lowercase_subscriber_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.email = lower(trim(NEW.email));
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_newsletter_subscribers_normalize
BEFORE INSERT OR UPDATE ON public.newsletter_subscribers
FOR EACH ROW EXECUTE FUNCTION public.lowercase_subscriber_email();

-- 2. GRANTs — anyone can subscribe; only service_role can read/manage
GRANT INSERT ON public.newsletter_subscribers TO anon, authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;

-- 3. RLS
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe"
ON public.newsletter_subscribers
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- No SELECT / UPDATE / DELETE policies → emails are private; only service_role bypasses RLS.

-- 4. Track when an article notification has been sent
ALTER TABLE public.insights ADD COLUMN IF NOT EXISTS notified_at timestamptz;
