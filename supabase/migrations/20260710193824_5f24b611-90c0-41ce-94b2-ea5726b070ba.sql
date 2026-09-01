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

  -- award: $1 to referrer, $1 to referred (USD wallet)
  PERFORM public.grant_credits(_ref.referrer_id, 1.00, 'referral_reward',
    jsonb_build_object('referral_id', _ref.id, 'referred_user_id', _user_id, 'reward_usd', 1.00));
  PERFORM public.grant_credits(_user_id, 1.00, 'referral_bonus',
    jsonb_build_object('referral_id', _ref.id, 'referrer_id', _ref.referrer_id, 'reward_usd', 1.00));

  UPDATE public.referrals
    SET status = 'converted', converted_at = now(), credits_awarded = 2
    WHERE id = _ref.id;
END;
$function$;