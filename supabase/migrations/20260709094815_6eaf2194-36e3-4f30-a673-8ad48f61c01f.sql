
CREATE TABLE public.ai_cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_id text,
  stage text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_cost_log_created_at_idx ON public.ai_cost_log(created_at DESC);
CREATE INDEX ai_cost_log_stage_idx ON public.ai_cost_log(stage);
CREATE INDEX ai_cost_log_plan_idx ON public.ai_cost_log(plan_id);
CREATE INDEX ai_cost_log_user_idx ON public.ai_cost_log(user_id);

GRANT SELECT ON public.ai_cost_log TO authenticated;
GRANT ALL ON public.ai_cost_log TO service_role;

ALTER TABLE public.ai_cost_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_cost_log"
  ON public.ai_cost_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
