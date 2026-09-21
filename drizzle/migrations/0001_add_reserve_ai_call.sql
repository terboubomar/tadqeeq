ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

GRANT SELECT, INSERT, UPDATE ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_call(
  p_feature text,
  p_model text,
  p_prompt_version text,
  p_period_id uuid,
  p_exception_id text,
  p_limit integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AI_UNAUTHENTICATED';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.ai_usage
  WHERE user_id = v_user
    AND created_at > now() - interval '1 hour';

  IF v_count >= COALESCE(p_limit, 30) THEN
    RAISE EXCEPTION 'AI_RATE_LIMIT_EXCEEDED';
  END IF;

  INSERT INTO public.ai_usage (user_id, feature, model, prompt_version, period_id, exception_id, status)
  VALUES (v_user, p_feature, p_model, p_prompt_version, p_period_id, p_exception_id, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_ai_call(text, text, text, uuid, text, integer) TO authenticated;