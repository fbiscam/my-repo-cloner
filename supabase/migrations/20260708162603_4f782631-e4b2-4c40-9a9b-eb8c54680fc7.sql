
REVOKE ALL ON FUNCTION public.get_or_create_referral_code(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_referral_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.convert_referral(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_plan(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;
