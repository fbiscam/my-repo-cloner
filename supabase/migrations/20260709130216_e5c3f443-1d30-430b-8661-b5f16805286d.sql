
CREATE TABLE public.credit_charge_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  scan_id text,
  reason text NOT NULL,
  amount integer NOT NULL,
  balance_after integer,
  source text NOT NULL,
  caller text,
  symbol text,
  user_agent text,
  request_ip text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credit_charge_audit_user_created_idx ON public.credit_charge_audit (user_id, created_at DESC);
CREATE INDEX credit_charge_audit_scan_idx ON public.credit_charge_audit (scan_id) WHERE scan_id IS NOT NULL;
CREATE INDEX credit_charge_audit_reason_idx ON public.credit_charge_audit (reason, created_at DESC);

GRANT SELECT ON public.credit_charge_audit TO authenticated;
GRANT ALL ON public.credit_charge_audit TO service_role;

ALTER TABLE public.credit_charge_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all charge audits"
  ON public.credit_charge_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Helper: writes an audit row. SECURITY DEFINER so any authenticated caller
-- can log its own charge context; the row is always attributed to _user_id.
CREATE OR REPLACE FUNCTION public.log_charge_audit(
  _user_id uuid,
  _reason text,
  _amount integer,
  _balance_after integer,
  _source text,
  _caller text,
  _scan_id text,
  _symbol text,
  _user_agent text,
  _request_ip text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.credit_charge_audit
    (user_id, scan_id, reason, amount, balance_after, source, caller, symbol, user_agent, request_ip, metadata)
  VALUES
    (_user_id, _scan_id, _reason, _amount, _balance_after, _source, _caller, _symbol, _user_agent, _request_ip, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_charge_audit(uuid,text,integer,integer,text,text,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_charge_audit(uuid,text,integer,integer,text,text,text,text,text,text,jsonb) TO authenticated, service_role;

-- Admin view: any scan_id that generated more than one deduction row
CREATE OR REPLACE VIEW public.v_scan_charge_mismatches AS
SELECT
  scan_id,
  user_id,
  COUNT(*) AS charge_count,
  SUM(amount) AS total_amount,
  ARRAY_AGG(reason ORDER BY created_at) AS reasons,
  ARRAY_AGG(source ORDER BY created_at) AS sources,
  ARRAY_AGG(caller ORDER BY created_at) AS callers,
  MIN(created_at) AS first_at,
  MAX(created_at) AS last_at
FROM public.credit_charge_audit
WHERE scan_id IS NOT NULL
GROUP BY scan_id, user_id
HAVING COUNT(*) > 1;

GRANT SELECT ON public.v_scan_charge_mismatches TO authenticated;
