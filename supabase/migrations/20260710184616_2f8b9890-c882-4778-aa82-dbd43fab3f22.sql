DROP VIEW IF EXISTS public.v_scan_charge_mismatches;
CREATE VIEW public.v_scan_charge_mismatches
WITH (security_invoker = true) AS
SELECT scan_id, user_id, count(*) AS charge_count, sum(amount) AS total_amount,
  array_agg(reason ORDER BY created_at) AS reasons,
  array_agg(source ORDER BY created_at) AS sources,
  array_agg(caller ORDER BY created_at) AS callers,
  min(created_at) AS first_at, max(created_at) AS last_at
FROM public.credit_charge_audit
WHERE scan_id IS NOT NULL
GROUP BY scan_id, user_id
HAVING count(*) > 1;
REVOKE ALL ON public.v_scan_charge_mismatches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_scan_charge_mismatches TO service_role;