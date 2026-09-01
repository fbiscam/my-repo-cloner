-- Add missing Data API GRANTs for referral tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

GRANT SELECT ON public.referral_codes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;

-- Ensure the SECURITY DEFINER RPCs are executable from the app
GRANT EXECUTE ON FUNCTION public.get_or_create_referral_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_referral(uuid) TO authenticated, service_role;