-- Tighten INSERT policies to prevent field tampering

-- founding_applications: force safe defaults on client insert
DROP POLICY IF EXISTS "Anyone can apply" ON public.founding_applications;
CREATE POLICY "Anyone can apply"
ON public.founding_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(trim(coalesce(full_name, ''))) > 0
  AND length(trim(coalesce(email, ''))) > 0
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND status = 'pending'
  AND (document_status IS NULL OR document_status = 'not_submitted')
  AND approved_at IS NULL
  AND first_profit_at IS NULL
  AND coalesce(referral_rewarded, false) = false
  AND (admin_notes IS NULL OR admin_notes = '')
);

-- contact_messages: force status='new' on public insert
DROP POLICY IF EXISTS "Anyone can submit a contact message" ON public.contact_messages;
CREATE POLICY "Anyone can submit a contact message"
ON public.contact_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(trim(coalesce(name, ''))) > 0
  AND length(trim(coalesce(email, ''))) > 0
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND length(coalesce(subject, '')) <= 300
  AND length(coalesce(message, '')) > 0
  AND length(coalesce(message, '')) <= 5000
  AND status = 'new'
);

-- signal_alert_subscribers: force status='active' and constrain user_id
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.signal_alert_subscribers;
DROP POLICY IF EXISTS "Public can subscribe" ON public.signal_alert_subscribers;
DROP POLICY IF EXISTS "public_insert_alerts" ON public.signal_alert_subscribers;
CREATE POLICY "Anyone can subscribe"
ON public.signal_alert_subscribers
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND status = 'active'
  AND (user_id IS NULL OR user_id = auth.uid())
);