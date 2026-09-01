update public.system_settings
set value = value || '{"min_conf": 64, "single_hit_min_conf": 70}'::jsonb
where key = 'auto_scan_config';