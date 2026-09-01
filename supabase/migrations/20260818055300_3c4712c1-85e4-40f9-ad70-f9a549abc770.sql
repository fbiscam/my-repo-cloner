
UPDATE public.trade_journal
SET outcome = 'win',
    pnl = ROUND((take_profit - entry)::numeric, 4),
    closed_at = COALESCE(closed_at, now()),
    tp1_hit_at = COALESCE(tp1_hit_at, now()),
    notes = COALESCE(notes, '') || ' | Corrected: London session XAU/USD reached take-profit (win).',
    updated_at = now()
WHERE pair = 'XAUUSD'
  AND direction = 'long'
  AND created_at >= now() - interval '48 hours'
  AND outcome <> 'win';
