
-- Setups
CREATE TABLE public.trade_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'custom',
  description text,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_setups TO authenticated;
GRANT ALL ON public.trade_setups TO service_role;
ALTER TABLE public.trade_setups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own setups" ON public.trade_setups FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_trade_setups_updated BEFORE UPDATE ON public.trade_setups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Links
CREATE TABLE public.trade_setup_links (
  trade_id uuid NOT NULL REFERENCES public.trade_journal(id) ON DELETE CASCADE,
  setup_id uuid NOT NULL REFERENCES public.trade_setups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_id, setup_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_setup_links TO authenticated;
GRANT ALL ON public.trade_setup_links TO service_role;
ALTER TABLE public.trade_setup_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own setup links" ON public.trade_setup_links FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_trade_setup_links_user ON public.trade_setup_links(user_id);
CREATE INDEX idx_trade_setup_links_setup ON public.trade_setup_links(setup_id);
CREATE INDEX idx_trade_journal_user_opened ON public.trade_journal(user_id, opened_at DESC);

-- Seed presets for a given user (idempotent)
CREATE OR REPLACE FUNCTION public.seed_default_setups(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trade_setups (user_id, name, category, description, color) VALUES
    (_user_id, 'Silver Bullet', 'ICT', '10-11am NY killzone precision entry', '#c0c0c0'),
    (_user_id, 'Order Block', 'SMC', 'Last opposing candle before displacement', '#f97316'),
    (_user_id, 'Fair Value Gap', 'ICT', 'Imbalance / 3-candle gap', '#22c55e'),
    (_user_id, 'Break of Structure', 'SMC', 'Continuation break of prior swing', '#3b82f6'),
    (_user_id, 'Change of Character', 'SMC', 'Trend shift confirmation', '#a855f7'),
    (_user_id, 'Liquidity Sweep', 'ICT', 'Stop run above/below equal highs/lows', '#ef4444'),
    (_user_id, 'PD Array', 'ICT', 'Premium/Discount rebalance', '#eab308'),
    (_user_id, 'Market Structure Shift', 'SMC', 'Displacement + shift', '#06b6d4'),
    (_user_id, 'Turtle Soup', 'ICT', 'False breakout reversal', '#84cc16')
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

-- Stats function
CREATE OR REPLACE FUNCTION public.journal_stats(_from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _result jsonb;
  _totals jsonb;
  _by_setup jsonb;
  _sessions jsonb;
  _equity jsonb;
  _by_pair jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  WITH trades AS (
    SELECT * FROM public.trade_journal
     WHERE user_id = _uid
       AND (_from IS NULL OR opened_at >= _from)
       AND (_to   IS NULL OR opened_at <= _to)
       AND outcome IN ('win','loss','breakeven')
  )
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'wins', COUNT(*) FILTER (WHERE outcome='win'),
    'losses', COUNT(*) FILTER (WHERE outcome='loss'),
    'breakeven', COUNT(*) FILTER (WHERE outcome='breakeven'),
    'win_rate', CASE WHEN COUNT(*) FILTER (WHERE outcome IN ('win','loss')) > 0
      THEN ROUND(100.0 * COUNT(*) FILTER (WHERE outcome='win')::numeric
                 / COUNT(*) FILTER (WHERE outcome IN ('win','loss'))::numeric, 2)
      ELSE 0 END,
    'total_pnl', COALESCE(SUM(pnl),0),
    'avg_win', COALESCE(AVG(pnl) FILTER (WHERE outcome='win'),0),
    'avg_loss', COALESCE(AVG(pnl) FILTER (WHERE outcome='loss'),0),
    'best', COALESCE(MAX(pnl),0),
    'worst', COALESCE(MIN(pnl),0),
    'expectancy', CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(pnl),0)/COUNT(*) ELSE 0 END
  ) INTO _totals FROM trades;

  -- By setup
  WITH trades AS (
    SELECT tj.id, tj.pnl, tj.outcome
      FROM public.trade_journal tj
     WHERE tj.user_id = _uid
       AND (_from IS NULL OR tj.opened_at >= _from)
       AND (_to   IS NULL OR tj.opened_at <= _to)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO _by_setup FROM (
    SELECT ts.id, ts.name, ts.color, ts.category,
      COUNT(t.id) AS trades,
      COUNT(*) FILTER (WHERE t.outcome='win') AS wins,
      COUNT(*) FILTER (WHERE t.outcome='loss') AS losses,
      COALESCE(SUM(t.pnl),0) AS pnl,
      CASE WHEN COUNT(*) FILTER (WHERE t.outcome IN ('win','loss')) > 0
        THEN ROUND(100.0 * COUNT(*) FILTER (WHERE t.outcome='win')::numeric
                   / COUNT(*) FILTER (WHERE t.outcome IN ('win','loss'))::numeric, 2)
        ELSE 0 END AS win_rate
    FROM public.trade_setups ts
    LEFT JOIN public.trade_setup_links tsl ON tsl.setup_id = ts.id
    LEFT JOIN trades t ON t.id = tsl.trade_id
    WHERE ts.user_id = _uid
    GROUP BY ts.id, ts.name, ts.color, ts.category
    ORDER BY pnl DESC
  ) s;

  -- Session heatmap (by hour UTC & day of week)
  WITH trades AS (
    SELECT opened_at, pnl, outcome FROM public.trade_journal
     WHERE user_id = _uid
       AND (_from IS NULL OR opened_at >= _from)
       AND (_to   IS NULL OR opened_at <= _to)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO _sessions FROM (
    SELECT EXTRACT(dow FROM opened_at)::int AS dow,
           EXTRACT(hour FROM opened_at)::int AS hour,
           COUNT(*) AS trades,
           COALESCE(SUM(pnl),0) AS pnl,
           COUNT(*) FILTER (WHERE outcome='win') AS wins
    FROM trades GROUP BY 1,2 ORDER BY 1,2
  ) s;

  -- Equity curve (daily cumulative)
  WITH daily AS (
    SELECT date_trunc('day', COALESCE(closed_at, opened_at)) AS day,
           COALESCE(SUM(pnl),0) AS pnl
      FROM public.trade_journal
     WHERE user_id = _uid
       AND (_from IS NULL OR opened_at >= _from)
       AND (_to   IS NULL OR opened_at <= _to)
     GROUP BY 1 ORDER BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', day, 'pnl', pnl,
    'equity', SUM(pnl) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  )), '[]'::jsonb) INTO _equity FROM daily;

  -- Per pair
  WITH trades AS (
    SELECT pair, pnl, outcome FROM public.trade_journal
     WHERE user_id = _uid
       AND (_from IS NULL OR opened_at >= _from)
       AND (_to   IS NULL OR opened_at <= _to)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO _by_pair FROM (
    SELECT pair,
      COUNT(*) AS trades,
      COUNT(*) FILTER (WHERE outcome='win') AS wins,
      COUNT(*) FILTER (WHERE outcome='loss') AS losses,
      COALESCE(SUM(pnl),0) AS pnl,
      CASE WHEN COUNT(*) FILTER (WHERE outcome IN ('win','loss')) > 0
        THEN ROUND(100.0 * COUNT(*) FILTER (WHERE outcome='win')::numeric
                   / COUNT(*) FILTER (WHERE outcome IN ('win','loss'))::numeric, 2)
        ELSE 0 END AS win_rate
    FROM trades GROUP BY pair ORDER BY pnl DESC
  ) s;

  _result := jsonb_build_object(
    'totals', _totals,
    'by_setup', _by_setup,
    'by_pair', _by_pair,
    'sessions', _sessions,
    'equity', _equity
  );
  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.journal_stats(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_setups(uuid) TO authenticated;
