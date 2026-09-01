
DROP POLICY IF EXISTS "Anyone can apply" ON public.founding_applications;

CREATE POLICY "Anyone can apply"
ON public.founding_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(trim(coalesce(full_name, ''))) BETWEEN 2 AND 120
  AND length(trim(coalesce(email, ''))) BETWEEN 5 AND 254
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
);
