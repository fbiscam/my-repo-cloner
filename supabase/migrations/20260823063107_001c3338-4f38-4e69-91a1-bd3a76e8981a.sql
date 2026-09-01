ALTER TABLE public.whatsapp_alert_links
  ADD COLUMN IF NOT EXISTS code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_attempts integer NOT NULL DEFAULT 0;