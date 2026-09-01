CREATE POLICY "Admins manage insight images"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'insight-images' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'insight-images' AND public.has_role(auth.uid(), 'admin'));