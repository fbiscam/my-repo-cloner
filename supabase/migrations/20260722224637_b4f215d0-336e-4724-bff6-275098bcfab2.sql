
CREATE OR REPLACE FUNCTION public.bug_notify_dispatch(_fingerprint text, _kind text, _occurrences bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets WHERE name = 'bug_notify_secret';
  EXCEPTION WHEN OTHERS THEN
    _secret := NULL;
  END;
  IF _secret IS NULL OR length(_secret) = 0 THEN
    RAISE WARNING 'bug_notify_dispatch: bug_notify_secret missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://project--06cd4260-299b-4286-8096-c43f2f596dee-dev.lovable.app/api/public/hooks/bug-notify',
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

REVOKE ALL ON FUNCTION public.bug_notify_dispatch(text, text, bigint) FROM PUBLIC, anon, authenticated;
