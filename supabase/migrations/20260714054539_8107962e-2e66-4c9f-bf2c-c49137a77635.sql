-- Refund $0.05 for scan where senior review failed (rate-limited).
DO $$
DECLARE _uid uuid := '5af751fb-de3b-4a24-aefd-aed53ef44378';
        _new_balance numeric;
BEGIN
  UPDATE public.credit_balances
     SET balance = balance + 0.05, updated_at = now()
   WHERE user_id = _uid
   RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_uid, 0.05, 'refund',
          jsonb_build_object('reason','senior_review_failed_rate_limit',
                             'original_ledger_id','c10dd529-5adb-43d0-88e3-49ea323fe758'),
          _new_balance);
END $$;