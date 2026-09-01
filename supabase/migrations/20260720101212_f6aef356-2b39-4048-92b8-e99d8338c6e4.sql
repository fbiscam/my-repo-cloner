DROP POLICY IF EXISTS "Users can view own application by verified email" ON public.founding_applications;
CREATE POLICY "Users can view own application by email"
  ON public.founding_applications
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower((auth.jwt() ->> 'email')));