-- Harden the 'own profile update' policy on public.profiles so it explicitly
-- prevents authenticated users from changing the 'plan' column. Plan changes
-- must go through service-role / server-side flows (set_user_plan). Existing
-- triggers and column-level revokes remain as defense in depth.

-- Helper: read the current plan for a profile without being constrained by RLS.
-- Used in the WITH CHECK clause below.
CREATE OR REPLACE FUNCTION public.current_profile_plan(_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT plan FROM public.profiles WHERE id = _user_id;
$$;

-- Replace the broad 'own profile update' policy with one whose WITH CHECK
-- clause requires the new plan to match the existing stored plan.
DROP POLICY IF EXISTS "own profile update" ON public.profiles;

CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND plan IS NOT DISTINCT FROM public.current_profile_plan(auth.uid())
  );

-- Ensure service_role retains full access.
GRANT ALL ON public.profiles TO service_role;

-- Revoke direct client mutation of the plan column (idempotent).
REVOKE UPDATE (plan) ON public.profiles FROM authenticated;
REVOKE UPDATE (plan) ON public.profiles FROM anon;
REVOKE INSERT (plan) ON public.profiles FROM authenticated;
REVOKE INSERT (plan) ON public.profiles FROM anon;
