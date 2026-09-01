
-- Addresses
CREATE TABLE public.mail_addresses (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  local_part TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mail_local_part_format CHECK (local_part ~ '^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$')
);
GRANT SELECT, INSERT, UPDATE ON public.mail_addresses TO authenticated;
GRANT ALL ON public.mail_addresses TO service_role;
ALTER TABLE public.mail_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own address" ON public.mail_addresses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own address" ON public.mail_addresses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own address" ON public.mail_addresses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Messages
CREATE TABLE public.mail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_address TEXT NOT NULL,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_address TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mail_messages_recipient_idx ON public.mail_messages(recipient_id, created_at DESC);
CREATE INDEX mail_messages_sender_idx ON public.mail_messages(sender_id, created_at DESC);
GRANT SELECT ON public.mail_messages TO authenticated;
GRANT ALL ON public.mail_messages TO service_role;
ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own messages" ON public.mail_messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Per-user message state
CREATE TABLE public.mail_message_state (
  message_id UUID NOT NULL REFERENCES public.mail_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox','sent','archive','trash')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX mail_state_user_folder_idx ON public.mail_message_state(user_id, folder, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_message_state TO authenticated;
GRANT ALL ON public.mail_message_state TO service_role;
ALTER TABLE public.mail_message_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own state" ON public.mail_message_state FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Send function (internal-only, resolves recipient by address)
CREATE OR REPLACE FUNCTION public.mail_send(_to_address TEXT, _subject TEXT, _body TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _from_addr TEXT;
  _to_norm TEXT := lower(trim(_to_address));
  _to_uid UUID;
  _msg_id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _to_norm IS NULL OR _to_norm = '' THEN RAISE EXCEPTION 'recipient required'; END IF;
  IF _to_norm !~ '@jenvu\.email$' THEN RAISE EXCEPTION 'only @jenvu.email addresses can receive mail'; END IF;
  IF length(coalesce(_body,'')) > 50000 THEN RAISE EXCEPTION 'body too long'; END IF;
  IF length(coalesce(_subject,'')) > 300 THEN RAISE EXCEPTION 'subject too long'; END IF;

  SELECT address INTO _from_addr FROM public.mail_addresses WHERE user_id = _uid;
  IF _from_addr IS NULL THEN RAISE EXCEPTION 'claim your @jenvu.email address first'; END IF;

  SELECT user_id INTO _to_uid FROM public.mail_addresses WHERE address = _to_norm;
  IF _to_uid IS NULL THEN RAISE EXCEPTION 'recipient not found'; END IF;

  INSERT INTO public.mail_messages (sender_id, sender_address, recipient_id, recipient_address, subject, body)
  VALUES (_uid, _from_addr, _to_uid, _to_norm, coalesce(_subject,''), coalesce(_body,''))
  RETURNING id INTO _msg_id;

  INSERT INTO public.mail_message_state (message_id, user_id, folder, is_read)
  VALUES (_msg_id, _uid, 'sent', true);

  IF _to_uid <> _uid THEN
    INSERT INTO public.mail_message_state (message_id, user_id, folder, is_read)
    VALUES (_msg_id, _to_uid, 'inbox', false);
  END IF;

  RETURN _msg_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mail_send(TEXT, TEXT, TEXT) TO authenticated;

-- Claim address
CREATE OR REPLACE FUNCTION public.mail_claim_address(_local_part TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _lp TEXT := lower(trim(_local_part));
  _addr TEXT;
  _existing TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _lp !~ '^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$' THEN
    RAISE EXCEPTION 'username must be 4-32 chars, lowercase letters/numbers/._- and start/end alphanumeric';
  END IF;
  _addr := _lp || '@jenvu.email';

  SELECT address INTO _existing FROM public.mail_addresses WHERE user_id = _uid;
  IF _existing IS NOT NULL THEN RAISE EXCEPTION 'address already set'; END IF;

  IF EXISTS (SELECT 1 FROM public.mail_addresses WHERE local_part = _lp) THEN
    RAISE EXCEPTION 'username taken';
  END IF;

  INSERT INTO public.mail_addresses (user_id, local_part, address) VALUES (_uid, _lp, _addr);
  RETURN _addr;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mail_claim_address(TEXT) TO authenticated;

-- Directory search (safe: only address + display name)
CREATE OR REPLACE FUNCTION public.mail_directory_search(_q TEXT)
RETURNS TABLE(address TEXT, full_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ma.address, p.full_name
  FROM public.mail_addresses ma
  LEFT JOIN public.profiles p ON p.id = ma.user_id
  WHERE auth.uid() IS NOT NULL
    AND (ma.address ILIKE '%' || lower(trim(_q)) || '%'
         OR coalesce(p.full_name,'') ILIKE '%' || trim(_q) || '%')
  ORDER BY ma.address
  LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.mail_directory_search(TEXT) TO authenticated;
