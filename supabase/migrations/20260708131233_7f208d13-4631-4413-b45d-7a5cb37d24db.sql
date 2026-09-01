REVOKE EXECUTE ON FUNCTION public.user_has_plan_feature(uuid, text) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_plan_feature(uuid, text) TO service_role;