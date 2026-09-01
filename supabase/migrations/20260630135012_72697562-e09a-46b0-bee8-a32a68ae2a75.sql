
-- ============== PLANS ==============
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_usd numeric(10,2) NOT NULL DEFAULT 0,
  monthly_credits integer NOT NULL DEFAULT 0,
  rollover_months integer NOT NULL DEFAULT 0,
  feature_journal boolean NOT NULL DEFAULT false,
  feature_realtime_alerts boolean NOT NULL DEFAULT false,
  feature_full_ict boolean NOT NULL DEFAULT false,
  feature_scanner boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are public" ON public.plans FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.plans (id, name, price_usd, monthly_credits, rollover_months, feature_journal, feature_realtime_alerts, feature_full_ict, feature_scanner, sort_order) VALUES
  ('free',  'Free',  0,    10,   0, false, false, false, false, 1),
  ('pro',   'Pro',   29,   500,  1, true,  true,  true,  true,  2),
  ('elite', 'Elite', 99,   2000, 2, true,  true,  true,  true,  3);

-- ============== TOP-UP PACKS ==============
CREATE TABLE public.topup_packs (
  id text PRIMARY KEY,
  label text NOT NULL,
  price_usd numeric(10,2) NOT NULL,
  credits integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.topup_packs TO anon, authenticated;
GRANT ALL ON public.topup_packs TO service_role;
ALTER TABLE public.topup_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Packs are public" ON public.topup_packs FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.topup_packs (id, label, price_usd, credits, sort_order) VALUES
  ('pack_s', 'Starter', 5,  50,  1),
  ('pack_m', 'Boost',   20, 250, 2),
  ('pack_l', 'Power',   50, 750, 3);

-- ============== USER SUBSCRIPTIONS ==============
CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own subscription" ON public.user_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_user_subscriptions_updated BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== CREDIT BALANCES ==============
CREATE TABLE public.credit_balances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  monthly_allowance integer NOT NULL DEFAULT 0,
  period_resets_at timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_balances TO authenticated;
GRANT ALL ON public.credit_balances TO service_role;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own balance" ON public.credit_balances FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============== CREDIT LEDGER ==============
CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_ledger_user_time ON public.credit_ledger(user_id, created_at DESC);
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own ledger" ON public.credit_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============== SPEND CREDITS (atomic) ==============
CREATE OR REPLACE FUNCTION public.spend_credits(
  _user_id uuid,
  _amount integer,
  _reason text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE public.credit_balances
     SET balance = balance - _amount,
         updated_at = now()
   WHERE user_id = _user_id
     AND balance >= _amount
  RETURNING balance INTO _new_balance;

  IF _new_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, -_amount, _reason, _metadata, _new_balance);

  RETURN _new_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.spend_credits(uuid,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_credits(uuid,integer,text,jsonb) TO service_role;

-- ============== GRANT CREDITS (admin/topup) ==============
CREATE OR REPLACE FUNCTION public.grant_credits(
  _user_id uuid,
  _amount integer,
  _reason text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  INSERT INTO public.credit_balances (user_id, balance) VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.credit_balances.balance + _amount, updated_at = now()
  RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _metadata, _new_balance);

  RETURN _new_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_credits(uuid,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid,integer,text,jsonb) TO service_role;

-- ============== MONTHLY REFILL ==============
CREATE OR REPLACE FUNCTION public.grant_monthly_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _cap integer;
  _topup integer;
  _new_balance integer;
  _count integer := 0;
BEGIN
  FOR _row IN
    SELECT s.user_id, p.monthly_credits, p.rollover_months
      FROM public.user_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
     WHERE s.status = 'active'
  LOOP
    _cap := _row.monthly_credits * (1 + _row.rollover_months);

    UPDATE public.credit_balances
       SET monthly_allowance = _row.monthly_credits,
           balance = LEAST(balance + _row.monthly_credits, _cap),
           period_resets_at = date_trunc('month', now()) + interval '1 month',
           updated_at = now()
     WHERE user_id = _row.user_id
    RETURNING balance INTO _new_balance;

    IF _new_balance IS NULL THEN
      INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
      VALUES (_row.user_id, _row.monthly_credits, _row.monthly_credits)
      RETURNING balance INTO _new_balance;
    END IF;

    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
    VALUES (_row.user_id, _row.monthly_credits, 'monthly_grant', jsonb_build_object('cap', _cap), _new_balance);

    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_monthly_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_monthly_credits() TO service_role;

-- ============== SET USER PLAN ==============
CREATE OR REPLACE FUNCTION public.set_user_plan(_user_id uuid, _plan_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan record;
BEGIN
  SELECT * INTO _plan FROM public.plans WHERE id = _plan_id;
  IF _plan IS NULL THEN RAISE EXCEPTION 'Unknown plan %', _plan_id; END IF;

  INSERT INTO public.user_subscriptions (user_id, plan_id, current_period_start, current_period_end)
  VALUES (_user_id, _plan_id, now(), now() + interval '1 month')
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        status = 'active',
        current_period_start = now(),
        current_period_end = now() + interval '1 month',
        updated_at = now();

  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (_user_id, _plan.monthly_credits, _plan.monthly_credits)
  ON CONFLICT (user_id) DO UPDATE
    SET monthly_allowance = _plan.monthly_credits,
        balance = GREATEST(public.credit_balances.balance, _plan.monthly_credits),
        updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_plan(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_plan(uuid,text) TO service_role;

-- ============== EXTEND handle_new_user ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.alert_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  INSERT INTO public.user_subscriptions (user_id, plan_id)
  VALUES (NEW.id, 'free') ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (NEW.id, 10, 10) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (NEW.id, 10, 'signup_grant', '{}'::jsonb, 10);

  RETURN NEW;
END;
$$;

-- ============== BACKFILL EXISTING USERS ==============
INSERT INTO public.user_subscriptions (user_id, plan_id)
SELECT id, 'free' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
SELECT id, 10, 10 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ============== SCHEDULE MONTHLY REFILL ==============
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('grant_monthly_credits', '0 0 1 * *', $$ SELECT public.grant_monthly_credits(); $$);
