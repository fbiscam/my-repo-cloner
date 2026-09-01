DROP POLICY IF EXISTS cvo_read_all ON public.community_verified_override;
CREATE POLICY cvo_read_own_or_admin ON public.community_verified_override
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));