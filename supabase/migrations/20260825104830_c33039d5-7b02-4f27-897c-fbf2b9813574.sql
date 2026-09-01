REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.signal_alerts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.signal_alerts FROM authenticated;
GRANT SELECT ON public.signal_alerts TO authenticated;
GRANT ALL ON public.signal_alerts TO service_role;