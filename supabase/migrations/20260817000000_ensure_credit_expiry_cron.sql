-- Ensure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-register the daily credit expiry sweep if not already present
-- The expire_credits() function was already defined in migration 20260701003038
-- This ensures the scheduler is active for the 31-day expiry policy.

SELECT cron.schedule(
    'expire-credits-daily',
    '0 0 * * *',
    $$ SELECT public.expire_credits(); $$
);

-- Note: The grant_credits function already sets a 31-day interval for expires_at.
-- This migration just ensures the cleanup task is running.
