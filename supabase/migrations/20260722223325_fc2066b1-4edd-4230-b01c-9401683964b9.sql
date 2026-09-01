
-- Fingerprint helper
CREATE OR REPLACE FUNCTION public.error_fingerprint(_message text, _stack text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(
    coalesce(regexp_replace(_message, '\d+', 'N', 'g'), '')
    || '|' ||
    coalesce(substring(regexp_replace(_stack, 'https?://[^\s)]+', '', 'g') from 1 for 200), ''),
    'sha256'
  ), 'hex')
$$;

-- ==== error_log ====
CREATE TABLE public.error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  fingerprint text NOT NULL,
  source text NOT NULL DEFAULT 'client', -- client | server | cron
  mechanism text,                          -- onerror | unhandledrejection | manual | react_error_boundary | server_fn | route_handler
  severity text NOT NULL DEFAULT 'error', -- error | warning | info
  route text,
  user_id uuid,
  user_email text,
  message text NOT NULL,
  stack text,
  user_agent text,
  request_ip text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX error_log_fp_idx ON public.error_log (fingerprint, created_at DESC);
CREATE INDEX error_log_created_idx ON public.error_log (created_at DESC);

GRANT SELECT ON public.error_log TO authenticated;
GRANT ALL   ON public.error_log TO service_role;

ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read errors" ON public.error_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No public INSERT policy: writes always go through the SECURITY DEFINER
-- server function log_error() below, so callers can't spam arbitrary rows.

-- ==== error_group ====
CREATE TABLE public.error_group (
  fingerprint text PRIMARY KEY,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  sample_message text NOT NULL,
  sample_route text,
  sample_stack text,
  status text NOT NULL DEFAULT 'open', -- open | investigating | resolved | ignored
  severity text NOT NULL DEFAULT 'error',
  ai_root_cause text,
  ai_suggested_fix text,
  ai_analyzed_at timestamptz,
  ai_model text,
  telegram_notified_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);

CREATE INDEX error_group_last_seen_idx ON public.error_group (last_seen DESC);
CREATE INDEX error_group_status_idx ON public.error_group (status, last_seen DESC);

GRANT SELECT, UPDATE ON public.error_group TO authenticated;
GRANT ALL ON public.error_group TO service_role;

ALTER TABLE public.error_group ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read groups" ON public.error_group
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update groups" ON public.error_group
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ==== log function (SECURITY DEFINER — bypasses lack of insert policy) ====
CREATE OR REPLACE FUNCTION public.log_error(
  _message text,
  _stack text DEFAULT NULL,
  _route text DEFAULT NULL,
  _source text DEFAULT 'client',
  _mechanism text DEFAULT NULL,
  _severity text DEFAULT 'error',
  _user_agent text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _fp text;
  _uid uuid := auth.uid();
  _email text;
  _id uuid;
  _msg text := coalesce(nullif(trim(_message), ''), 'unknown error');
BEGIN
  IF length(_msg) > 4000 THEN _msg := substring(_msg from 1 for 4000); END IF;
  _fp := public.error_fingerprint(_msg, coalesce(_stack, ''));

  IF _uid IS NOT NULL THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
  END IF;

  INSERT INTO public.error_log (
    fingerprint, source, mechanism, severity, route, user_id, user_email,
    message, stack, user_agent, metadata
  ) VALUES (
    _fp, coalesce(_source,'client'), _mechanism, coalesce(_severity,'error'),
    _route, _uid, _email, _msg,
    nullif(_stack, ''), _user_agent, coalesce(_metadata, '{}'::jsonb)
  ) RETURNING id INTO _id;

  INSERT INTO public.error_group (
    fingerprint, sample_message, sample_route, sample_stack, severity
  ) VALUES (_fp, _msg, _route, _stack, coalesce(_severity,'error'))
  ON CONFLICT (fingerprint) DO UPDATE
    SET last_seen = now(),
        occurrences = public.error_group.occurrences + 1,
        sample_route = coalesce(EXCLUDED.sample_route, public.error_group.sample_route),
        status = CASE
          WHEN public.error_group.status = 'resolved' THEN 'open'
          ELSE public.error_group.status
        END;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_error(text, text, text, text, text, text, text, jsonb) TO anon, authenticated, service_role;
