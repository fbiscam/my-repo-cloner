
UPDATE public.credit_ledger
SET delta = -0.25,
    balance_after = balance_after - 0.05,
    metadata = metadata || jsonb_build_object(
      'senior_model','bmind/deepseek-ai/deepseek-v4-pro',
      'senior_model_label','DeepSeek V4 Pro',
      'senior_review', true,
      'charge_usd', 0.25,
      'manual_correction', 'senior_review_backfill_20260713_14'
    )
WHERE id IN ('c7bde559-6423-4584-87a8-0ea271ddd084','c33f8f53-801c-4fc2-adc9-7a6d871dac12');

UPDATE public.credit_balances SET balance = balance - 0.10, updated_at = now()
WHERE user_id='5af751fb-de3b-4a24-aefd-aed53ef44378';

WITH lot AS (
  SELECT id FROM public.credit_lots
  WHERE user_id='5af751fb-de3b-4a24-aefd-aed53ef44378' AND amount_remaining > 0.10 AND expires_at > now()
  ORDER BY expires_at DESC LIMIT 1
)
UPDATE public.credit_lots SET amount_remaining = amount_remaining - 0.10
WHERE id = (SELECT id FROM lot);
