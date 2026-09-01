
DO $$
DECLARE _uid uuid := '5af751fb-de3b-4a24-aefd-aed53ef44378';
BEGIN
  DELETE FROM public.trade_journal WHERE user_id = _uid;
  DELETE FROM public.saved_signals WHERE user_id = _uid;
  DELETE FROM public.voice_history WHERE user_id = _uid;
  DELETE FROM public.credit_ledger WHERE user_id = _uid;
  DELETE FROM public.credit_lots WHERE user_id = _uid;
  DELETE FROM public.credit_balances WHERE user_id = _uid;

  PERFORM public.set_user_plan(_uid, 'elite');
  PERFORM public.grant_credits(_uid, 595, 'admin_reset_elite', '{"by":"admin"}'::jsonb);
END $$;
