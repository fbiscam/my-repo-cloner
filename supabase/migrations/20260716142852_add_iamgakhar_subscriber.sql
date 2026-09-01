INSERT INTO public.signal_alert_subscribers (email, status)
VALUES ('iamgakhar@gmail.com', 'active')
ON CONFLICT (email) DO UPDATE SET status='active', updated_at=now();
