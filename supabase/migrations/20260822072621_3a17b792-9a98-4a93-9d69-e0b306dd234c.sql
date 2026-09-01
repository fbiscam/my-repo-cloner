update public.system_settings
set value = jsonb_set(jsonb_set(value, '{min_conf}', '68'::jsonb, true), '{single_hit_min_conf}', '72'::jsonb, true)
where key = 'auto_scan_config';