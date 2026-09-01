
CREATE OR REPLACE FUNCTION public.convert_referral(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _ref record;
BEGIN
  SELECT * INTO _ref FROM public.referrals
    WHERE referred_user_id = _user_id AND status = 'pending' FOR UPDATE;
  IF _ref IS NULL THEN RETURN; END IF;

  -- award: 17 scans to referrer, 17 to referred
  PERFORM public.grant_credits(_ref.referrer_id, 17, 'referral_reward',
    jsonb_build_object('referral_id', _ref.id, 'referred_user_id', _user_id));
  PERFORM public.grant_credits(_user_id, 17, 'referral_bonus',
    jsonb_build_object('referral_id', _ref.id, 'referrer_id', _ref.referrer_id));

  UPDATE public.referrals
    SET status = 'converted', converted_at = now(), credits_awarded = 34
    WHERE id = _ref.id;
END;
$function$;
