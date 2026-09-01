
CREATE TABLE IF NOT EXISTS public.user_risk_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_balance_usd NUMERIC(12,2) NOT NULL DEFAULT 1000 CHECK (account_balance_usd >= 0),
  risk_pct NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (risk_pct > 0 AND risk_pct <= 10),
  daily_loss_limit_usd NUMERIC(12,2) CHECK (daily_loss_limit_usd IS NULL OR daily_loss_limit_usd > 0),
  kill_switch_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_risk_settings TO authenticated;
GRANT ALL ON public.user_risk_settings TO service_role;

ALTER TABLE public.user_risk_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own risk settings"
  ON public.user_risk_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_user_risk_settings_updated
  BEFORE UPDATE ON public.user_risk_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
