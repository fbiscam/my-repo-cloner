ALTER TABLE public.signal_alerts DROP CONSTRAINT IF EXISTS signal_alerts_grade_check;
ALTER TABLE public.signal_alerts ADD CONSTRAINT signal_alerts_grade_check CHECK (grade IN ('A+','A','B','C'));