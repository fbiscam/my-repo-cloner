CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  -- Trusted server-side roles (service_role / postgres) may check any user.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    );
  END IF;

  -- Anonymous callers can never probe role assignments.
  IF _caller IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Authenticated callers can only check themselves.
  IF _user_id IS DISTINCT FROM _caller THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$function$;