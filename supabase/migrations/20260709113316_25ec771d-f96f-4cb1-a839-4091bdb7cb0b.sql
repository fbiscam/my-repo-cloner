
CREATE OR REPLACE FUNCTION public.set_user_plan(_user_id uuid, _plan_id text, _billing_interval text DEFAULT 'monthly'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _plan record;
  _period_end timestamptz;
  _cap integer;
  _old_balance integer;
  _old_plan text;
  _new_balance integer;
BEGIN
  SELECT * INTO _plan FROM public.plans WHERE id = _plan_id;
  IF _plan IS NULL THEN RAISE EXCEPTION 'Unknown plan %', _plan_id; END IF;
  IF _billing_interval NOT IN ('monthly','annual') THEN
    RAISE EXCEPTION 'Bad billing_interval %', _billing_interval;
  END IF;

  _period_end := now() + CASE WHEN _billing_interval = 'annual' THEN interval '1 year' ELSE interval '1 month' END;
  _cap := _plan.monthly_credits * (1 + COALESCE(_plan.rollover_months, 0));

  SELECT plan_id INTO _old_plan FROM public.user_subscriptions WHERE user_id = _user_id;

  INSERT INTO public.user_subscriptions (user_id, plan_id, current_period_start, current_period_end, billing_interval)
  VALUES (_user_id, _plan_id, now(), _period_end, _billing_interval)
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        status = 'active',
        current_period_start = now(),
        current_period_end = _period_end,
        billing_interval = _billing_interval,
        updated_at = now();

  SELECT balance INTO _old_balance FROM public.credit_balances WHERE user_id = _user_id;
  _old_balance := COALESCE(_old_balance, 0);

  -- Recalculate balance: at minimum give the new monthly allowance, but never exceed the new plan's rollover cap.
  _new_balance := LEAST(GREATEST(_old_balance, _plan.monthly_credits), _cap);

  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (_user_id, _new_balance, _plan.monthly_credits)
  ON CONFLICT (user_id) DO UPDATE
    SET monthly_allowance = _plan.monthly_credits,
        balance = _new_balance,
        updated_at = now();

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (
    _user_id,
    _new_balance - _old_balance,
    'plan_change',
    jsonb_build_object(
      'from_plan', _old_plan,
      'to_plan', _plan_id,
      'billing_interval', _billing_interval,
      'monthly_allowance', _plan.monthly_credits,
      'cap', _cap,
      'previous_balance', _old_balance
    ),
    _new_balance
  );

  IF _plan_id <> 'free' THEN
    PERFORM public.convert_referral(_user_id);
  END IF;
END;
$function$;
