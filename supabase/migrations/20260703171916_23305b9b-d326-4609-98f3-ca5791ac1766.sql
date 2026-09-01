GRANT SELECT ON public.signal_alerts TO authenticated;
GRANT ALL ON public.signal_alerts TO service_role;

GRANT EXECUTE ON FUNCTION public.user_has_plan_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_plan_feature(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.user_has_plan_feature(uuid, text) TO service_role;