CREATE OR REPLACE FUNCTION public.lock_verified_profile_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     AND OLD.full_name IS NOT NULL
     AND btrim(OLD.full_name) <> ''
     AND EXISTS (
       SELECT 1 FROM public.founding_applications fa
       WHERE fa.user_id = OLD.id AND fa.document_status = 'verified'
     ) THEN
    NEW.full_name := OLD.full_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_verified_profile_name_trg ON public.profiles;
CREATE TRIGGER lock_verified_profile_name_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.lock_verified_profile_name();