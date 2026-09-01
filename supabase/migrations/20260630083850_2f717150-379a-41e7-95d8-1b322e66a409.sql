
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','elite')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.alert_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- SAVED SIGNALS
CREATE TABLE public.saved_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id UUID NOT NULL REFERENCES public.signal_alerts(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_signals TO authenticated;
GRANT ALL ON public.saved_signals TO service_role;
ALTER TABLE public.saved_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own saved signals" ON public.saved_signals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ALERT PREFERENCES
CREATE TABLE public.alert_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  browser_enabled BOOLEAN NOT NULL DEFAULT true,
  min_grade TEXT NOT NULL DEFAULT 'A+' CHECK (min_grade IN ('A+','A')),
  quiet_start TIME,
  quiet_end TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_preferences TO authenticated;
GRANT ALL ON public.alert_preferences TO service_role;
ALTER TABLE public.alert_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.alert_preferences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TRADE JOURNAL
CREATE TABLE public.trade_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pair TEXT NOT NULL DEFAULT 'XAUUSD',
  direction TEXT NOT NULL CHECK (direction IN ('long','short')),
  entry NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  outcome TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open','win','loss','breakeven')),
  pnl NUMERIC,
  notes TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_journal TO authenticated;
GRANT ALL ON public.trade_journal TO service_role;
ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own journal" ON public.trade_journal FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trade_journal_updated_at BEFORE UPDATE ON public.trade_journal FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger after the function exists
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
