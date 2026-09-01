-- Sessions table
CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  guest_name text,
  guest_email text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_admin int NOT NULL DEFAULT 0,
  unread_guest int NOT NULL DEFAULT 0,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_sessions_last_message ON public.chat_sessions(last_message_at DESC);
CREATE INDEX idx_chat_sessions_status ON public.chat_sessions(status);

-- Messages table
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('guest','admin')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_session ON public.chat_messages(session_id, created_at);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_sessions TO service_role;
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

-- RLS
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Admin full access (guests access via SECURITY DEFINER RPCs only)
CREATE POLICY "admin_all_chat_sessions" ON public.chat_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_all_chat_messages" ON public.chat_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER trg_chat_sessions_updated BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Guest: create session
CREATE OR REPLACE FUNCTION public.create_chat_session(_name text, _email text, _user_agent text DEFAULT NULL)
RETURNS TABLE(session_id uuid, session_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.chat_sessions;
BEGIN
  INSERT INTO public.chat_sessions (guest_name, guest_email, user_agent)
  VALUES (
    nullif(trim(coalesce(_name,'')), ''),
    nullif(lower(trim(coalesce(_email,''))), ''),
    nullif(trim(coalesce(_user_agent,'')), '')
  )
  RETURNING * INTO _s;
  RETURN QUERY SELECT _s.id, _s.session_token;
END; $$;

-- Guest: post message (verifies token)
CREATE OR REPLACE FUNCTION public.post_guest_message(_token uuid, _content text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _mid uuid;
BEGIN
  IF _content IS NULL OR length(trim(_content)) = 0 THEN RAISE EXCEPTION 'empty message'; END IF;
  IF length(_content) > 4000 THEN RAISE EXCEPTION 'message too long'; END IF;
  SELECT id INTO _sid FROM public.chat_sessions WHERE session_token = _token AND status = 'open';
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid or closed session'; END IF;
  INSERT INTO public.chat_messages (session_id, sender, content)
  VALUES (_sid, 'guest', _content) RETURNING id INTO _mid;
  UPDATE public.chat_sessions
    SET last_message_at = now(), updated_at = now(), unread_admin = unread_admin + 1
    WHERE id = _sid;
  RETURN _mid;
END; $$;

-- Guest: fetch messages (verifies token, marks guest-read)
CREATE OR REPLACE FUNCTION public.get_guest_messages(_token uuid)
RETURNS TABLE(id uuid, sender text, content text, created_at timestamptz, session_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _status text;
BEGIN
  SELECT s.id, s.status INTO _sid, _status FROM public.chat_sessions s WHERE s.session_token = _token;
  IF _sid IS NULL THEN RAISE EXCEPTION 'invalid session'; END IF;
  UPDATE public.chat_sessions SET unread_guest = 0 WHERE id = _sid AND unread_guest > 0;
  RETURN QUERY
    SELECT m.id, m.sender, m.content, m.created_at, _status
    FROM public.chat_messages m
    WHERE m.session_id = _sid
    ORDER BY m.created_at ASC;
END; $$;

-- Admin: post reply
CREATE OR REPLACE FUNCTION public.post_admin_message(_session_id uuid, _content text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _content IS NULL OR length(trim(_content)) = 0 THEN RAISE EXCEPTION 'empty message'; END IF;
  IF length(_content) > 4000 THEN RAISE EXCEPTION 'message too long'; END IF;
  INSERT INTO public.chat_messages (session_id, sender, content)
  VALUES (_session_id, 'admin', _content) RETURNING id INTO _mid;
  UPDATE public.chat_sessions
    SET last_message_at = now(), updated_at = now(), unread_admin = 0, unread_guest = unread_guest + 1
    WHERE id = _session_id;
  RETURN _mid;
END; $$;

-- Admin: mark session read / close
CREATE OR REPLACE FUNCTION public.mark_chat_read(_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.chat_sessions SET unread_admin = 0 WHERE id = _session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.close_chat_session(_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.chat_sessions SET status = 'closed', updated_at = now() WHERE id = _session_id;
END; $$;

-- Grants on RPCs
REVOKE EXECUTE ON FUNCTION public.create_chat_session(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_guest_message(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_guest_messages(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_admin_message(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_chat_read(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_chat_session(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_chat_session(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_guest_message(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_messages(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_admin_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chat_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_chat_session(uuid) TO authenticated;

-- Realtime for admin inbox live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;