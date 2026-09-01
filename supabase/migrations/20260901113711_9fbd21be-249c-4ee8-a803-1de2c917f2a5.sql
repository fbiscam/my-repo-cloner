DROP TABLE IF EXISTS public.email_change_audit;

CREATE TABLE public.email_change_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event TEXT NOT NULL CHECK (event IN ('requested','confirmed','failed_request','failed_confirm')),
  old_email TEXT,
  new_email TEXT,
  request_id UUID REFERENCES public.email_change_requests(id) ON DELETE SET NULL,
  ip TEXT,
  user_agent TEXT,
  error_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ecr_audit_user ON public.email_change_audit(user_id, created_at DESC);
CREATE INDEX idx_ecr_audit_event ON public.email_change_audit(event, created_at DESC);
GRANT ALL ON public.email_change_audit TO service_role;
ALTER TABLE public.email_change_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_alert_links
  ADD COLUMN IF NOT EXISTS code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_attempts integer NOT NULL DEFAULT 0;

UPDATE public.system_settings
SET value = value || jsonb_build_object('min_conf', 75, 'single_hit_min_conf', 75)
WHERE key = 'auto_scan_config';