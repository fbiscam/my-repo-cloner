CREATE OR REPLACE FUNCTION public.get_guest_messages(_token uuid)
 RETURNS TABLE(id uuid, sender text, content text, created_at timestamp with time zone, session_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _sid uuid; _status text;
BEGIN
  SELECT s.id, s.status INTO _sid, _status FROM public.chat_sessions s WHERE s.session_token = _token;
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid session'; END IF;
  UPDATE public.chat_sessions s SET unread_guest = 0 WHERE s.id = _sid AND s.unread_guest > 0;
  RETURN QUERY
    SELECT m.id, m.sender, m.content, m.created_at, _status
    FROM public.chat_messages m
    WHERE m.session_id = _sid
    ORDER BY m.created_at ASC;
END; $function$;