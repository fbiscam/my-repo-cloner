DELETE FROM public.credit_ledger a
USING public.credit_ledger b
WHERE a.reason = 'ai_scan'
  AND b.reason = 'ai_scan'
  AND a.user_id = b.user_id
  AND a.metadata->>'scanId' IS NOT NULL
  AND a.metadata->>'scanId' = b.metadata->>'scanId'
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_ai_scan_unique
  ON public.credit_ledger (user_id, (metadata->>'scanId'))
  WHERE reason = 'ai_scan' AND metadata->>'scanId' IS NOT NULL;