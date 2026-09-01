ALTER FUNCTION public.enqueue_email(queue_name text, payload jsonb) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.delete_email(queue_name text, message_id bigint) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) SET search_path = public, pgmq, extensions;

REVOKE ALL ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.delete_email(queue_name text, message_id bigint) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(queue_name text, message_id bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) TO service_role;