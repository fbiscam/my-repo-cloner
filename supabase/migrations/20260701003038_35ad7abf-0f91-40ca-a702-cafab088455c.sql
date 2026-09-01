
-- 1) credit_lots table
CREATE TABLE IF NOT EXISTS public.credit_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_granted integer NOT NULL CHECK (amount_granted > 0),
  amount_remaining integer NOT NULL CHECK (amount_remaining >= 0),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

GRANT SELECT ON public.credit_lots TO authenticated;
GRANT ALL ON public.credit_lots TO service_role;

ALTER TABLE public.credit_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own credit lots" ON public.credit_lots;
CREATE POLICY "Users read own credit lots" ON public.credit_lots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_credit_lots_user_expiry
  ON public.credit_lots (user_id, expires_at)
  WHERE amount_remaining > 0;

-- 2) Backfill: give each existing user a single lot for their current balance
INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, granted_at, expires_at)
SELECT user_id, balance, balance, 'backfill', '{}'::jsonb, now(), now() + interval '31 days'
FROM public.credit_balances
WHERE balance > 0
  AND NOT EXISTS (SELECT 1 FROM public.credit_lots l WHERE l.user_id = credit_balances.user_id);

-- 3) grant_credits: insert a lot with 31-day expiry, then bump balance
CREATE OR REPLACE FUNCTION public.grant_credits(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
  VALUES (_user_id, _amount, _amount, _reason, _metadata, now() + interval '31 days');

  INSERT INTO public.credit_balances (user_id, balance) VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.credit_balances.balance + _amount, updated_at = now()
  RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _metadata || jsonb_build_object('expires_at', (now() + interval '31 days')), _new_balance);

  RETURN _new_balance;
END;
$$;

-- 4) spend_credits: FIFO by soonest expiry
CREATE OR REPLACE FUNCTION public.spend_credits(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _remaining integer := _amount;
  _lot record;
  _take integer;
  _new_balance integer;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  -- Check total available (non-expired)
  IF COALESCE((
    SELECT SUM(amount_remaining) FROM public.credit_lots
     WHERE user_id = _user_id AND expires_at > now() AND amount_remaining > 0
  ), 0) < _amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE = 'P0001';
  END IF;

  FOR _lot IN
    SELECT id, amount_remaining FROM public.credit_lots
     WHERE user_id = _user_id AND expires_at > now() AND amount_remaining > 0
     ORDER BY expires_at ASC, granted_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;
    _take := LEAST(_lot.amount_remaining, _remaining);
    UPDATE public.credit_lots SET amount_remaining = amount_remaining - _take WHERE id = _lot.id;
    _remaining := _remaining - _take;
  END LOOP;

  UPDATE public.credit_balances
     SET balance = balance - _amount, updated_at = now()
   WHERE user_id = _user_id
  RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, -_amount, _reason, _metadata, _new_balance);

  RETURN _new_balance;
END;
$$;

-- 5) expire_credits: sweep expired lots, deduct from balance, log ledger
CREATE OR REPLACE FUNCTION public.expire_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _new_balance integer;
  _count integer := 0;
BEGIN
  FOR _row IN
    SELECT user_id, SUM(amount_remaining)::int AS expired_total
      FROM public.credit_lots
     WHERE amount_remaining > 0 AND expires_at <= now()
     GROUP BY user_id
  LOOP
    UPDATE public.credit_lots
       SET amount_remaining = 0
     WHERE user_id = _row.user_id AND amount_remaining > 0 AND expires_at <= now();

    UPDATE public.credit_balances
       SET balance = GREATEST(0, balance - _row.expired_total),
           updated_at = now()
     WHERE user_id = _row.user_id
    RETURNING balance INTO _new_balance;

    IF _new_balance IS NOT NULL THEN
      INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
      VALUES (_row.user_id, -_row.expired_total, 'expired', jsonb_build_object('reason', '31_day_expiry'), _new_balance);
      _count := _count + 1;
    END IF;
  END LOOP;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_credits() FROM PUBLIC, anon, authenticated;

-- 6) Daily cron sweep
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-credits-daily') THEN
    PERFORM cron.unschedule('expire-credits-daily');
  END IF;
  PERFORM cron.schedule('expire-credits-daily', '15 0 * * *', $cron$ SELECT public.expire_credits(); $cron$);
END $$;
