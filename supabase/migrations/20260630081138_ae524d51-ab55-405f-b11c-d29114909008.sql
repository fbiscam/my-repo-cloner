
REVOKE EXECUTE ON FUNCTION public.notify_subscribers_on_insight() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_subscribers_on_insight() TO service_role;
