UPDATE public.signal_alerts SET grade = CASE
  WHEN confidence >= 90 THEN 'A+'
  WHEN confidence >= 80 THEN 'A'
  WHEN confidence >= 65 THEN 'B'
  ELSE 'C'
END
WHERE grade IS DISTINCT FROM (CASE
  WHEN confidence >= 90 THEN 'A+'
  WHEN confidence >= 80 THEN 'A'
  WHEN confidence >= 65 THEN 'B'
  ELSE 'C'
END);