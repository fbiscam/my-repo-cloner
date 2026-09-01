
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.bug_notify_dispatch(_fingerprint text, _kind text, _occurrences bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _bot_token text;
  _secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO _bot_token FROM vault.decrypted_secrets WHERE name = 'telegram_bot_token';
  EXCEPTION WHEN OTHERS THEN
    _bot_token := NULL;
  END;
  IF _bot_token IS NULL OR length(_bot_token) = 0 THEN
    RAISE WARNING 'bug_notify_dispatch: telegram_bot_token not in vault';
    RETURN;
  END IF;
  _secret := encode(extensions.digest('bug-notify:' || _bot_token, 'sha256'), 'hex');

  PERFORM net.http_post(
    url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app/api/public/hooks/bug-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bug-notify-secret', _secret
    ),
    body := jsonb_build_object('fingerprint', _fingerprint, 'kind', _kind, 'occurrences', _occurrences)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'bug_notify_dispatch failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_error_group_notify_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.bug_notify_dispatch(NEW.fingerprint, 'new', NEW.occurrences);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_error_group_notify_spike()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _thresholds bigint[] := ARRAY[10, 50, 100, 500]::bigint[];
  _t bigint;
BEGIN
  IF NEW.occurrences = OLD.occurrences THEN RETURN NEW; END IF;
  IF NEW.status = 'ignored' OR NEW.status = 'resolved' THEN RETURN NEW; END IF;
  FOREACH _t IN ARRAY _thresholds LOOP
    IF OLD.occurrences < _t AND NEW.occurrences >= _t THEN
      PERFORM public.bug_notify_dispatch(NEW.fingerprint, 'spike', NEW.occurrences);
      EXIT;
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS error_group_notify_insert ON public.error_group;
CREATE TRIGGER error_group_notify_insert
AFTER INSERT ON public.error_group
FOR EACH ROW EXECUTE FUNCTION public.trg_error_group_notify_insert();

DROP TRIGGER IF EXISTS error_group_notify_spike ON public.error_group;
CREATE TRIGGER error_group_notify_spike
AFTER UPDATE OF occurrences ON public.error_group
FOR EACH ROW EXECUTE FUNCTION public.trg_error_group_notify_spike();
