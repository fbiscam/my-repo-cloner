
-- 1. Migrate all existing free users to Pro (uses set_user_plan for correct balance/lot handling)
DO $$
DECLARE _uid uuid;
BEGIN
  FOR _uid IN SELECT user_id FROM public.user_subscriptions WHERE plan_id = 'free'
  LOOP
    PERFORM public.set_user_plan(_uid, 'pro', 'monthly');
  END LOOP;
END $$;

-- 2. Update handle_new_user trigger: no default subscription, no starter credits.
--    User must pick a plan post-signup which will grant wallet via set_user_plan.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.alert_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  -- No default subscription. User must select a paid plan.
  -- Initialize an empty balance row so downstream reads don't 404.
  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (NEW.id, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  -- Auto opt-in to signal alerts (broadcast layer filters to paid users only).
  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.signal_alert_subscribers (email, user_id, status)
    VALUES (lower(trim(NEW.email)), NEW.id, 'active')
    ON CONFLICT (email) DO UPDATE
      SET user_id = EXCLUDED.user_id, status = 'active';
  END IF;

  RETURN NEW;
END; $function$;

-- 3. Delete the 'free' plan row (safe: no user_subscriptions reference it anymore).
DELETE FROM public.plans WHERE id = 'free';
