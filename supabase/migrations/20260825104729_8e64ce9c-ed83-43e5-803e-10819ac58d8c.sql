-- 1) Tighten founding_documents insert linkage
DROP POLICY IF EXISTS "Users can insert own documents" ON public.founding_documents;
CREATE POLICY "Users can insert own documents"
ON public.founding_documents
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.founding_applications fa
    WHERE fa.id = founding_documents.application_id
      AND (
        fa.user_id = auth.uid()
        OR (
          fa.email IS NOT NULL
          AND lower(fa.email) = lower((SELECT u.email FROM auth.users u WHERE u.id = auth.uid())::text)
        )
      )
  )
);

-- 2) Replace fragile LIKE matching in community media read policy with exact path checks
DROP POLICY IF EXISTS "community_media_read" ON storage.objects;
CREATE POLICY "community_media_read"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'community-media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.community_posts p,
           LATERAL unnest(p.media_urls) AS u(u)
      WHERE p.deleted_at IS NULL
        AND (
          u.u = objects.name
          OR split_part(u.u, '/community-media/', 2) = objects.name
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.community_blocks b
          WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.author_id)
             OR (b.blocker_id = p.author_id AND b.blocked_id = auth.uid())
        )
    )
  )
);

-- 3) Pin search_path on internal email queue helpers
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq, extensions;