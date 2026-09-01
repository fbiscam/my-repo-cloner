
CREATE OR REPLACE FUNCTION public.grant_credits(_user_id uuid, _amount numeric, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _new_balance numeric; _expires timestamptz;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  -- Credits expire 31 days after grant.
  _expires := now() + interval '31 days';

  INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
  VALUES (_user_id, _amount, _amount, _reason, _metadata, _expires);

  INSERT INTO public.credit_balances (user_id, balance) VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.credit_balances.balance + _amount, updated_at = now()
  RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _metadata || jsonb_build_object('expires_at', _expires), _new_balance);

  RETURN _new_balance;
END; $function$;

-- Schedule daily expiration sweep at 00:15 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule('expire-credits-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-credits-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('expire-credits-daily', '15 0 * * *', $$SELECT public.expire_credits();$$);
