
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.error_fingerprint(text, text) SET search_path = public;

DROP POLICY IF EXISTS community_media_read ON storage.objects;
CREATE POLICY community_media_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'community-media'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.community_posts p,
           LATERAL unnest(p.media_urls) u(u)
      WHERE p.deleted_at IS NULL
        AND (u.u = objects.name OR u.u LIKE '%/community-media/' || objects.name)
        AND NOT EXISTS (
          SELECT 1 FROM public.community_blocks b
          WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.author_id)
             OR (b.blocker_id = p.author_id AND b.blocked_id = auth.uid())
        )
    )
  )
);
