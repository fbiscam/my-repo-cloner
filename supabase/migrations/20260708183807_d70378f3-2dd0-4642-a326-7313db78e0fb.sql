REVOKE EXECUTE ON FUNCTION public.convert_referral(uuid) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.convert_referral(uuid) TO service_role;