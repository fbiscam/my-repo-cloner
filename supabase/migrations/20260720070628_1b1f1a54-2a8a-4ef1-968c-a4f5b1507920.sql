ALTER TABLE public.signal_weight_configs
  ADD COLUMN IF NOT EXISTS validated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS validation_summary jsonb;

-- v1 seed is treated as validated (grandfathered baseline).
UPDATE public.signal_weight_configs
   SET validated = true, validated_at = COALESCE(validated_at, activated_at, created_at)
 WHERE version = 1 AND validated = false;