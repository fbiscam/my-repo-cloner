DROP POLICY IF EXISTS "Users can insert own documents" ON public.founding_documents;

CREATE POLICY "Users can insert own documents"
ON public.founding_documents
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.founding_applications fa
    WHERE fa.id = application_id
      AND (
        fa.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        OR fa.email IS NOT DISTINCT FROM (SELECT email FROM auth.users WHERE id = auth.uid())
      )
  )
);