ALTER TABLE public.alert_preferences DROP CONSTRAINT IF EXISTS alert_preferences_min_grade_check;
ALTER TABLE public.alert_preferences ADD CONSTRAINT alert_preferences_min_grade_check CHECK (min_grade = ANY (ARRAY['A+','A','B']));
UPDATE public.alert_preferences SET min_grade='B', updated_at=now() WHERE user_id=(SELECT id FROM auth.users WHERE lower(email)='haseebinvestigator@gmail.com');