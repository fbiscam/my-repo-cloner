
REVOKE ALL ON FUNCTION public.grant_credits(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spend_credits(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_credits() TO service_role;
