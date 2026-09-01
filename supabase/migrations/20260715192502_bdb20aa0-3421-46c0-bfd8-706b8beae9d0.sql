
CREATE OR REPLACE FUNCTION public.admin_auto_scan_cron_history()
RETURNS TABLE (
  runid bigint,
  jobid bigint,
  job_pid integer,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT r.runid, r.jobid, r.job_pid, r.status, r.return_message, r.start_time, r.end_time
    FROM cron.job_run_details r
    JOIN cron.job j ON j.jobid = r.jobid
    WHERE j.jobname = 'auto-scan-15min'
    ORDER BY r.start_time DESC
    LIMIT 30;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_auto_scan_cron_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auto_scan_cron_history() TO authenticated;
