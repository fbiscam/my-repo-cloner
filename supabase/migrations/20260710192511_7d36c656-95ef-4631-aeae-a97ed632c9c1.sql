UPDATE public.credit_ledger
SET model = 'bmind/gpt-5.5',
    metadata = jsonb_set(
      jsonb_set(COALESCE(metadata,'{}'::jsonb),'{model}', to_jsonb('bmind/gpt-5.5'::text), true),
      '{model_label}', to_jsonb('ChatGPT 5.5'::text), true)
WHERE reason = 'ai_scan'
  AND (model IS NULL OR model = '')
  AND (metadata->>'model' IS NULL OR metadata->>'model' = '');