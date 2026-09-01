DROP FUNCTION IF EXISTS public.__apply_migration(text);
REVOKE CREATE ON SCHEMA public FROM sandbox_exec;
CREATE TABLE IF NOT EXISTS public.email_change_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  old_email text,
  new_email text,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.email_change_audit TO authenticated;
GRANT ALL ON public.email_change_audit TO service_role;
ALTER TABLE public.email_change_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own email change history" ON public.email_change_audit FOR SELECT TO authenticated USING (auth.uid() = user_id);