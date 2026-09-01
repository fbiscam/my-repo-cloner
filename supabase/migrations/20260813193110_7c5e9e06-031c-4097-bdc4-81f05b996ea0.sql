INSERT INTO public.promo_codes (code, type, value, min_topup_usd, per_user_limit, active, note)
VALUES
  ('AE9K2', 'free', 5.00, 0, 1, true, '$5 free credit promo'),
  ('BONUS25', 'free', 25.00, 0, 1, true, '$25 free credit promo'),
  ('BONUS50', 'free', 50.00, 0, 1, true, '$50 free credit promo')
ON CONFLICT (code) DO UPDATE SET type = EXCLUDED.type, value = EXCLUDED.value, min_topup_usd = EXCLUDED.min_topup_usd, active = true, note = EXCLUDED.note;