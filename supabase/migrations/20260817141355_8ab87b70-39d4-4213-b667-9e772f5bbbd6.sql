-- 1. Fix mutable search_path for SECURITY DEFINER functions with correct signatures
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- 2. Revoke public execute from sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.set_user_plan(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resync_all_credit_lots() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_pro_trials() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_user_plan(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resync_all_credit_lots() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_pro_trials() TO service_role;
