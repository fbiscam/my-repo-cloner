-- Users can read any file in community-media (needed for viewing post images)
CREATE POLICY "community_media_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'community-media');
-- Users can upload into their own uid folder
CREATE POLICY "community_media_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "community_media_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'community-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "community_media_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'community-media' AND (storage.foldername(name))[1] = auth.uid()::text);