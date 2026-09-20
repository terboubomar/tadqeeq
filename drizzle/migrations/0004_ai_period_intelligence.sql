-- Allow the AI usage ledger to track Period Intelligence V1.
-- Metadata only: no prompts, responses, raw files, or comparison packets are stored.
ALTER TABLE public.ai_usage
  DROP CONSTRAINT IF EXISTS ai_usage_feature_check;

ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_feature_check
  CHECK (feature IN ('exception_explainer', 'period_summary', 'period_intelligence'));
