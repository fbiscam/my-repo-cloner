
DROP VIEW IF EXISTS public.v_scan_charge_mismatches;

-- 1. Plans
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS wallet_usd numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_multiplier numeric(4,2) NOT NULL DEFAULT 2.0;
UPDATE public.plans SET wallet_usd = CASE id
  WHEN 'free' THEN 0.30 WHEN 'pro' THEN 15.00 WHEN 'elite' THEN 50.00 WHEN 'ultra' THEN 100.00
  ELSE price_usd END, markup_multiplier = 2.0;

-- 2. Column type changes
ALTER TABLE public.credit_balances
  ALTER COLUMN balance TYPE numeric(12,6) USING balance::numeric,
  ALTER COLUMN monthly_allowance TYPE numeric(12,6) USING monthly_allowance::numeric;

ALTER TABLE public.credit_lots DROP CONSTRAINT IF EXISTS credit_lots_amount_granted_check;
ALTER TABLE public.credit_lots DROP CONSTRAINT IF EXISTS credit_lots_amount_remaining_check;
ALTER TABLE public.credit_lots
  ALTER COLUMN amount_granted TYPE numeric(12,6) USING amount_granted::numeric,
  ALTER COLUMN amount_remaining TYPE numeric(12,6) USING amount_remaining::numeric;
ALTER TABLE public.credit_lots ADD CONSTRAINT credit_lots_amount_granted_check CHECK (amount_granted > 0);
ALTER TABLE public.credit_lots ADD CONSTRAINT credit_lots_amount_remaining_check CHECK (amount_remaining >= 0);

ALTER TABLE public.credit_ledger
  ALTER COLUMN delta TYPE numeric(12,6) USING delta::numeric,
  ALTER COLUMN balance_after TYPE numeric(12,6) USING balance_after::numeric,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS prompt_tokens integer,
  ADD COLUMN IF NOT EXISTS completion_tokens integer,
  ADD COLUMN IF NOT EXISTS raw_cost_usd numeric(12,6);

ALTER TABLE public.credit_charge_audit
  ALTER COLUMN amount TYPE numeric(12,6) USING amount::numeric,
  ALTER COLUMN balance_after TYPE numeric(12,6) USING COALESCE(balance_after,0)::numeric;

CREATE OR REPLACE VIEW public.v_scan_charge_mismatches AS
  SELECT scan_id, user_id, count(*) AS charge_count, sum(amount) AS total_amount,
    array_agg(reason ORDER BY created_at) AS reasons,
    array_agg(source ORDER BY created_at) AS sources,
    array_agg(caller ORDER BY created_at) AS callers,
    min(created_at) AS first_at, max(created_at) AS last_at
  FROM public.credit_charge_audit
  WHERE scan_id IS NOT NULL GROUP BY scan_id, user_id HAVING count(*) > 1;

ALTER TABLE public.topup_packs ALTER COLUMN credits TYPE numeric(10,2) USING credits::numeric;
UPDATE public.topup_packs SET credits = price_usd;

-- Reset balances
UPDATE public.credit_lots SET amount_remaining = 0;
INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
SELECT us.user_id, p.wallet_usd, p.wallet_usd, 'usd_migration_reset',
  jsonb_build_object('plan', p.id), COALESCE(us.current_period_end, now() + interval '31 days')
FROM public.user_subscriptions us JOIN public.plans p ON p.id = us.plan_id WHERE p.wallet_usd > 0;

UPDATE public.credit_balances cb
  SET balance = COALESCE(sub.wallet, 0), monthly_allowance = COALESCE(sub.wallet, 0), updated_at = now()
  FROM (SELECT us.user_id, p.wallet_usd AS wallet
        FROM public.user_subscriptions us JOIN public.plans p ON p.id = us.plan_id) sub
  WHERE cb.user_id = sub.user_id;

-- 5. RPCs
DROP FUNCTION IF EXISTS public.spend_credits(uuid, integer, text, jsonb);
DROP FUNCTION IF EXISTS public.grant_credits(uuid, integer, text, jsonb);
DROP FUNCTION IF EXISTS public.log_charge_audit(uuid, text, integer, integer, text, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.spend_credits(_user_id uuid, _amount numeric, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _remaining numeric := _amount; _lot record; _take numeric; _new_balance numeric;
BEGIN
  IF _amount <= 0 THEN RETURN COALESCE((SELECT balance FROM public.credit_balances WHERE user_id = _user_id), 0); END IF;
  IF COALESCE((SELECT SUM(amount_remaining) FROM public.credit_lots
     WHERE user_id = _user_id AND expires_at > now() AND amount_remaining > 0),0) < _amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE = 'P0001';
  END IF;
  FOR _lot IN SELECT id, amount_remaining FROM public.credit_lots
     WHERE user_id = _user_id AND expires_at > now() AND amount_remaining > 0
     ORDER BY expires_at ASC, granted_at ASC FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;
    _take := LEAST(_lot.amount_remaining, _remaining);
    UPDATE public.credit_lots SET amount_remaining = amount_remaining - _take WHERE id = _lot.id;
    _remaining := _remaining - _take;
  END LOOP;
  UPDATE public.credit_balances SET balance = balance - _amount, updated_at = now()
   WHERE user_id = _user_id RETURNING balance INTO _new_balance;
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after,
    model, stage, prompt_tokens, completion_tokens, raw_cost_usd)
  VALUES (_user_id, -_amount, _reason, _metadata, _new_balance,
    _metadata->>'model', _metadata->>'stage',
    NULLIF(_metadata->>'prompt_tokens','')::int,
    NULLIF(_metadata->>'completion_tokens','')::int,
    NULLIF(_metadata->>'raw_cost_usd','')::numeric);
  RETURN _new_balance;
END; $$;

CREATE OR REPLACE FUNCTION public.grant_credits(_user_id uuid, _amount numeric, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _new_balance numeric;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
  VALUES (_user_id, _amount, _amount, _reason, _metadata, now() + interval '31 days');
  INSERT INTO public.credit_balances (user_id, balance) VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.credit_balances.balance + _amount, updated_at = now()
  RETURNING balance INTO _new_balance;
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _metadata || jsonb_build_object('expires_at',(now()+interval '31 days')), _new_balance);
  RETURN _new_balance;
END; $$;

CREATE OR REPLACE FUNCTION public.log_charge_audit(_user_id uuid, _reason text, _amount numeric, _balance_after numeric, _source text, _caller text, _scan_id text, _symbol text, _user_agent text, _request_ip text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.credit_charge_audit
    (user_id, scan_id, reason, amount, balance_after, source, caller, symbol, user_agent, request_ip, metadata)
  VALUES (_user_id, _scan_id, _reason, _amount, _balance_after, _source, _caller, _symbol, _user_agent, _request_ip, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO _id; RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.alert_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_subscriptions (user_id, plan_id) VALUES (NEW.id, 'free') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (NEW.id, 0.30, 0.30) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
  VALUES (NEW.id, 0.30, 0.30, 'signup_grant', '{}'::jsonb, now() + interval '31 days');
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (NEW.id, 0.30, 'signup_grant', '{}'::jsonb, 0.30);
  RETURN NEW;
END; $$;

DROP FUNCTION IF EXISTS public.set_user_plan(uuid, text);
DROP FUNCTION IF EXISTS public.set_user_plan(uuid, text, text);
CREATE OR REPLACE FUNCTION public.set_user_plan(_user_id uuid, _plan_id text, _billing_interval text DEFAULT 'monthly'::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _plan record; _period_end timestamptz; _cap numeric;
  _old_balance numeric; _old_plan text; _new_balance numeric;
  _current_lots numeric; _lot_diff numeric; _to_trim numeric; _lot record; _take numeric;
BEGIN
  SELECT * INTO _plan FROM public.plans WHERE id = _plan_id;
  IF _plan IS NULL THEN RAISE EXCEPTION 'Unknown plan %', _plan_id; END IF;
  IF _billing_interval NOT IN ('monthly','annual') THEN RAISE EXCEPTION 'Bad billing_interval %', _billing_interval; END IF;
  _period_end := now() + CASE WHEN _billing_interval='annual' THEN interval '1 year' ELSE interval '1 month' END;
  _cap := _plan.wallet_usd * (1 + COALESCE(_plan.rollover_months,0));
  SELECT plan_id INTO _old_plan FROM public.user_subscriptions WHERE user_id = _user_id;
  INSERT INTO public.user_subscriptions (user_id, plan_id, current_period_start, current_period_end, billing_interval)
  VALUES (_user_id, _plan_id, now(), _period_end, _billing_interval)
  ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status='active',
        current_period_start = now(), current_period_end = _period_end,
        billing_interval = _billing_interval, updated_at = now();
  SELECT balance INTO _old_balance FROM public.credit_balances WHERE user_id = _user_id;
  _old_balance := COALESCE(_old_balance, 0);
  _new_balance := LEAST(GREATEST(_old_balance, _plan.wallet_usd), _cap);
  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (_user_id, _new_balance, _plan.wallet_usd)
  ON CONFLICT (user_id) DO UPDATE SET monthly_allowance = _plan.wallet_usd, balance = _new_balance, updated_at = now();
  SELECT COALESCE(SUM(amount_remaining),0)::numeric INTO _current_lots
    FROM public.credit_lots WHERE user_id = _user_id AND expires_at > now() AND amount_remaining > 0;
  _lot_diff := _new_balance - _current_lots;
  IF _lot_diff > 0 THEN
    INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
    VALUES (_user_id, _lot_diff, _lot_diff, 'plan_change', jsonb_build_object('plan_id',_plan_id,'billing_interval',_billing_interval), _period_end);
  ELSIF _lot_diff < 0 THEN
    _to_trim := -_lot_diff;
    FOR _lot IN SELECT id, amount_remaining FROM public.credit_lots
       WHERE user_id = _user_id AND expires_at > now() AND amount_remaining > 0
       ORDER BY expires_at DESC, granted_at DESC FOR UPDATE
    LOOP
      EXIT WHEN _to_trim <= 0;
      _take := LEAST(_lot.amount_remaining, _to_trim);
      UPDATE public.credit_lots SET amount_remaining = amount_remaining - _take WHERE id = _lot.id;
      _to_trim := _to_trim - _take;
    END LOOP;
  END IF;
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _new_balance - _old_balance, 'plan_change',
    jsonb_build_object('from_plan',_old_plan,'to_plan',_plan_id,'billing_interval',_billing_interval,
      'wallet_usd',_plan.wallet_usd,'cap',_cap,'previous_balance',_old_balance), _new_balance);
  IF _plan_id <> 'free' THEN PERFORM public.convert_referral(_user_id); END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.grant_monthly_credits()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record; _cap numeric; _new_balance numeric; _count integer := 0;
BEGIN
  FOR _row IN SELECT s.user_id, p.wallet_usd, p.rollover_months FROM public.user_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id WHERE s.status='active'
  LOOP
    _cap := _row.wallet_usd * (1 + _row.rollover_months);
    UPDATE public.credit_balances
       SET monthly_allowance = _row.wallet_usd,
           balance = LEAST(balance + _row.wallet_usd, _cap),
           period_resets_at = date_trunc('month', now()) + interval '1 month', updated_at = now()
     WHERE user_id = _row.user_id RETURNING balance INTO _new_balance;
    IF _new_balance IS NULL THEN
      INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
      VALUES (_row.user_id, _row.wallet_usd, _row.wallet_usd) RETURNING balance INTO _new_balance;
    END IF;
    INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
    VALUES (_row.user_id, _row.wallet_usd, _row.wallet_usd, 'monthly_grant', '{}'::jsonb, now() + interval '31 days');
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
    VALUES (_row.user_id, _row.wallet_usd, 'monthly_grant', jsonb_build_object('cap',_cap), _new_balance);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_credits()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record; _new_balance numeric; _count integer := 0;
BEGIN
  FOR _row IN SELECT user_id, SUM(amount_remaining)::numeric AS expired_total FROM public.credit_lots
     WHERE amount_remaining > 0 AND expires_at <= now() GROUP BY user_id
  LOOP
    UPDATE public.credit_lots SET amount_remaining = 0
     WHERE user_id = _row.user_id AND amount_remaining > 0 AND expires_at <= now();
    UPDATE public.credit_balances SET balance = GREATEST(0, balance - _row.expired_total), updated_at = now()
     WHERE user_id = _row.user_id RETURNING balance INTO _new_balance;
    IF _new_balance IS NOT NULL THEN
      INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
      VALUES (_row.user_id, -_row.expired_total, 'expired', jsonb_build_object('reason','31_day_expiry'), _new_balance);
      _count := _count + 1;
    END IF;
  END LOOP;
  RETURN _count;
END; $$;

CREATE OR REPLACE FUNCTION public.resync_all_credit_lots()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _row record; _current_lots numeric; _diff numeric; _to_trim numeric; _lot record; _take numeric; _count int := 0;
BEGIN
  FOR _row IN SELECT cb.user_id, cb.balance, COALESCE(us.current_period_end, now()+interval '31 days') AS period_end
      FROM public.credit_balances cb LEFT JOIN public.user_subscriptions us ON us.user_id = cb.user_id
  LOOP
    SELECT COALESCE(SUM(amount_remaining),0)::numeric INTO _current_lots
      FROM public.credit_lots WHERE user_id = _row.user_id AND expires_at > now() AND amount_remaining > 0;
    _diff := _row.balance - _current_lots;
    IF _diff > 0 THEN
      INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
      VALUES (_row.user_id, _diff, _diff, 'resync_backfill', '{}'::jsonb, _row.period_end);
      _count := _count + 1;
    ELSIF _diff < 0 THEN
      _to_trim := -_diff;
      FOR _lot IN SELECT id, amount_remaining FROM public.credit_lots
         WHERE user_id = _row.user_id AND expires_at > now() AND amount_remaining > 0
         ORDER BY expires_at DESC, granted_at DESC FOR UPDATE
      LOOP
        EXIT WHEN _to_trim <= 0;
        _take := LEAST(_lot.amount_remaining, _to_trim);
        UPDATE public.credit_lots SET amount_remaining = amount_remaining - _take WHERE id = _lot.id;
        _to_trim := _to_trim - _take;
      END LOOP;
      _count := _count + 1;
    END IF;
  END LOOP;
  RETURN _count;
END; $$;

INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
SELECT cb.user_id, 0, 'usd_migration', jsonb_build_object('note','converted_to_usd_wallet'), cb.balance FROM public.credit_balances cb;
