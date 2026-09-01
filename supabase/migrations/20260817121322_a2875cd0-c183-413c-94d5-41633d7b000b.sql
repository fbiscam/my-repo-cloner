UPDATE public.system_settings 
SET value = jsonb_set(jsonb_set(value, '{min_conf}', '75'), '{single_hit_min_conf}', '75') 
WHERE key = 'auto_scan_config';