
-- Fix senior review labels: past entries stored a fabricated
-- "nvapi/deepseek-ai/deepseek-v4-pro" whenever senior review was required,
-- even though the actual model that ran was bmind/deepseek-v4-flash.
UPDATE public.credit_ledger
SET metadata = metadata
  || jsonb_build_object(
    'senior_model', 'bmind/deepseek-v4-flash',
    'senior_model_label', 'DeepSeek V4 Flash'
  )
WHERE user_id = '5af751fb-de3b-4a24-aefd-aed53ef44378'
  AND reason = 'ai_scan'
  AND metadata->>'senior_model' = 'nvapi/deepseek-ai/deepseek-v4-pro';
