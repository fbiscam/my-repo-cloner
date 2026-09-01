-- Revoke direct execution of the helper from client roles so it can only be
-- used internally by the profiles policy / service_role.
REVOKE EXECUTE ON FUNCTION public.current_profile_plan(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.current_profile_plan(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.current_profile_plan(uuid) TO service_role;
