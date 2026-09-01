
-- Restore authenticated access to has_role but restrict enumeration:
-- only allow checking the caller's own user_id (or admin check on self).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent enumeration: non-service callers can only check themselves.
  IF auth.uid() IS NOT NULL AND _user_id <> auth.uid() THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
