-- Tadqeeq AI usage metadata for cost controls and rate limiting.
-- No prompts, responses, raw files, or audit evidence are stored here.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('exception_explainer')),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  period_id UUID REFERENCES public.periods(id) ON DELETE SET NULL,
  exception_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_feature_created_idx
  ON public.ai_usage (user_id, feature, created_at DESC);

GRANT SELECT, INSERT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own ai usage select" ON public.ai_usage;
CREATE POLICY "own ai usage select"
  ON public.ai_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own ai usage insert" ON public.ai_usage;
CREATE POLICY "own ai usage insert"
  ON public.ai_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
