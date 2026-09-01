UPDATE public.system_settings
SET value = jsonb_set(value, '{min_conf}', '62'::jsonb, true),
    updated_at = now()
WHERE key = 'auto_scan_config';