-- Fix 1: Remove overly-permissive anon SELECT on referral_codes.
-- The client never reads referral_codes directly; code redemption goes through
-- the SECURITY DEFINER RPC public.apply_referral_code, which looks up a single
-- code at a time. Owners keep read access via the existing authenticated policy.
DROP POLICY IF EXISTS "codes are publicly resolvable" ON public.referral_codes;

-- Fix 2: Prevent unauthenticated execution of the has_role SECURITY DEFINER
-- function. It is only used inside RLS policies for authenticated users; anon
-- callers have no legitimate reason to invoke it directly.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;