-- ============ enums ============
DO $$ BEGIN
  CREATE TYPE public.lg_role AS ENUM ('admin','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ profiles ============
CREATE TABLE public.lg_profiles (
  user_id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  is_disabled BOOLEAN NOT NULL DEFAULT false,
  monthly_credit_limit NUMERIC(12,2) NOT NULL DEFAULT 150,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lg_profiles_email_key ON public.lg_profiles (lower(email));

-- ============ roles ============
CREATE TABLE public.lg_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.lg_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE public.lg_role_grants (
  email TEXT PRIMARY KEY,
  role public.lg_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.has_lg_role(_user_id UUID, _role public.lg_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.lg_user_roles WHERE user_id = _user_id AND role = _role)
      OR EXISTS (
        SELECT 1 FROM public.lg_role_grants g
        JOIN auth.users u ON lower(u.email) = lower(g.email)
        WHERE u.id = _user_id AND g.role = _role
      );
$$;

-- ============ lists ============
CREATE TABLE public.lg_lead_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lg_lead_lists_user_idx ON public.lg_lead_lists (user_id, created_at DESC);

-- ============ leads ============
CREATE TABLE public.lg_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  list_id UUID REFERENCES public.lg_lead_lists(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  name TEXT NOT NULL,
  title TEXT,
  company TEXT,
  category TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  socials JSONB NOT NULL DEFAULT '{}'::jsonb,
  rating NUMERIC(3,2),
  reviews INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  external_id TEXT,
  revealed BOOLEAN NOT NULL DEFAULT false,
  dedupe_key TEXT NOT NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lg_leads_dedupe_idx ON public.lg_leads (user_id, dedupe_key);
CREATE INDEX lg_leads_list_idx ON public.lg_leads (list_id);
CREATE INDEX lg_leads_user_idx ON public.lg_leads (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.lg_leads_status_check()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('new','contacted','replied','won','lost') THEN
    RAISE EXCEPTION 'invalid status %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;
CREATE TRIGGER lg_leads_status_trg BEFORE INSERT OR UPDATE ON public.lg_leads
FOR EACH ROW EXECUTE FUNCTION public.lg_leads_status_check();

-- ============ saved searches ============
CREATE TABLE public.lg_saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  label TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lg_saved_searches_user_idx ON public.lg_saved_searches (user_id, created_at DESC);

-- ============ usage ============
CREATE TABLE public.lg_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  credits NUMERIC(12,2) NOT NULL DEFAULT 0,
  ref_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lg_usage_user_idx ON public.lg_usage_events (user_id, created_at DESC);

-- ============ cache ============
CREATE TABLE public.lg_search_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lg_search_cache_expiry_idx ON public.lg_search_cache (expires_at);

-- ============ updated_at ============
CREATE TRIGGER lg_profiles_updated BEFORE UPDATE ON public.lg_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER lg_lists_updated BEFORE UPDATE ON public.lg_lead_lists
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ credit logic ============
CREATE OR REPLACE FUNCTION public.lg_credit_state(_user_id UUID DEFAULT NULL)
RETURNS TABLE(monthly_limit NUMERIC, used NUMERIC, remaining NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := COALESCE(_user_id, auth.uid()); _limit NUMERIC; _used NUMERIC;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF auth.uid() IS NOT NULL AND _uid <> auth.uid() AND NOT public.has_lg_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT monthly_credit_limit INTO _limit FROM public.lg_profiles WHERE user_id = _uid;
  _limit := COALESCE(_limit, 0);
  SELECT COALESCE(SUM(credits),0) INTO _used FROM public.lg_usage_events
   WHERE user_id = _uid AND created_at >= date_trunc('month', now());
  RETURN QUERY SELECT _limit, _used, GREATEST(_limit - _used, 0);
END $$;

CREATE OR REPLACE FUNCTION public.lg_charge_credits(_user_id UUID, _kind TEXT, _credits NUMERIC, _ref TEXT DEFAULT NULL, _meta JSONB DEFAULT '{}'::jsonb)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit NUMERIC; _used NUMERIC;
BEGIN
  IF _credits < 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  SELECT COALESCE(monthly_credit_limit,0) INTO _limit FROM public.lg_profiles WHERE user_id = _user_id FOR UPDATE;
  IF _limit IS NULL THEN RAISE EXCEPTION 'no_profile'; END IF;
  SELECT COALESCE(SUM(credits),0) INTO _used FROM public.lg_usage_events
   WHERE user_id = _user_id AND created_at >= date_trunc('month', now());
  IF _used + _credits > _limit THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
  INSERT INTO public.lg_usage_events (user_id, kind, credits, ref_id, meta)
  VALUES (_user_id, _kind, _credits, _ref, COALESCE(_meta,'{}'::jsonb));
  RETURN GREATEST(_limit - (_used + _credits), 0);
END $$;

-- ============ grants ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lg_lead_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lg_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lg_saved_searches TO authenticated;
GRANT SELECT ON public.lg_profiles TO authenticated;
GRANT SELECT ON public.lg_user_roles TO authenticated;
GRANT SELECT ON public.lg_usage_events TO authenticated;
GRANT ALL ON public.lg_profiles TO service_role;
GRANT ALL ON public.lg_user_roles TO service_role;
GRANT ALL ON public.lg_role_grants TO service_role;
GRANT ALL ON public.lg_lead_lists TO service_role;
GRANT ALL ON public.lg_leads TO service_role;
GRANT ALL ON public.lg_saved_searches TO service_role;
GRANT ALL ON public.lg_usage_events TO service_role;
GRANT ALL ON public.lg_search_cache TO service_role;

REVOKE ALL ON FUNCTION public.lg_charge_credits(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lg_charge_credits(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.lg_leads_status_check() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lg_credit_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lg_credit_state(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_lg_role(UUID, public.lg_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_lg_role(UUID, public.lg_role) TO authenticated, service_role;

-- ============ RLS ============
ALTER TABLE public.lg_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lg_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lg_role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lg_lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lg_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lg_saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lg_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lg_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY lg_profiles_self_read ON public.lg_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_lg_role(auth.uid(),'admin'));
CREATE POLICY lg_profiles_service ON public.lg_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY lg_roles_self_read ON public.lg_user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_lg_role(auth.uid(),'admin'));
CREATE POLICY lg_roles_service ON public.lg_user_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY lg_grants_service ON public.lg_role_grants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY lg_cache_service ON public.lg_search_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY lg_lists_owner ON public.lg_lead_lists FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_lg_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());
CREATE POLICY lg_lists_service ON public.lg_lead_lists FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY lg_leads_owner ON public.lg_leads FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_lg_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());
CREATE POLICY lg_leads_service ON public.lg_leads FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY lg_searches_owner ON public.lg_saved_searches FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_lg_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());
CREATE POLICY lg_searches_service ON public.lg_saved_searches FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY lg_usage_read ON public.lg_usage_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_lg_role(auth.uid(),'admin'));
CREATE POLICY lg_usage_service ON public.lg_usage_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- bootstrap first admin by email
INSERT INTO public.lg_role_grants (email, role) VALUES ('haseeb@jenvu.com','admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';