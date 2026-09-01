-- 1. Trial fields on subscriptions
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- 2. Trial claim ledger (device / IP abuse guard)
CREATE TABLE IF NOT EXISTS public.trial_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fingerprint text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.trial_claims TO service_role;
ALTER TABLE public.trial_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trial_claims_admin_read" ON public.trial_claims
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS trial_claims_fingerprint_idx ON public.trial_claims (fingerprint);
CREATE INDEX IF NOT EXISTS trial_claims_ip_idx ON public.trial_claims (ip_hash);
CREATE UNIQUE INDEX IF NOT EXISTS trial_claims_user_idx ON public.trial_claims (user_id);

-- 3. Provision the trial on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _src text := NEW.raw_user_meta_data->>'signup_source';
  _trial_usd numeric := 15.00;
BEGIN
  IF _src = 'leads' THEN
    IF NEW.email IS NOT NULL THEN
      INSERT INTO public.lg_profiles (user_id, email, full_name, monthly_credit_limit)
      VALUES (
        NEW.id,
        lower(trim(NEW.email)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        50
      )
      ON CONFLICT (user_id) DO NOTHING;

      INSERT INTO public.lg_user_roles (user_id, role)
      VALUES (NEW.id, 'member')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.alert_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (NEW.id, 0, _trial_usd) ON CONFLICT (user_id) DO UPDATE
    SET monthly_allowance = _trial_usd;

  -- 14-day Pro trial
  INSERT INTO public.user_subscriptions
    (user_id, plan_id, status, is_trial, current_period_start, current_period_end, trial_ends_at)
  VALUES
    (NEW.id, 'pro', 'active', true, now(), now() + interval '14 days', now() + interval '14 days')
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.grant_credits(
    NEW.id, _trial_usd, 'pro_trial_grant',
    jsonb_build_object('trial_days', 14)
  );

  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.signal_alert_subscribers (email, user_id, status)
    VALUES (lower(trim(NEW.email)), NEW.id, 'active')
    ON CONFLICT (email) DO UPDATE
      SET user_id = EXCLUDED.user_id, status = 'active';
  END IF;

  RETURN NEW;
END; $function$;

-- 4. Revoke a trial (abuse guard) — used by the app after signup verification
CREATE OR REPLACE FUNCTION public.revoke_pro_trial(_user_id uuid, _reason text DEFAULT 'duplicate_device')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _remaining numeric; _new_balance numeric;
BEGIN
  DELETE FROM public.user_subscriptions
   WHERE user_id = _user_id AND is_trial = true;

  SELECT COALESCE(SUM(amount_remaining), 0) INTO _remaining
    FROM public.credit_lots
   WHERE user_id = _user_id AND reason = 'pro_trial_grant' AND amount_remaining > 0;

  IF _remaining > 0 THEN
    UPDATE public.credit_lots SET amount_remaining = 0
     WHERE user_id = _user_id AND reason = 'pro_trial_grant' AND amount_remaining > 0;
    UPDATE public.credit_balances
       SET balance = GREATEST(0, balance - _remaining), monthly_allowance = 0, updated_at = now()
     WHERE user_id = _user_id
     RETURNING balance INTO _new_balance;
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
    VALUES (_user_id, -_remaining, 'trial_revoked', jsonb_build_object('reason', _reason), COALESCE(_new_balance, 0));
  ELSE
    UPDATE public.credit_balances SET monthly_allowance = 0, updated_at = now() WHERE user_id = _user_id;
  END IF;
END; $function$;

-- 5. Expire trials after 14 days
CREATE OR REPLACE FUNCTION public.expire_pro_trials()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row record; _remaining numeric; _new_balance numeric; _count integer := 0;
BEGIN
  FOR _row IN
    SELECT user_id FROM public.user_subscriptions
     WHERE is_trial = true AND trial_ends_at IS NOT NULL AND trial_ends_at <= now()
  LOOP
    DELETE FROM public.user_subscriptions WHERE user_id = _row.user_id AND is_trial = true;

    SELECT COALESCE(SUM(amount_remaining), 0) INTO _remaining
      FROM public.credit_lots
     WHERE user_id = _row.user_id AND reason = 'pro_trial_grant' AND amount_remaining > 0;

    IF _remaining > 0 THEN
      UPDATE public.credit_lots SET amount_remaining = 0
       WHERE user_id = _row.user_id AND reason = 'pro_trial_grant' AND amount_remaining > 0;
      UPDATE public.credit_balances
         SET balance = GREATEST(0, balance - _remaining), monthly_allowance = 0, updated_at = now()
       WHERE user_id = _row.user_id
       RETURNING balance INTO _new_balance;
      INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
      VALUES (_row.user_id, -_remaining, 'trial_expired', '{}'::jsonb, COALESCE(_new_balance, 0));
    ELSE
      UPDATE public.credit_balances SET monthly_allowance = 0, updated_at = now() WHERE user_id = _row.user_id;
    END IF;

    INSERT INTO public.user_notifications (user_id, kind, title, body, url)
    VALUES (_row.user_id, 'trial_expired', 'Your 14-day Pro trial has ended',
            'Upgrade to Pro to keep realtime alerts, the full ICT engine and your scan credits.',
            '/dashboard/billing');

    _count := _count + 1;
  END LOOP;
  RETURN _count;
END; $function$;

-- 6. Monthly credit grants must skip trial subscriptions
CREATE OR REPLACE FUNCTION public.grant_monthly_credits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row record; _cap numeric; _new_balance numeric; _count integer := 0;
BEGIN
  FOR _row IN SELECT s.user_id, p.wallet_usd, p.rollover_months FROM public.user_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id WHERE s.status='active' AND s.is_trial = false
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

-- 7. Hourly expiry job
SELECT cron.unschedule('expire-pro-trials') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-pro-trials');
SELECT cron.schedule('expire-pro-trials', '7 * * * *', $cron$ SELECT public.expire_pro_trials(); $cron$);