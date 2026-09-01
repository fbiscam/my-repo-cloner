
-- Update grant_credits so topup-style grants get a far-future expiry
CREATE OR REPLACE FUNCTION public.grant_credits(_user_id uuid, _amount numeric, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _new_balance numeric; _expires timestamptz;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  -- Top-up credits never expire (100 years). Everything else keeps 31-day expiry.
  IF _reason ILIKE 'topup%' OR _reason ILIKE 'top_up%' OR _reason ILIKE 'top-up%' OR _reason = 'purchase' THEN
    _expires := now() + interval '100 years';
  ELSE
    _expires := now() + interval '31 days';
  END IF;

  INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
  VALUES (_user_id, _amount, _amount, _reason, _metadata, _expires);

  INSERT INTO public.credit_balances (user_id, balance) VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.credit_balances.balance + _amount, updated_at = now()
  RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _metadata || jsonb_build_object('expires_at', _expires), _new_balance);

  RETURN _new_balance;
END; $function$;

-- Extend expiry on already-granted top-up lots so previously purchased top-ups do not expire either
UPDATE public.credit_lots
   SET expires_at = now() + interval '100 years'
 WHERE amount_remaining > 0
   AND (reason ILIKE 'topup%' OR reason ILIKE 'top_up%' OR reason ILIKE 'top-up%' OR reason = 'purchase');
