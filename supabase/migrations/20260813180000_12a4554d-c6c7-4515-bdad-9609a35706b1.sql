DROP POLICY IF EXISTS "orders_insert_own" ON public.payment_orders;

CREATE POLICY "orders_insert_own" ON public.payment_orders
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND credited_usd IS NULL
    AND auto_result IS NULL
    AND decided_at IS NULL
    AND decided_by IS NULL
  );