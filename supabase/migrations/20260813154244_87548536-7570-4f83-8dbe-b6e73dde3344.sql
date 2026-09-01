REVOKE EXECUTE ON FUNCTION public.expire_pro_trials() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_pro_trial(uuid, text) FROM anon, authenticated;