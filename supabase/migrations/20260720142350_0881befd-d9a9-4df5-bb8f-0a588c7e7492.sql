ALTER TABLE public.alert_preferences ALTER COLUMN min_grade SET DEFAULT 'C';
ALTER TABLE public.alert_preferences ALTER COLUMN email_grades SET DEFAULT ARRAY['A+','A','B','C']::text[];