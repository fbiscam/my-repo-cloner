
-- 1) founding_applications: stable ownership via user_id
ALTER TABLE public.founding_applications
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.founding_applications fa
SET user_id = u.id
FROM auth.users u
WHERE fa.user_id IS NULL AND lower(fa.email) = lower(u.email);

CREATE INDEX IF NOT EXISTS founding_applications_user_id_idx
  ON public.founding_applications(user_id);

DROP POLICY IF EXISTS "Users can view own application by email" ON public.founding_applications;

CREATE POLICY "Users can view own application"
  ON public.founding_applications
  FOR SELECT
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

-- keep insert policy but ensure user_id cannot be forged
DROP POLICY IF EXISTS "Anyone can apply" ON public.founding_applications;

CREATE POLICY "Anyone can apply"
  ON public.founding_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (length(TRIM(BOTH FROM COALESCE(full_name, ''))) > 0)
    AND (length(TRIM(BOTH FROM COALESCE(email, ''))) > 0)
    AND (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    AND (status = 'pending')
    AND ((document_status IS NULL) OR (document_status = 'not_submitted'))
    AND (approved_at IS NULL)
    AND (first_profit_at IS NULL)
    AND (COALESCE(referral_rewarded, false) = false)
    AND ((admin_notes IS NULL) OR (admin_notes = ''))
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- auto-link new applications to the signed-in account
CREATE OR REPLACE FUNCTION public.founding_applications_bind_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.user_id := auth.uid();
    ELSE
      SELECT u.id INTO NEW.user_id FROM auth.users u WHERE lower(u.email) = lower(NEW.email) LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS founding_applications_bind_user_trg ON public.founding_applications;
CREATE TRIGGER founding_applications_bind_user_trg
  BEFORE INSERT ON public.founding_applications
  FOR EACH ROW EXECUTE FUNCTION public.founding_applications_bind_user();

-- 2) user_notifications: system-generated only
DROP POLICY IF EXISTS "Users can create own notifications" ON public.user_notifications;
REVOKE INSERT ON public.user_notifications FROM authenticated, anon;
GRANT ALL ON public.user_notifications TO service_role;
