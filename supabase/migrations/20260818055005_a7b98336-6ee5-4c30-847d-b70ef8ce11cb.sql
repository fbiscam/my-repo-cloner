
UPDATE public.signal_alerts 
SET 
  sl = '3788.0', 
  tp = '3820.0',
  markings = (
    SELECT jsonb_agg(
      CASE 
        WHEN m->>'type' = 'sl' THEN m || '{"price": 3788.0, "label": "SL 3788.0 (Updated)"}'::jsonb
        WHEN m->>'type' = 'tp' THEN m || '{"price": 3820.0, "label": "TP 3820.0 (Updated)"}'::jsonb
        ELSE m
      END
    )
    FROM jsonb_array_elements(markings) AS m
  )
WHERE id = '59d1b5a7-75f3-450b-a12b-39a34a8a492e' OR (pair = 'XAUEUR' AND fired_at > now() - interval '12 hours');

UPDATE public.trade_journal
SET 
  stop_loss = '3788.0',
  take_profit = '3820.0'
WHERE pair = 'XAUEUR' AND created_at > now() - interval '12 hours';
