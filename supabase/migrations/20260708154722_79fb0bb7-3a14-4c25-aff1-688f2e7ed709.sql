
-- email_change_audit: server-only (audit log with IPs, user agents, emails)
CREATE POLICY "Service role manages email change audit"
  ON public.email_change_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- email_change_requests: server-only (token hashes, emails)
CREATE POLICY "Service role manages email change requests"
  ON public.email_change_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- signup_attempts: server-only (rate-limit tracking with IP/email)
CREATE POLICY "Service role manages signup attempts"
  ON public.signup_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
