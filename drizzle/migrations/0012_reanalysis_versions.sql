-- P2-T4: immutable re-analysis version chains.
-- Existing ownership remains user-based. No company/SILO model is introduced.

ALTER TABLE public.periods
  ADD COLUMN IF NOT EXISTS audit_lineage_id UUID,
  ADD COLUMN IF NOT EXISTS supersedes_period_id UUID REFERENCES public.periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analysis_revision INTEGER NOT NULL DEFAULT 1
    CHECK (analysis_revision >= 1);

UPDATE public.periods
SET audit_lineage_id = id
WHERE audit_lineage_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_period_audit_lineage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.audit_lineage_id IS NULL THEN
    NEW.audit_lineage_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_period_audit_lineage_before_insert ON public.periods;
CREATE TRIGGER set_period_audit_lineage_before_insert
BEFORE INSERT ON public.periods
FOR EACH ROW
EXECUTE FUNCTION public.set_period_audit_lineage();

ALTER TABLE public.periods
  ALTER COLUMN audit_lineage_id SET NOT NULL;

DROP INDEX IF EXISTS public.periods_user_platform_range_unique_idx;
CREATE UNIQUE INDEX periods_user_platform_range_unique_idx
  ON public.periods (user_id, platform, period_start, period_end)
  WHERE period_start IS NOT NULL
    AND period_end IS NOT NULL
    AND superseded_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS periods_user_lineage_revision_unique_idx
  ON public.periods (user_id, audit_lineage_id, analysis_revision);

CREATE INDEX IF NOT EXISTS periods_lineage_revision_idx
  ON public.periods (audit_lineage_id, analysis_revision DESC);

ALTER TABLE public.audit_source_files
  DROP CONSTRAINT IF EXISTS audit_source_files_storage_path_key;

CREATE INDEX IF NOT EXISTS audit_source_files_storage_path_idx
  ON public.audit_source_files (storage_path);

CREATE OR REPLACE FUNCTION public.create_reanalysis_period(
  p_source_period_id UUID,
  p_new_period_id UUID,
  p_engine_version TEXT,
  p_format_ids JSONB,
  p_summary JSONB,
  p_branches JSONB,
  p_daily JSONB,
  p_invoice JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_source public.periods%ROWTYPE;
  v_lineage UUID;
  v_revision INTEGER;
BEGIN
  SELECT *
  INTO v_source
  FROM public.periods
  WHERE id = p_source_period_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND';
  END IF;

  IF v_source.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_CURRENT';
  END IF;

  v_lineage := COALESCE(v_source.audit_lineage_id, v_source.id);
  v_revision := COALESCE(v_source.analysis_revision, 1) + 1;

  UPDATE public.periods
  SET superseded_at = clock_timestamp()
  WHERE id = v_source.id
    AND user_id = auth.uid();

  INSERT INTO public.periods (
    id,
    user_id,
    platform,
    label,
    period_start,
    period_end,
    engine_version,
    format_ids,
    summary,
    branches,
    daily,
    invoice,
    audit_lineage_id,
    supersedes_period_id,
    superseded_at,
    analysis_revision
  )
  VALUES (
    p_new_period_id,
    v_source.user_id,
    v_source.platform,
    v_source.label,
    v_source.period_start,
    v_source.period_end,
    p_engine_version,
    COALESCE(p_format_ids, '[]'::jsonb),
    COALESCE(p_summary, '{}'::jsonb),
    COALESCE(p_branches, '[]'::jsonb),
    COALESCE(p_daily, '[]'::jsonb),
    COALESCE(p_invoice, '{}'::jsonb),
    v_lineage,
    v_source.id,
    NULL,
    v_revision
  );

  INSERT INTO public.audit_source_files (
    user_id,
    period_id,
    platform,
    source_kind,
    original_name,
    format_id,
    sha256,
    size_bytes,
    storage_path
  )
  SELECT
    user_id,
    p_new_period_id,
    platform,
    source_kind,
    original_name,
    format_id,
    sha256,
    size_bytes,
    storage_path
  FROM public.audit_source_files
  WHERE period_id = v_source.id
    AND user_id = auth.uid();

  RETURN p_new_period_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_reanalysis_period(
  UUID, UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reanalysis_period(
  UUID, UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated;
