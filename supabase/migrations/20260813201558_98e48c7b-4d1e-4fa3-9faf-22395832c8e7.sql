CREATE OR REPLACE FUNCTION public.has_lg_role(_user_id uuid, _role lg_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  -- Trusted server-side roles may check any user.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN EXISTS (SELECT 1 FROM public.lg_user_roles WHERE user_id = _user_id AND role = _role)
        OR EXISTS (
          SELECT 1 FROM public.lg_role_grants g
          JOIN auth.users u ON lower(u.email) = lower(g.email)
          WHERE u.id = _user_id AND g.role = _role
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

  RETURN EXISTS (SELECT 1 FROM public.lg_user_roles WHERE user_id = _user_id AND role = _role)
      OR EXISTS (
        SELECT 1 FROM public.lg_role_grants g
        JOIN auth.users u ON lower(u.email) = lower(g.email)
        WHERE u.id = _user_id AND g.role = _role
      );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.community_get_tier(uuid) FROM anon, authenticated;