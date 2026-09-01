UPDATE public.system_settings
SET value = jsonb_set(
  jsonb_set(value::jsonb, '{max_broadcasts_per_day}', '30'),
  '{pairs}', '["XAUUSD","XAUEUR","XAUGBP","XAUJPY","XAUAUD","XAUCHF"]'::jsonb
)
WHERE key = 'auto_scan_config';