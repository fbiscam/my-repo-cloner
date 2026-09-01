CREATE OR REPLACE FUNCTION public.prevent_profile_plan_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan
     AND current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND auth.uid() IS NOT NULL THEN
    NEW.plan := OLD.plan;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_plan ON public.profiles;
CREATE TRIGGER profiles_lock_plan
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_plan_self_change();