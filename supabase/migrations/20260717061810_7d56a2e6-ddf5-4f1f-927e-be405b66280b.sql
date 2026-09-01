
-- Allow a user to own multiple @jenvu.email addresses (e.g. admin owning both haseeb@ and support@)
ALTER TABLE public.mail_addresses DROP CONSTRAINT IF EXISTS mail_addresses_pkey;
ALTER TABLE public.mail_addresses ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.mail_addresses ADD CONSTRAINT mail_addresses_pkey PRIMARY KEY (id);
ALTER TABLE public.mail_addresses ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS mail_addresses_one_primary_per_user
  ON public.mail_addresses(user_id) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS mail_addresses_user_idx ON public.mail_addresses(user_id);

-- Backfill: existing rows become primary for their owner
UPDATE public.mail_addresses SET is_primary = true WHERE is_primary = false;

-- List all addresses a user owns
CREATE OR REPLACE FUNCTION public.mail_list_my_addresses()
RETURNS TABLE(address text, local_part text, is_primary boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT address, local_part, is_primary, created_at
  FROM public.mail_addresses
  WHERE user_id = auth.uid()
  ORDER BY is_primary DESC, created_at ASC;
$$;

-- Update mail_send to accept an explicit from-address the caller owns
CREATE OR REPLACE FUNCTION public.mail_send(_to_address text, _subject text, _body text, _from_address text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _from text;
  _to_norm text := lower(trim(_to_address));
  _to_uid uuid;
  _msg_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _to_norm IS NULL OR _to_norm = '' THEN RAISE EXCEPTION 'recipient required'; END IF;
  IF _to_norm !~ '@jenvu\.email$' THEN RAISE EXCEPTION 'only @jenvu.email addresses can receive mail'; END IF;
  IF length(coalesce(_body,'')) > 50000 THEN RAISE EXCEPTION 'body too long'; END IF;
  IF length(coalesce(_subject,'')) > 300 THEN RAISE EXCEPTION 'subject too long'; END IF;

  IF _from_address IS NOT NULL AND length(trim(_from_address)) > 0 THEN
    SELECT address INTO _from FROM public.mail_addresses
     WHERE user_id = _uid AND address = lower(trim(_from_address));
    IF _from IS NULL THEN RAISE EXCEPTION 'you do not own that from-address'; END IF;
  ELSE
    SELECT address INTO _from FROM public.mail_addresses
     WHERE user_id = _uid ORDER BY is_primary DESC, created_at ASC LIMIT 1;
    IF _from IS NULL THEN RAISE EXCEPTION 'claim your @jenvu.email address first'; END IF;
  END IF;

  SELECT user_id INTO _to_uid FROM public.mail_addresses WHERE address = _to_norm;
  IF _to_uid IS NULL THEN RAISE EXCEPTION 'recipient not found'; END IF;

  INSERT INTO public.mail_messages (sender_id, sender_address, recipient_id, recipient_address, subject, body)
  VALUES (_uid, _from, _to_uid, _to_norm, coalesce(_subject,''), coalesce(_body,''))
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
