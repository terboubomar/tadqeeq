-- Allow the AI usage ledger to track the period-summary feature.
-- The table continues to store metadata only: no prompts, responses, or raw files.
ALTER TABLE public.ai_usage
  DROP CONSTRAINT IF EXISTS ai_usage_feature_check;

ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_feature_check
  CHECK (feature IN ('exception_explainer', 'period_summary'));
