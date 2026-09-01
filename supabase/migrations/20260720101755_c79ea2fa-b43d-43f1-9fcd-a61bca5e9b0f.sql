DELETE FROM public.signal_alert_subscribers WHERE email = 'haseeb@jenvu.com' AND user_id IS NULL;
UPDATE public.signal_alert_subscribers SET email = 'haseeb@jenvu.com' WHERE user_id = '5af751fb-de3b-4a24-aefd-aed53ef44378';
UPDATE public.founding_applications SET email = 'haseeb@jenvu.com' WHERE lower(email) = 'haseebinvestigator@gmail.com';
UPDATE auth.users SET email = 'haseeb@jenvu.com', email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now() WHERE id = '5af751fb-de3b-4a24-aefd-aed53ef44378';