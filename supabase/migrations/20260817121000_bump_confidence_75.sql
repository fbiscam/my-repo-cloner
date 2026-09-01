-- Bump global signal thresholds to 75%
UPDATE public.system_settings 
SET value = value || '{"min_conf": 75, "single_hit_min_conf": 75}'::jsonb 
WHERE key = 'auto_scan_config';
