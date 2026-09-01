-- 1) Brief audio: remove blanket read access to the private briefs bucket.
-- Public playback goes through /api/public/brief-audio/$id, which checks is_public.
DROP POLICY IF EXISTS "Public read briefs bucket" ON storage.objects;

-- 2) Profiles: clients must never change their own plan (defense in depth on top of triggers).
REVOKE UPDATE (plan) ON public.profiles FROM anon, authenticated;