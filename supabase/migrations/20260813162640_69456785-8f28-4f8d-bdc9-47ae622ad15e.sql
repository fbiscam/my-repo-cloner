
CREATE TABLE public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  network text NOT NULL,
  deposit_address text NOT NULL,
  pay_amount_usd numeric(12,2) NOT NULL,
  credit_usd numeric(12,2) NOT NULL,
  bonus_usd numeric(12,2) NOT NULL DEFAULT 0,
  promo_code text,
  tx_hash text,
  status text NOT NULL DEFAULT 'pending',
  auto_result jsonb,
  reject_reason text,
  credited_usd numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by text
);

GRANT SELECT, INSERT, UPDATE ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_own" ON public.payment_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "orders_insert_own" ON public.payment_orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX payment_orders_tx_hash_uniq
  ON public.payment_orders (lower(tx_hash)) WHERE tx_hash IS NOT NULL;
CREATE INDEX payment_orders_user_idx ON public.payment_orders (user_id, created_at DESC);
CREATE INDEX payment_orders_status_idx ON public.payment_orders (status, created_at DESC);

CREATE TABLE public.promo_codes (
  code text PRIMARY KEY,
  type text NOT NULL,
  value numeric(12,2) NOT NULL,
  min_topup_usd numeric(12,2) NOT NULL DEFAULT 0,
  max_bonus_usd numeric(12,2),
  usage_limit integer,
  per_user_limit integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promo_codes_read_active" ON public.promo_codes
  FOR SELECT TO authenticated USING (active = true);

CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  user_id uuid NOT NULL,
  order_id uuid,
  pay_amount_usd numeric(12,2) NOT NULL DEFAULT 0,
  bonus_usd numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promo_redemptions_select_own" ON public.promo_redemptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX promo_redemptions_user_idx ON public.promo_redemptions (user_id, code);

INSERT INTO public.promo_codes (code, type, value, min_topup_usd, max_bonus_usd, per_user_limit, note)
VALUES
  ('EXTRA5', 'flat', 5.00, 25.00, 5.00, 1, '$5 extra credit on top-ups of $25 or more'),
  ('GOLD10', 'percent', 10.00, 10.00, 25.00, 3, '10% bonus credit, capped at $25'),
  ('SAVE10', 'discount', 10.00, 20.00, NULL, 1, 'Pay 10% less, receive full credit'),
  ('WELCOME5', 'free', 5.00, 0, 5.00, 1, '$5 free credit, one per account');
