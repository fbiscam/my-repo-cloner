-- Allow users to insert and delete their own in-app notifications.
GRANT INSERT, DELETE ON public.user_notifications TO authenticated;

CREATE POLICY "Users can create own notifications"
  ON public.user_notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.user_notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);