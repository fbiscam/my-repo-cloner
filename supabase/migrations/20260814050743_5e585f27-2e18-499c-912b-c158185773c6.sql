UPDATE public.signal_paper_trades
SET outcome = 'pending', realized_r = NULL, resolved_at = NULL, resolution_method = NULL
WHERE fired_at > now() - interval '10 days'
  AND outcome IN ('loss','expired','timeout')
  AND (resolution_method IS NULL OR resolution_method <> 'managed_tp1_be_v3');