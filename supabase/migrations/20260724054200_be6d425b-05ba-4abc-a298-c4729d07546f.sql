REVOKE UPDATE (plan) ON public.profiles FROM authenticated, anon;

-- Ensure trigger still exists and is enforced (defense in depth)
CREATE OR REPLACE FUNCTION public.prevent_profile_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan
     AND current_setting('role', true) <> 'service_role'
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'plan column can only be modified by service role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_plan_change ON public.profiles;
CREATE TRIGGER prevent_profile_plan_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_plan_change();