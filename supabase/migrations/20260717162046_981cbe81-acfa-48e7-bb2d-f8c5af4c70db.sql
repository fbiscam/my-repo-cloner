DROP POLICY IF EXISTS community_media_read ON storage.objects;
CREATE POLICY community_media_read ON storage.objects
FOR SELECT
USING (
  bucket_id = 'community-media'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.community_posts p,
           LATERAL unnest(p.media_urls) AS u(u)
      WHERE p.deleted_at IS NULL
        AND (
          u.u = objects.name
          OR u.u LIKE '%/community-media/' || objects.name
        )
    )
  )
);