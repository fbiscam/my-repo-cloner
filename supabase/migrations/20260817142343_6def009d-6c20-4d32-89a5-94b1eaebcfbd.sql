ALTER TABLE public.payment_orders 
ADD COLUMN IF NOT EXISTS target_plan_id text REFERENCES public.plans(id),
ADD COLUMN IF NOT EXISTS is_upgrade boolean DEFAULT false;

GRANT ALL ON public.payment_orders TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.payment_orders TO authenticated;
