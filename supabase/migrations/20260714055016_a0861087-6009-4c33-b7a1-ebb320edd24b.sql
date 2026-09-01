DO $$
DECLARE _uid uuid := '5af751fb-de3b-4a24-aefd-aed53ef44378'; _nb numeric;
BEGIN
  UPDATE public.credit_balances SET balance = balance + 0.20, updated_at = now()
   WHERE user_id = _uid RETURNING balance INTO _nb;
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (_uid, 0.20, 'refund',
    jsonb_build_object('reason','losing_trade_goodwill','scan_id','feb3165b-e4b3-4242-850d-09a20f866625','grade','B','score',70), _nb);
END $$;