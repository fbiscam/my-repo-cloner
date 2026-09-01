
CREATE OR REPLACE FUNCTION public.award_founding_referral_by_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _email text; _app_id uuid;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = _user_id;
  IF _email IS NULL THEN RETURN; END IF;

  FOR _app_id IN
    SELECT id FROM public.founding_applications
     WHERE lower(email) = lower(_email)
       AND referral_rewarded = false
       AND referrer_email IS NOT NULL
       AND length(trim(referrer_email)) > 0
  LOOP
    PERFORM public.award_founding_referral(_app_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_plan(_user_id uuid, _plan_id text, _billing_interval text DEFAULT 'monthly'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF _plan_id <> 'free' THEN
    PERFORM public.convert_referral(_user_id);
    -- Founding-program referral reward: fires on paid upgrade (after trial), not on approval.
    BEGIN
      PERFORM public.award_founding_referral_by_user(_user_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END; $function$;
