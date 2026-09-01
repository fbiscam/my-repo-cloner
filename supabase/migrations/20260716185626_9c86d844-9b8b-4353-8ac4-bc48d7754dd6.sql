UPDATE public.plans SET wallet_usd = 1.00 WHERE id = 'free';

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
  INSERT INTO public.user_subscriptions (user_id, plan_id) VALUES (NEW.id, 'free') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.credit_balances (user_id, balance, monthly_allowance)
  VALUES (NEW.id, 1.00, 1.00) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.credit_lots (user_id, amount_granted, amount_remaining, reason, metadata, expires_at)
  VALUES (NEW.id, 1.00, 1.00, 'signup_grant', '{}'::jsonb, now() + interval '100 years');
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata, balance_after)
  VALUES (NEW.id, 1.00, 'signup_grant', '{}'::jsonb, 1.00);
  RETURN NEW;
END; $function$;