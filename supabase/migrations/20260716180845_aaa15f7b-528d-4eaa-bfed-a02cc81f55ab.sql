
-- Make all credit grants effectively non-expiring (100 years)
CREATE OR REPLACE FUNCTION public.grant_credits(_user_id uuid, _amount numeric, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _new_balance numeric; _expires timestamptz;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  -- No credits expire anymore — Founding program means users hold credits until they upgrade.
  _expires := now() + interval '100 years';

  INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
  VALUES (_user_id, _amount, _amount, _reason, _metadata, _expires);

  INSERT INTO public.credit_balances (user_id, balance) VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.credit_balances.balance + _amount, updated_at = now()
  RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _metadata || jsonb_build_object('expires_at', _expires), _new_balance);

  RETURN _new_balance;
END; $function$;

-- Extend all existing non-expired lots too
UPDATE public.credit_lots
   SET expires_at = now() + interval '100 years'
 WHERE expires_at > now()
   AND expires_at < now() + interval '50 years';

-- Signup grant should also not expire
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.alert_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_subscriptions (user_id, plan_id) VALUES (NEW.id, 'free') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (NEW.id, 2.00, 2.00) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
  VALUES (NEW.id, 2.00, 2.00, 'signup_grant', '{}'::jsonb, now() + interval '100 years');
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (NEW.id, 2.00, 'signup_grant', '{}'::jsonb, 2.00);
  RETURN NEW;
END; $function$;

-- Monthly grant lots also non-expiring
CREATE OR REPLACE FUNCTION public.grant_monthly_credits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    VALUES (_row.user_id, _row.wallet_usd, _row.wallet_usd, 'monthly_grant', '{}'::jsonb, now() + interval '100 years');
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
    VALUES (_row.user_id, _row.wallet_usd, 'monthly_grant', jsonb_build_object('cap',_cap), _new_balance);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END; $function$;
