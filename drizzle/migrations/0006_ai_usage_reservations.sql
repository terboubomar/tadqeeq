-- B12: atomic AI usage reservations across all Tadqeeq AI features.
-- A reservation is inserted before any paid OpenAI call. Reserved, succeeded,
-- and failed calls all count toward the rolling hourly limit.

ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'succeeded';

ALTER TABLE public.ai_usage
  DROP CONSTRAINT IF EXISTS ai_usage_status_check;

ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_status_check
  CHECK (status IN ('reserved', 'succeeded', 'failed'));

CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx
  ON public.ai_usage (user_id, created_at DESC);

-- Allow callers to finalize only the mutable usage metadata columns.
GRANT UPDATE (status, model) ON public.ai_usage TO authenticated;

DROP POLICY IF EXISTS "own ai usage update status" ON public.ai_usage;
CREATE POLICY "own ai usage update status"
  ON public.ai_usage
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.reserve_ai_call(
  p_feature TEXT,
  p_model TEXT,
  p_prompt_version TEXT,
  p_period_id UUID,
  p_exception_id TEXT,
  p_limit INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_usage_id UUID;
  v_recent_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AI_AUTH_REQUIRED';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'AI_INVALID_LIMIT';
  END IF;

  -- Serialize reservations for the same authenticated user. The lock is held
  -- only for this transaction and therefore covers count + insert atomically.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT COUNT(*)
    INTO v_recent_count
    FROM public.ai_usage
   WHERE user_id = v_user_id
     AND created_at >= now() - INTERVAL '1 hour';

  IF v_recent_count >= p_limit THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'AI_RATE_LIMIT_EXCEEDED';
  END IF;

  INSERT INTO public.ai_usage (
    user_id,
    feature,
    model,
    prompt_version,
    period_id,
    exception_id,
    status
  )
  VALUES (
    v_user_id,
    p_feature,
    p_model,
    p_prompt_version,
    p_period_id,
    p_exception_id,
    'reserved'
  )
  RETURNING id INTO v_usage_id;

  RETURN v_usage_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_call(TEXT, TEXT, TEXT, UUID, TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_ai_call(TEXT, TEXT, TEXT, UUID, TEXT, INTEGER)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_call(TEXT, TEXT, TEXT, UUID, TEXT, INTEGER)
  TO authenticated;
