DO $$
DECLARE _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE email='haseeb@jenvu.com';
  PERFORM public.spend_credits(_uid, 0.20, 'ai_scan',
    jsonb_build_object('stage','signal','direction','BUY','manual_backfill',true,'reason','missed_charge_worker_cancel'));
END $$;