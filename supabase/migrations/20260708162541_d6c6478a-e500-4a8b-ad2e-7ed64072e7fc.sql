
-- Annual pricing on plans
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS annual_price_usd numeric(10,2),
  ADD COLUMN IF NOT EXISTS annual_discount_pct integer DEFAULT 0;

UPDATE public.plans SET annual_price_usd = 290.00, annual_discount_pct = 17 WHERE id = 'pro';
UPDATE public.plans SET annual_price_usd = 990.00, annual_discount_pct = 17 WHERE id = 'elite';

-- Billing interval on subscription
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly','annual'));

-- Referral codes
CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_codes TO authenticated;
GRANT SELECT ON public.referral_codes TO anon;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own referral code readable" ON public.referral_codes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "codes are publicly resolvable" ON public.referral_codes
  FOR SELECT TO anon USING (true);

-- Referrals ledger
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','converted','void')),
  credits_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz,
  CONSTRAINT no_self_referral CHECK (referrer_id <> referred_user_id)
);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own referrals as referrer" ON public.referrals
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);

-- Function to lazily create a referral code for a user
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _code text; _try int := 0;
BEGIN
  SELECT code INTO _code FROM public.referral_codes WHERE user_id = _user_id;
  IF _code IS NOT NULL THEN RETURN _code; END IF;
  LOOP
    _code := upper(substr(regexp_replace(encode(gen_random_bytes(6),'base64'),'[^A-Z0-9]','','g'), 1, 8));
    IF length(_code) < 6 THEN _try := _try + 1; CONTINUE; END IF;
    BEGIN
      INSERT INTO public.referral_codes(user_id, code) VALUES (_user_id, _code);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      _try := _try + 1;
      IF _try > 8 THEN RAISE EXCEPTION 'code gen failed'; END IF;
    END;
  END LOOP;
END;
$$;

-- Apply a referral code for the current user (pending until conversion)
CREATE OR REPLACE FUNCTION public.apply_referral_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _referrer uuid;
  _existing uuid;
  _referrer_email text;
  _self_email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT user_id INTO _referrer FROM public.referral_codes WHERE code = upper(trim(_code));
  IF _referrer IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;
  IF _referrer = _uid THEN RETURN jsonb_build_object('ok', false, 'error', 'self_referral'); END IF;

  SELECT referrer_id INTO _existing FROM public.referrals WHERE referred_user_id = _uid;
  IF _existing IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'already_referred'); END IF;

  -- distinct email anti-abuse
  SELECT email INTO _referrer_email FROM auth.users WHERE id = _referrer;
  SELECT email INTO _self_email FROM auth.users WHERE id = _uid;
  IF lower(_referrer_email) = lower(_self_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_email');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, code)
  VALUES (_referrer, _uid, upper(trim(_code)));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Convert referral when user upgrades to paid plan
CREATE OR REPLACE FUNCTION public.convert_referral(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _ref record;
BEGIN
  SELECT * INTO _ref FROM public.referrals
    WHERE referred_user_id = _user_id AND status = 'pending' FOR UPDATE;
  IF _ref IS NULL THEN RETURN; END IF;

  -- award: 100 credits to referrer, 50 to referred
  PERFORM public.grant_credits(_ref.referrer_id, 100, 'referral_reward',
    jsonb_build_object('referral_id', _ref.id, 'referred_user_id', _user_id));
  PERFORM public.grant_credits(_user_id, 50, 'referral_bonus',
    jsonb_build_object('referral_id', _ref.id, 'referrer_id', _ref.referrer_id));

  UPDATE public.referrals
    SET status = 'converted', converted_at = now(), credits_awarded = 150
    WHERE id = _ref.id;
END;
$$;

-- Extend set_user_plan to auto-convert referrals + support billing interval
CREATE OR REPLACE FUNCTION public.set_user_plan(_user_id uuid, _plan_id text, _billing_interval text DEFAULT 'monthly')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _plan record;
  _period_end timestamptz;
BEGIN
  SELECT * INTO _plan FROM public.plans WHERE id = _plan_id;
  IF _plan IS NULL THEN RAISE EXCEPTION 'Unknown plan %', _plan_id; END IF;
  IF _billing_interval NOT IN ('monthly','annual') THEN
    RAISE EXCEPTION 'Bad billing_interval %', _billing_interval;
  END IF;

  _period_end := now() + CASE WHEN _billing_interval = 'annual' THEN interval '1 year' ELSE interval '1 month' END;

  INSERT INTO public.user_subscriptions (user_id, plan_id, current_period_start, current_period_end, billing_interval)
  VALUES (_user_id, _plan_id, now(), _period_end, _billing_interval)
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        status = 'active',
        current_period_start = now(),
        current_period_end = _period_end,
        billing_interval = _billing_interval,
        updated_at = now();

  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (_user_id, _plan.monthly_credits, _plan.monthly_credits)
  ON CONFLICT (user_id) DO UPDATE
    SET monthly_allowance = _plan.monthly_credits,
        balance = GREATEST(public.credit_balances.balance, _plan.monthly_credits),
        updated_at = now();

  IF _plan_id <> 'free' THEN
    PERFORM public.convert_referral(_user_id);
  END IF;
END;
$$;
