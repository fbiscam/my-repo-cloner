-- 1) mail_messages: tighten insert policy so sender_address must belong to auth.uid()
DROP POLICY IF EXISTS "Sender can insert own messages" ON public.mail_messages;
CREATE POLICY "Sender can insert own messages"
ON public.mail_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.mail_addresses ma
    WHERE ma.user_id = auth.uid()
      AND lower(ma.address) = lower(mail_messages.sender_address)
  )
);

-- 2) profiles: revoke plan column from authenticated so RLS + column privileges block direct edits.
-- Trigger prevent_profile_plan_change already exists; this makes the restriction column-level explicit.
REVOKE UPDATE (plan) ON public.profiles FROM authenticated;
REVOKE UPDATE (plan) ON public.profiles FROM anon;