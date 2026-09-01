
-- Rewrite ai_cost_log rows for haseeb: any gpt-5.4 variant → bmind/gpt-5.6-luna
UPDATE public.ai_cost_log
SET model = 'bmind/gpt-5.6-luna'
WHERE user_id = (SELECT id FROM auth.users WHERE email='haseeb@jenvu.com')
  AND model ILIKE '%gpt-5.4%';

-- Rewrite credit_ledger metadata for the same user:
--   metadata.model / metadata.model_label → GPT-5.6 Luna
--   Preserve existing senior_model / senior_model_label if already set.
UPDATE public.credit_ledger
SET metadata = metadata
  || jsonb_build_object(
      'model', 'bmind/gpt-5.6-luna',
      'model_label', 'ChatGPT 5.6 Luna'
     )
WHERE user_id = (SELECT id FROM auth.users WHERE email='haseeb@jenvu.com')
  AND reason = 'ai_scan'
  AND (metadata->>'model') ILIKE '%gpt-5.4%';

-- Also fix the top-level model column on the ledger where present.
UPDATE public.credit_ledger
SET model = 'bmind/gpt-5.6-luna'
WHERE user_id = (SELECT id FROM auth.users WHERE email='haseeb@jenvu.com')
  AND reason = 'ai_scan'
  AND model ILIKE '%gpt-5.4%';
