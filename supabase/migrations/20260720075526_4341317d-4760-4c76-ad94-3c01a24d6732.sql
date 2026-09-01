-- Restore EXECUTE on has_role for authenticated users and service role.
-- The function already restricts _user_id = auth.uid() internally, so this
-- is safe against role enumeration. Without EXECUTE, all admin pages that
-- gate on has_role (Weight Tuning, Accuracy Dashboard, TV Mismatch) fail
-- with "Forbidden" inside the Ops Console iframes.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;