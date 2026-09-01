ALTER TABLE public.signal_paper_trades
  ADD COLUMN IF NOT EXISTS resolution_method text;

-- Tag every already-resolved trade with the legacy methodology so corrected
-- full-target results are never mixed with the old +0.20R shortcut.
UPDATE public.signal_paper_trades
   SET resolution_method = 'legacy_partial_0_2r'
 WHERE resolved_at IS NOT NULL
   AND resolution_method IS NULL;

CREATE TABLE IF NOT EXISTS public.auto_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'scheduled',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  pairs_checked text[] NOT NULL DEFAULT '{}',
  skip_reason text,
  broadcast_pair text,
  broadcast_alert_id uuid,
  error text,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auto_scan_runs TO authenticated;
GRANT ALL ON public.auto_scan_runs TO service_role;

ALTER TABLE public.auto_scan_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read auto scan runs"
  ON public.auto_scan_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS auto_scan_runs_started_idx
  ON public.auto_scan_runs (started_at DESC);