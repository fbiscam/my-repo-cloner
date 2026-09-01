UPDATE public.system_settings 
SET value = jsonb_set(value::jsonb, '{min_conf}', '65'::jsonb)
WHERE key = 'auto_scan_config';