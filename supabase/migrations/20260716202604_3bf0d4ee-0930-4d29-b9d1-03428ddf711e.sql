
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Storage RLS policies for avatars bucket (bucket itself is created via tool)
DO $$ BEGIN
  -- Public read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatars are publicly readable') THEN
    CREATE POLICY "Avatars are publicly readable" ON storage.objects
      FOR SELECT USING (bucket_id = 'avatars');
  END IF;
  -- Users can upload to their own folder (first path segment = user id)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can upload their own avatar') THEN
    CREATE POLICY "Users can upload their own avatar" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can update their own avatar') THEN
    CREATE POLICY "Users can update their own avatar" ON storage.objects
      FOR UPDATE TO authenticated USING (
        bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete their own avatar') THEN
    CREATE POLICY "Users can delete their own avatar" ON storage.objects
      FOR DELETE TO authenticated USING (
        bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
