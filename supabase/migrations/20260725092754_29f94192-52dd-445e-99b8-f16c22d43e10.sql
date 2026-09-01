CREATE OR REPLACE FUNCTION public.error_fingerprint(_message text, _stack text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT encode(extensions.digest(
    coalesce(regexp_replace(_message, '\d+', 'N', 'g'), '')
    || '|' ||
    coalesce(substring(regexp_replace(_stack, 'https?://[^\s)]+', '', 'g') from 1 for 200), ''),
    'sha256'
  ), 'hex')
$function$;