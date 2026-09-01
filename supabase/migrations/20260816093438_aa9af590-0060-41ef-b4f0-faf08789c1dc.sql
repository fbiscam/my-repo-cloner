-- 1) Fix mutable search_path on pgmq email helper functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq, extensions;

-- 2) Trigger functions must never be directly executable by API roles
REVOKE ALL ON FUNCTION public.prevent_profile_plan_self_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lowercase_subscriber_email() FROM PUBLIC, anon, authenticated;