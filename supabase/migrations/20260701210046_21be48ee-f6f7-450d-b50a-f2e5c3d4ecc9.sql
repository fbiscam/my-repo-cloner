REVOKE ALL ON FUNCTION public.user_has_plan_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_plan_feature(uuid, text) TO authenticated, service_role;