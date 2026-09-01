CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _src text := NEW.raw_user_meta_data->>'signup_source';
BEGIN
  -- Leads-only signups must NOT be provisioned in the trading platform.
  IF _src = 'leads' THEN
    IF NEW.email IS NOT NULL THEN
      INSERT INTO public.lg_profiles (user_id, email, full_name, monthly_credit_limit)
      VALUES (
        NEW.id,
        lower(trim(NEW.email)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        50
      )
      ON CONFLICT (user_id) DO NOTHING;

      INSERT INTO public.lg_user_roles (user_id, role)
      VALUES (NEW.id, 'member')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

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