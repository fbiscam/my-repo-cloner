DROP POLICY IF EXISTS "own setups" ON public.trade_setups;
DROP POLICY IF EXISTS "own setup links" ON public.trade_setup_links;

CREATE POLICY "own setups" ON public.trade_setups
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own setup links" ON public.trade_setup_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trade_journal t WHERE t.id = trade_setup_links.trade_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.trade_journal t WHERE t.id = trade_setup_links.trade_id AND t.user_id = auth.uid()));