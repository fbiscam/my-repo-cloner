
-- 1. Founding applications: require verified email to view own application
DROP POLICY IF EXISTS "Users can view own application by email" ON public.founding_applications;
CREATE POLICY "Users can view own application by verified email"
ON public.founding_applications
FOR SELECT
TO authenticated
USING (
  lower(email) = lower((auth.jwt() ->> 'email'))
  AND COALESCE((auth.jwt() ->> 'email_verified')::boolean, false) = true
  AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND lower(u.email) = lower(public.founding_applications.email)
  )
);

-- 2. mail_messages: restrict writes to authenticated sender
CREATE POLICY "Sender can insert own messages"
ON public.mail_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Sender can update own messages"
ON public.mail_messages
FOR UPDATE
TO authenticated
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Sender can delete own messages"
ON public.mail_messages
FOR DELETE
TO authenticated
USING (auth.uid() = sender_id);
