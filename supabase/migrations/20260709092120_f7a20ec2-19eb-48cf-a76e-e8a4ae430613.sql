
-- 1) Prevent plan self-escalation on profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Not allowed to change plan directly' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_plan_change ON public.profiles;
CREATE TRIGGER prevent_profile_plan_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_plan_change();

-- 2) Fix mutable search_path warnings
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
