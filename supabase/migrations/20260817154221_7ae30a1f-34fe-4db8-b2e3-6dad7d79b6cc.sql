-- 1) Pin search_path on remaining SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.read_email_batch(text,integer,integer) FROM PUBLIC, anon, authenticated;

-- 2) Hide internal SEO/indexing operational columns from public visitors
REVOKE SELECT (index_status, notified_at) ON public.insights FROM anon, authenticated;

-- 3) Drop legacy duplicate mail_send overload (superseded by 4-arg version)
DROP FUNCTION IF EXISTS public.mail_send(text, text, text);