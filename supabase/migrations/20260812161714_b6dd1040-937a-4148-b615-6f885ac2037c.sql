UPDATE public.system_settings
SET value = jsonb_set(value, '{min_conf}', '75'::jsonb, true)
WHERE key = 'auto_scan_config';