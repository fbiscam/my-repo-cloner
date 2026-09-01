
-- Signal alerts: stores A+ / A grade trade setups produced by the cron scanner
CREATE TABLE public.signal_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL DEFAULT 'XAUUSD',
  grade TEXT NOT NULL CHECK (grade IN ('A+','A')),
  direction TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
  entry NUMERIC NOT NULL,
  sl NUMERIC NOT NULL,
  tp NUMERIC NOT NULL,
  rr NUMERIC,
  confidence INTEGER,
  setup_score INTEGER,
  htf_bias TEXT,
  session TEXT,
  killzone TEXT,
  rationale TEXT,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX signal_alerts_fired_at_idx ON public.signal_alerts(fired_at DESC);
CREATE INDEX signal_alerts_pair_fired_idx ON public.signal_alerts(pair, fired_at DESC);

GRANT SELECT ON public.signal_alerts TO anon, authenticated;
GRANT ALL  ON public.signal_alerts TO service_role;

ALTER TABLE public.signal_alerts ENABLE ROW LEVEL SECURITY;

-- Public read-only feed
CREATE POLICY "signal_alerts_public_read"
  ON public.signal_alerts FOR SELECT
  TO anon, authenticated
  USING (true);

-- Realtime fan-out for live alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.signal_alerts;

-- Subscribers who opt in to A+ setup email alerts
CREATE TABLE public.signal_alert_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.signal_alert_subscribers TO anon, authenticated;
GRANT ALL    ON public.signal_alert_subscribers TO service_role;

ALTER TABLE public.signal_alert_subscribers ENABLE ROW LEVEL SECURITY;

-- Anyone can subscribe (validated email + length), nobody can read/update/delete from client
CREATE POLICY "signal_alert_subscribers_public_insert"
  ON public.signal_alert_subscribers FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND char_length(email) BETWEEN 5 AND 254
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  );

-- Lowercase + trim on insert/update (reuse existing helper)
CREATE TRIGGER signal_alert_subscribers_lower
  BEFORE INSERT OR UPDATE ON public.signal_alert_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.lowercase_subscriber_email();

CREATE TRIGGER signal_alert_subscribers_updated
  BEFORE UPDATE ON public.signal_alert_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
