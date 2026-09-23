-- P2-T4: immutable audit re-analysis from retained source files.
-- Re-analysis creates a new period version and supersedes the old one.
-- No company/SILO ownership or provisioning is introduced.

ALTER TABLE public.periods
  ADD COLUMN IF NOT EXISTS lineage_id UUID,
  ADD COLUMN IF NOT EXISTS supersedes_period_id UUID,
  ADD COLUMN IF NOT EXISTS superseded_by UUID,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

UPDATE public.periods
SET lineage_id = id
WHERE lineage_id IS NULL;

ALTER TABLE public.periods
  ALTER COLUMN lineage_id SET NOT NULL,
  ALTER COLUMN lineage_id SET DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'periods_supersedes_period_id_fkey'
  ) THEN
    ALTER TABLE public.periods
      ADD CONSTRAINT periods_supersedes_period_id_fkey
      FOREIGN KEY (supersedes_period_id)
      REFERENCES public.periods(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'periods_superseded_by_fkey'
  ) THEN
    ALTER TABLE public.periods
      ADD CONSTRAINT periods_superseded_by_fkey
      FOREIGN KEY (superseded_by)
      REFERENCES public.periods(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DROP INDEX IF EXISTS public.periods_user_platform_label_range_unique_idx;
DROP INDEX IF EXISTS public.periods_user_platform_range_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS periods_user_platform_active_range_unique_idx
  ON public.periods (user_id, platform, period_start, period_end)
  WHERE period_start IS NOT NULL
    AND period_end IS NOT NULL
    AND superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS periods_lineage_created_idx
  ON public.periods (lineage_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_period_reanalysis(
  p_old_period_id UUID,
  p_engine_version TEXT,
  p_format_ids JSONB,
  p_summary JSONB,
  p_branches JSONB,
  p_daily JSONB,
  p_invoice JSONB
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_old public.periods%ROWTYPE;
  v_new_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  IF p_engine_version IS NULL OR btrim(p_engine_version) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ENGINE_VERSION';
  END IF;

  SELECT *
  INTO v_old
  FROM public.periods
  WHERE id = p_old_period_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PERIOD_NOT_FOUND';
  END IF;

  IF v_old.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PERIOD_ALREADY_SUPERSEDED';
  END IF;

  UPDATE public.periods
  SET superseded_at = v_now
  WHERE id = v_old.id
    AND user_id = v_user_id;

  INSERT INTO public.periods (
    user_id,
    lineage_id,
    supersedes_period_id,
    platform,
    label,
    period_start,
    period_end,
    engine_version,
    format_ids,
    summary,
    branches,
    daily,
    invoice
  )
  VALUES (
    v_user_id,
    v_old.lineage_id,
    v_old.id,
    v_old.platform,
    v_old.label,
    v_old.period_start,
    v_old.period_end,
    p_engine_version,
    COALESCE(p_format_ids, '[]'::jsonb),
    COALESCE(p_summary, '{}'::jsonb),
    COALESCE(p_branches, '[]'::jsonb),
    COALESCE(p_daily, '[]'::jsonb),
    COALESCE(p_invoice, '{}'::jsonb)
  )
  RETURNING id INTO v_new_id;

  UPDATE public.periods
  SET superseded_by = v_new_id
  WHERE id = v_old.id
    AND user_id = v_user_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_period_reanalysis(
  UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_period_reanalysis(
  UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_period_reanalysis(
  UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated;

CREATE OR REPLACE FUNCTION public.rollback_period_reanalysis(
  p_old_period_id UUID,
  p_new_period_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_old public.periods%ROWTYPE;
  v_new public.periods%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_old
  FROM public.periods
  WHERE id = p_old_period_id
    AND user_id = v_user_id
  FOR UPDATE;

  SELECT * INTO v_new
  FROM public.periods
  WHERE id = p_new_period_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_old.id IS NULL OR v_new.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PERIOD_NOT_FOUND';
  END IF;

  IF v_old.superseded_by IS DISTINCT FROM v_new.id
     OR v_new.supersedes_period_id IS DISTINCT FROM v_old.id
     OR v_new.lineage_id IS DISTINCT FROM v_old.lineage_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REANALYSIS_LINK';
  END IF;

  DELETE FROM public.periods
  WHERE id = v_new.id
    AND user_id = v_user_id;

  UPDATE public.periods
  SET superseded_by = NULL,
      superseded_at = NULL
  WHERE id = v_old.id
    AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_period_reanalysis(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_period_reanalysis(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.rollback_period_reanalysis(UUID, UUID)
  TO authenticated;
