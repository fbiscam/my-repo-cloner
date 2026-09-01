
-- Add models_used column to track which AI models produced each signal
ALTER TABLE public.signal_alerts ADD COLUMN IF NOT EXISTS models_used text[];
ALTER TABLE public.signal_paper_trades ADD COLUMN IF NOT EXISTS models_used text[];

-- Backfill paper trades for signal_alerts that were broadcast but never tracked
INSERT INTO public.signal_paper_trades
  (pair, direction, entry, sl, tp, rr, confidence, setup_score, grade, htf_bias, killzone, session, gates, broadcast_alert_id, outcome, fired_at)
SELECT
  a.pair, a.direction, a.entry, a.sl, a.tp,
  COALESCE(a.rr, 0),
  COALESCE(a.confidence, 0),
  a.setup_score,
  a.grade,
  a.htf_bias,
  a.killzone,
  a.session,
  jsonb_build_object('backfilled', true),
  a.id,
  'pending',
  a.fired_at
FROM public.signal_alerts a
LEFT JOIN public.signal_paper_trades pt ON pt.broadcast_alert_id = a.id
WHERE pt.id IS NULL;

-- Update auto_scan_config default min_conf to 75
UPDATE public.system_settings
SET value = jsonb_set(value, '{min_conf}', '75'::jsonb)
WHERE key = 'auto_scan_config';
