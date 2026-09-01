UPDATE public.system_settings
SET value = jsonb_set(value::jsonb, '{min_conf}', '64'::jsonb, false)
WHERE key = 'auto_scan_config';