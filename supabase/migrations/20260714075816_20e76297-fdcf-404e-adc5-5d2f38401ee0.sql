CREATE POLICY "Users can view own ai_cost_log"
ON public.ai_cost_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);