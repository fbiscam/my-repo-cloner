
ALTER TABLE public.alert_preferences
  ADD COLUMN IF NOT EXISTS email_grades text[] NOT NULL DEFAULT ARRAY['A+','A','B']::text[],
  ADD COLUMN IF NOT EXISTS email_pairs text[] NOT NULL DEFAULT ARRAY['XAUUSD','XAUEUR','XAUGBP','XAUJPY','XAUAUD','XAUCHF']::text[],
  ADD COLUMN IF NOT EXISTS email_directions text[] NOT NULL DEFAULT ARRAY['BUY','SELL']::text[];
