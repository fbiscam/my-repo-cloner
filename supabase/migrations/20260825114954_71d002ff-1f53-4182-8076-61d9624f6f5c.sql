-- Promo codes: no direct client reads; validation happens server-side only.
DROP POLICY IF EXISTS "promo_codes_read_active" ON public.promo_codes;
REVOKE SELECT ON public.promo_codes FROM authenticated, anon;

-- Community social graph: scope reads to the involved user only.
DROP POLICY IF EXISTS "follows_read" ON public.community_follows;
CREATE POLICY "follows_read_involved" ON public.community_follows
  FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR followee_id = auth.uid());

DROP POLICY IF EXISTS "likes_read" ON public.community_likes;
CREATE POLICY "likes_read_own" ON public.community_likes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "reposts_read" ON public.community_reposts;
CREATE POLICY "reposts_read_own" ON public.community_reposts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());