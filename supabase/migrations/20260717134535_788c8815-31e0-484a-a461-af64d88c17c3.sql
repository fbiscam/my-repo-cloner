-- 1) Let users see their own credit charge audit rows
CREATE POLICY "Users view own charge audits"
ON public.credit_charge_audit
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2) Tighten community-media read policy: exclude soft-deleted posts' media,
--    while still allowing owners to read their own uploads.
DROP POLICY IF EXISTS community_media_read ON storage.objects;

CREATE POLICY community_media_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'community-media'
  AND (
    -- Owner can always read their own files
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- Otherwise, only if referenced by a non-deleted post
    EXISTS (
      SELECT 1
      FROM public.community_posts p, unnest(p.media_urls) AS u
      WHERE p.deleted_at IS NULL
        AND u LIKE '%' || storage.objects.name
    )
  )
);