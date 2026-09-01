
-- Seed system mail addresses owned by admin (haseeb)
INSERT INTO public.mail_addresses (user_id, local_part, address, is_primary)
VALUES
  ('5af751fb-de3b-4a24-aefd-aed53ef44378', 'alerts', 'alerts@jenvu.email', false),
  ('5af751fb-de3b-4a24-aefd-aed53ef44378', 'notifications', 'notifications@jenvu.email', false),
  ('5af751fb-de3b-4a24-aefd-aed53ef44378', 'billing', 'billing@jenvu.email', false)
ON CONFLICT (address) DO NOTHING;

-- System send RPC. Bypasses ownership so backend can send from support/alerts/notifications/billing.
CREATE OR REPLACE FUNCTION public.mail_system_send(
  _from_address text,
  _to_user_id uuid,
  _subject text,
  _body text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from text := lower(trim(_from_address));
  _to_addr text;
  _msg_id uuid;
BEGIN
  IF _from IS NULL OR _from = '' THEN RAISE EXCEPTION 'from required'; END IF;
  IF _to_user_id IS NULL THEN RAISE EXCEPTION 'recipient required'; END IF;

  -- Resolve recipient's primary address
  SELECT address INTO _to_addr FROM public.mail_addresses
   WHERE user_id = _to_user_id ORDER BY is_primary DESC, created_at ASC LIMIT 1;
  IF _to_addr IS NULL THEN
    -- Recipient hasn't claimed a @jenvu.email address yet; silently skip.
    RETURN NULL;
  END IF;

  INSERT INTO public.mail_messages
    (sender_id, sender_address, recipient_id, recipient_address, subject, body)
  VALUES
    (NULL, _from, _to_user_id, _to_addr, coalesce(_subject,''), coalesce(_body,''))
  RETURNING id INTO _msg_id;

  INSERT INTO public.mail_message_state (message_id, user_id, folder, is_read)
  VALUES (_msg_id, _to_user_id, 'inbox', false);

  RETURN _msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mail_system_send(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_system_send(text, uuid, text, text) TO service_role;
