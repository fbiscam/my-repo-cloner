ALTER TABLE public.signal_paper_trades
  DROP CONSTRAINT IF EXISTS signal_paper_trades_outcome_check;

ALTER TABLE public.signal_paper_trades
  ADD CONSTRAINT signal_paper_trades_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('win','loss','timeout','cancelled','pending'));

UPDATE public.signal_paper_trades
SET outcome = 'cancelled', realized_r = 0
WHERE outcome = 'loss';