ALTER TABLE public.founding_applications
  ADD COLUMN IF NOT EXISTS referrer_email text,
  ADD COLUMN IF NOT EXISTS referral_rewarded boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_founding_apps_referrer_email
  ON public.founding_applications (lower(referrer_email));

CREATE OR REPLACE FUNCTION public.award_founding_referral(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _app record;
  _referrer_id uuid;
  _referred_id uuid;
  _reward numeric := 5.00;
BEGIN
  SELECT id, email, referrer_email, referral_rewarded, status
    INTO _app
  FROM public.founding_applications
  WHERE id = _application_id;
  IF _app IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF _app.referral_rewarded THEN RETURN jsonb_build_object('ok', false, 'error', 'already_rewarded'); END IF;
  IF _app.referrer_email IS NULL OR length(trim(_app.referrer_email)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_referrer');
  END IF;
  IF lower(_app.referrer_email) = lower(_app.email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  SELECT id INTO _referrer_id FROM auth.users WHERE lower(email) = lower(_app.referrer_email) LIMIT 1;
  SELECT id INTO _referred_id FROM auth.users WHERE lower(email) = lower(_app.email) LIMIT 1;

  IF _referrer_id IS NOT NULL THEN
    PERFORM public.grant_credits(_referrer_id, _reward, 'founding_referral_reward',
      jsonb_build_object('application_id', _application_id, 'referred_email', _app.email));
  END IF;
  IF _referred_id IS NOT NULL THEN
    PERFORM public.grant_credits(_referred_id, _reward, 'founding_referral_bonus',
      jsonb_build_object('application_id', _application_id, 'referrer_email', _app.referrer_email));
  END IF;

  UPDATE public.founding_applications
     SET referral_rewarded = true, updated_at = now()
   WHERE id = _application_id;

  RETURN jsonb_build_object(
    'ok', true,
    'referrer_credited', _referrer_id IS NOT NULL,
    'referred_credited', _referred_id IS NOT NULL,
    'reward', _reward
  );
END;
$$;