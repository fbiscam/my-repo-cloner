CREATE TABLE public.telegram_alert_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  bot_token text,
  telegram_enabled boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_alert_links TO authenticated;
GRANT ALL ON public.telegram_alert_links TO service_role;

ALTER TABLE public.telegram_alert_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Telegram alert link"
ON public.telegram_alert_links
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own Telegram alert link"
ON public.telegram_alert_links
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Telegram alert link"
ON public.telegram_alert_links
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own Telegram alert link"
ON public.telegram_alert_links
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_telegram_alert_links_updated_at
BEFORE UPDATE ON public.telegram_alert_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();