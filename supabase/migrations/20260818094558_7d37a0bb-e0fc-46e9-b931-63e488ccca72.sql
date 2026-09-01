ALTER TABLE public.signal_paper_trades DROP CONSTRAINT IF EXISTS signal_paper_trades_outcome_check;

ALTER TABLE public.signal_paper_trades
  ADD CONSTRAINT signal_paper_trades_outcome_check
  CHECK (outcome IS NULL OR outcome = ANY (ARRAY['win','loss','timeout','cancelled','pending','not_triggered','expired']));

UPDATE public.signal_paper_trades
SET outcome = 'not_triggered',
    realized_r = 0,
    resolution_method = 'entry_never_touched_v1',
    notes = COALESCE(notes || ' | ', '') || 'Corrected: limit entry never touched'
WHERE id = '59996c7a-be8e-457d-9446-e96d9b68ec94';