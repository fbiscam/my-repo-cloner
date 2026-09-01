CREATE OR REPLACE FUNCTION public.prevent_profile_plan_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan
     AND current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(current_setting('request.jwt.claim.role', true), (current_setting('request.jwt.claims', true)::json ->> 'role'), '') IN ('authenticated','anon')
  THEN
    NEW.plan := OLD.plan;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_plan ON public.profiles;
CREATE TRIGGER profiles_lock_plan
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_plan_self_update();