-- Ensure the helper function is not directly callable from the client API.
-- It is intended only for internal policy use and service-role admin flows.
REVOKE EXECUTE ON FUNCTION public.current_profile_plan(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_profile_plan(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.current_profile_plan(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.current_profile_plan(uuid) TO service_role;
