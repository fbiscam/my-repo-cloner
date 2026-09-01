
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _code text; _try int := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT code INTO _code FROM public.referral_codes WHERE user_id = _user_id;
  IF _code IS NOT NULL THEN RETURN _code; END IF;
  LOOP
    _code := upper(substr(regexp_replace(encode(gen_random_bytes(6),'base64'),'[^A-Z0-9]','','g'), 1, 8));
    IF length(_code) < 6 THEN _try := _try + 1; CONTINUE; END IF;
    BEGIN
      INSERT INTO public.referral_codes(user_id, code) VALUES (_user_id, _code);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      _try := _try + 1;
      IF _try > 8 THEN RAISE EXCEPTION 'code gen failed'; END IF;
    END;
  END LOOP;
END;
$function$;
