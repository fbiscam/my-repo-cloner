-- 1) Allow public read of files in the 'briefs' bucket (audio for killzone briefs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read briefs bucket'
  ) THEN
    CREATE POLICY "Public read briefs bucket"
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'briefs');
  END IF;
END $$;

-- 2) Harden profiles.plan against client-side privilege escalation.
-- Revoke column-level UPDATE on plan from client roles; keep other columns updatable.
REVOKE UPDATE (plan) ON public.profiles FROM authenticated;
REVOKE UPDATE (plan) ON public.profiles FROM anon;
-- Also block direct INSERT of plan by clients (they can still insert a row, plan will default)
REVOKE INSERT (plan) ON public.profiles FROM authenticated;
REVOKE INSERT (plan) ON public.profiles FROM anon;

-- Ensure service_role retains full access
GRANT ALL ON public.profiles TO service_role;

-- Ensure the plan-change guard trigger exists (idempotent recreate).
CREATE OR REPLACE FUNCTION public.prevent_profile_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.plan IS DISTINCT FROM OLD.plan THEN
    -- Allow only if executed by service_role (server-side set_user_plan uses SECURITY DEFINER)
    IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' THEN
      RAISE EXCEPTION 'plan column cannot be changed by clients';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_plan_change_trigger ON public.profiles;
CREATE TRIGGER prevent_profile_plan_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_plan_change();
