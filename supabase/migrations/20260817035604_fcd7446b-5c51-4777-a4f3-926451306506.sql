update public.user_subscriptions
set plan_id = 'ultra', status = 'active', is_trial = false, trial_ends_at = null, updated_at = now()
where user_id = '1250f046-75ea-4e78-ae97-793a147ab221';