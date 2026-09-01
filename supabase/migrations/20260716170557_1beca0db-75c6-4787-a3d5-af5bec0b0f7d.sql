
CREATE TABLE public.founding_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT,
  broker TEXT,
  experience_years INT,
  monthly_volume_usd NUMERIC,
  why_joining TEXT,
  myfxbook_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','waitlisted','active','graduated')),
  seat_month TEXT,
  admin_notes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  approved_at TIMESTAMPTZ,
  first_profit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX founding_apps_email_lower_idx ON public.founding_applications (lower(email));
CREATE INDEX founding_apps_status_idx ON public.founding_applications (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.founding_applications TO authenticated;
GRANT INSERT ON public.founding_applications TO anon;
GRANT ALL ON public.founding_applications TO service_role;

ALTER TABLE public.founding_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can apply"
  ON public.founding_applications FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view all applications"
  ON public.founding_applications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update applications"
  ON public.founding_applications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete applications"
  ON public.founding_applications FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER founding_applications_updated_at
  BEFORE UPDATE ON public.founding_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
