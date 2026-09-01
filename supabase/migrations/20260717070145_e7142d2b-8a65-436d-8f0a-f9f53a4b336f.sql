CREATE OR REPLACE FUNCTION public.mail_get_badges(_addresses text[])
 RETURNS TABLE(address text, tier text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH addrs AS (
    SELECT ma.address, ma.user_id, au.email
    FROM public.mail_addresses ma
    LEFT JOIN auth.users au ON au.id = ma.user_id
    WHERE ma.address = ANY(_addresses)
  )
  SELECT a.address,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = a.user_id AND ur.role = 'admin')
        THEN 'gold'
      WHEN EXISTS (
        SELECT 1 FROM public.founding_applications fa
        WHERE lower(fa.email) = lower(a.email)
          AND (
            fa.document_status IN ('approved','verified')
            OR fa.status IN ('approved','graduated','active')
          )
      ) THEN 'blue'
      ELSE NULL
    END AS tier
  FROM addrs a
  WHERE auth.uid() IS NOT NULL;
$function$;