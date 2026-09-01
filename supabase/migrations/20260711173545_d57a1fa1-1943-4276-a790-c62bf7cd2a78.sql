DROP POLICY IF EXISTS "own setup links" ON public.trade_setup_links;

CREATE POLICY "own setup links" ON public.trade_setup_links
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.trade_journal t WHERE t.id = trade_setup_links.trade_id AND t.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.trade_setups s WHERE s.id = trade_setup_links.setup_id AND s.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.trade_journal t WHERE t.id = trade_setup_links.trade_id AND t.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.trade_setups s WHERE s.id = trade_setup_links.setup_id AND s.user_id = auth.uid())
);