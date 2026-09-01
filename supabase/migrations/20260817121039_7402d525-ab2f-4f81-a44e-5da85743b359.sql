UPDATE public.system_settings 
SET value = jsonb_set(jsonb_set(value, '{min_conf}', '70'), '{single_hit_min_conf}', '70') 
WHERE key = 'auto_scan_config';