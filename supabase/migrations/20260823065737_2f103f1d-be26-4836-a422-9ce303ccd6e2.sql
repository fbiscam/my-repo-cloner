DROP POLICY IF EXISTS "own tokens update" ON public.extension_tokens;
CREATE POLICY "own tokens update" ON public.extension_tokens
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);