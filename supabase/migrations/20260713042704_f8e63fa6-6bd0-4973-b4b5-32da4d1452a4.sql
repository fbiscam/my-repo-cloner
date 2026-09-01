DO $$
DECLARE _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE email='haseeb@jenvu.com';
  IF _uid IS NOT NULL THEN
    PERFORM public.spend_credits(_uid, 0.20, 'ai_scan',
      jsonb_build_object('stage','signal','direction','BUY','manual_reconcile',true));
  END IF;
END $$;