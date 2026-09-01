CREATE UNIQUE INDEX IF NOT EXISTS founding_applications_referrer_email_unique
ON public.founding_applications (lower(referrer_email))
WHERE referrer_email IS NOT NULL;