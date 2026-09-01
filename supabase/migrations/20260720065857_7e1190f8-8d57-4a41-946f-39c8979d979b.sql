-- Phase 1: weight tuning infra

-- 1. signal_weight_configs
CREATE TABLE public.signal_weight_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL UNIQUE,
  weights JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','active','retired')),
  created_by TEXT NOT NULL CHECK (created_by IN ('grid_search','walk_forward','manual','seed')),
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX signal_weight_configs_one_active
  ON public.signal_weight_configs (status) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_weight_configs TO authenticated;
GRANT ALL ON public.signal_weight_configs TO service_role;
ALTER TABLE public.signal_weight_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read weight configs" ON public.signal_weight_configs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write weight configs" ON public.signal_weight_configs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_signal_weight_configs_updated
  BEFORE UPDATE ON public.signal_weight_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. signal_weight_tuning_runs
CREATE TABLE public.signal_weight_tuning_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('grid','walk_forward')),
  symbol TEXT NOT NULL,
  range_start TIMESTAMPTZ NOT NULL,
  range_end TIMESTAMPTZ NOT NULL,
  combinations_tested INT NOT NULL DEFAULT 0,
  best_config_id UUID REFERENCES public.signal_weight_configs(id) ON DELETE SET NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX signal_weight_tuning_runs_started ON public.signal_weight_tuning_runs (started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_weight_tuning_runs TO authenticated;
GRANT ALL ON public.signal_weight_tuning_runs TO service_role;
ALTER TABLE public.signal_weight_tuning_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read tuning runs" ON public.signal_weight_tuning_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write tuning runs" ON public.signal_weight_tuning_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3. signal_weight_window_results
CREATE TABLE public.signal_weight_window_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.signal_weight_tuning_runs(id) ON DELETE CASCADE,
  fold_index INT NOT NULL,
  in_sample_start TIMESTAMPTZ NOT NULL,
  in_sample_end TIMESTAMPTZ NOT NULL,
  oos_start TIMESTAMPTZ NOT NULL,
  oos_end TIMESTAMPTZ NOT NULL,
  config_id UUID REFERENCES public.signal_weight_configs(id) ON DELETE SET NULL,
  in_sample_win_rate NUMERIC,
  win_rate NUMERIC,
  expectancy_r NUMERIC,
  sample_size INT NOT NULL DEFAULT 0,
  max_drawdown_r NUMERIC,
  passed BOOLEAN NOT NULL DEFAULT false,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX signal_weight_window_results_run ON public.signal_weight_window_results (run_id, fold_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_weight_window_results TO authenticated;
GRANT ALL ON public.signal_weight_window_results TO service_role;
ALTER TABLE public.signal_weight_window_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read window results" ON public.signal_weight_window_results
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write window results" ON public.signal_weight_window_results
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. Seed version 1 = current hard-coded FACTOR_WEIGHTS from engine.ts
INSERT INTO public.signal_weight_configs (version, weights, status, created_by, activated_at, notes)
VALUES (
  1,
  '{
    "metal":  { "bias": 12, "sweep": 9, "zone": 8, "pd": 4, "killzone": 6, "dxy": 6, "rr": 5, "structure": 5, "smt": 3, "session_align": 3, "displacement": 6, "rejection": 5, "confluence": 3, "freshness": 2, "eqhl": 3, "turtle": 3, "htf_poi": 5, "silver_bullet": 3, "power3": 3, "mitigation": 3, "ce": 4, "liq_void": 4, "momentum_div": 4, "vol_spike": 3, "midnight": 3 },
    "forex":  { "bias": 12, "sweep": 9, "zone": 8, "pd": 4, "killzone": 7, "dxy": 4, "rr": 5, "structure": 5, "smt": 4, "session_align": 3, "displacement": 6, "rejection": 5, "confluence": 3, "freshness": 2, "eqhl": 4, "turtle": 3, "htf_poi": 5, "silver_bullet": 3, "power3": 4, "mitigation": 3, "ce": 4, "liq_void": 4, "momentum_div": 4, "vol_spike": 2, "midnight": 3 },
    "index":  { "bias": 14, "sweep": 9, "zone": 8, "pd": 4, "killzone": 7, "dxy": 0, "rr": 5, "structure": 6, "smt": 4, "session_align": 4, "displacement": 8, "rejection": 5, "confluence": 2, "freshness": 2, "eqhl": 3, "turtle": 3, "htf_poi": 5, "silver_bullet": 4, "power3": 3, "mitigation": 3, "ce": 4, "liq_void": 5, "momentum_div": 4, "vol_spike": 5, "midnight": 3 },
    "crypto": { "bias": 16, "sweep": 12, "zone": 9, "pd": 4, "killzone": 0, "dxy": 0, "rr": 7, "structure": 7, "smt": 3, "session_align": 2, "displacement": 9, "rejection": 5, "confluence": 2, "freshness": 0, "eqhl": 4, "turtle": 4, "htf_poi": 5, "silver_bullet": 0, "power3": 0, "mitigation": 3, "ce": 4, "liq_void": 6, "momentum_div": 4, "vol_spike": 6, "midnight": 0 },
    "stock":  { "bias": 14, "sweep": 9, "zone": 8, "pd": 4, "killzone": 7, "dxy": 0, "rr": 5, "structure": 6, "smt": 4, "session_align": 4, "displacement": 8, "rejection": 5, "confluence": 2, "freshness": 2, "eqhl": 3, "turtle": 3, "htf_poi": 5, "silver_bullet": 4, "power3": 3, "mitigation": 3, "ce": 4, "liq_void": 5, "momentum_div": 4, "vol_spike": 5, "midnight": 3 }
  }'::jsonb,
  'active',
  'seed',
  now(),
  'Seed configuration — mirrors hard-coded FACTOR_WEIGHTS in analysis/engine.ts at Phase 1 rollout.'
);