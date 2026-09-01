CREATE TABLE public.whatsapp_alert_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    phone_number text NOT NULL,
    whatsapp_enabled boolean DEFAULT true,
    verified_at timestamptz,
    verification_code text,
    last_error text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (user_id),
    UNIQUE (phone_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_alert_links TO authenticated;
GRANT ALL ON public.whatsapp_alert_links TO service_role;

ALTER TABLE public.whatsapp_alert_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own whatsapp link"
ON public.whatsapp_alert_links
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
