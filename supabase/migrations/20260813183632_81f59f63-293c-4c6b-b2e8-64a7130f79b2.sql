REVOKE EXECUTE ON FUNCTION public.expire_pro_trials() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_pro_trial(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_plan_self_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_pro_trials() TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_pro_trial(uuid, text) TO service_role;