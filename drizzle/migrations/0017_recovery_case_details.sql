-- A2-T2: supplemental recovery claim details keyed to audit lineage.
-- The deterministic exception remains the financial source of truth. This table
-- stores human-controlled claim metadata only and survives audit re-analysis.

CREATE TABLE IF NOT EXISTS public.recovery_case_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lineage_id UUID NOT NULL,
  exception_id TEXT NOT NULL CHECK (length(btrim(exception_id)) > 0),
  source_period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
  platform_case_reference TEXT CHECK (
    platform_case_reference IS NULL OR length(btrim(platform_case_reference)) BETWEEN 1 AND 160
  ),
  approved_claim_amount NUMERIC(18,2) CHECK (
    approved_claim_amount IS NULL OR approved_claim_amount >= 0
  ),
  submitted_amount NUMERIC(18,2) CHECK (
    submitted_amount IS NULL OR submitted_amount >= 0
  ),
  accepted_amount NUMERIC(18,2) CHECK (
    accepted_amount IS NULL OR accepted_amount >= 0
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recovery_case_details_submission_order_check CHECK (
    submitted_amount IS NULL
    OR (
      approved_claim_amount IS NOT NULL
      AND submitted_amount <= approved_claim_amount
    )
  ),
  CONSTRAINT recovery_case_details_acceptance_order_check CHECK (
    accepted_amount IS NULL
    OR (
      submitted_amount IS NOT NULL
      AND accepted_amount <= submitted_amount
    )
  ),
  UNIQUE (user_id, lineage_id, exception_id)
);

CREATE INDEX IF NOT EXISTS recovery_case_details_user_updated_idx
  ON public.recovery_case_details (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS recovery_case_details_source_period_idx
  ON public.recovery_case_details (source_period_id);

CREATE TABLE IF NOT EXISTS public.recovery_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recovery_case_id UUID NOT NULL
    REFERENCES public.recovery_case_details(id) ON DELETE RESTRICT,
  lineage_id UUID NOT NULL,
  exception_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('insert', 'update')),
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recovery_case_events_case_created_idx
  ON public.recovery_case_events (recovery_case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recovery_case_events_user_created_idx
  ON public.recovery_case_events (user_id, created_at DESC);

ALTER TABLE public.recovery_case_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_case_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recovery_case_details FROM anon;
REVOKE ALL ON TABLE public.recovery_case_events FROM anon;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.recovery_case_details
  TO authenticated;

GRANT SELECT
  ON TABLE public.recovery_case_events
  TO authenticated;

REVOKE DELETE ON TABLE public.recovery_case_details FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.recovery_case_events FROM authenticated;

DROP POLICY IF EXISTS recovery_case_details_select_own
  ON public.recovery_case_details;
CREATE POLICY recovery_case_details_select_own
  ON public.recovery_case_details
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS recovery_case_details_insert_own
  ON public.recovery_case_details;
CREATE POLICY recovery_case_details_insert_own
  ON public.recovery_case_details
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.periods p
      WHERE p.id = recovery_case_details.source_period_id
        AND p.user_id = (select auth.uid())
        AND p.lineage_id = recovery_case_details.lineage_id
    )
  );

DROP POLICY IF EXISTS recovery_case_details_update_own
  ON public.recovery_case_details;
CREATE POLICY recovery_case_details_update_own
  ON public.recovery_case_details
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.periods p
      WHERE p.id = recovery_case_details.source_period_id
        AND p.user_id = (select auth.uid())
        AND p.lineage_id = recovery_case_details.lineage_id
    )
  );

DROP POLICY IF EXISTS recovery_case_events_select_own
  ON public.recovery_case_events;
CREATE POLICY recovery_case_events_select_own
  ON public.recovery_case_events
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.log_recovery_case_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before JSONB;
  v_after JSONB;
BEGIN
  v_before := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_after := to_jsonb(NEW);

  INSERT INTO public.recovery_case_events (
    user_id,
    recovery_case_id,
    lineage_id,
    exception_id,
    event_type,
    before_data,
    after_data
  )
  VALUES (
    NEW.user_id,
    NEW.id,
    NEW.lineage_id,
    NEW.exception_id,
    lower(TG_OP),
    v_before,
    v_after
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recovery_case_details_audit_trigger
  ON public.recovery_case_details;
CREATE TRIGGER recovery_case_details_audit_trigger
AFTER INSERT OR UPDATE ON public.recovery_case_details
FOR EACH ROW EXECUTE FUNCTION public.log_recovery_case_event();

REVOKE EXECUTE ON FUNCTION public.log_recovery_case_event()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_recovery_case_event() TO postgres;
