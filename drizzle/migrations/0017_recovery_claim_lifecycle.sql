-- A2-T2: Recovery claim lifecycle metadata and immutable supporting documents.
-- Extends the existing exception workflow/event ledger; no second financial ledger,
-- accounting-engine formula, tolerance, settlement rule, or SILO model is introduced.

ALTER TABLE public.exception_events
  ADD COLUMN IF NOT EXISTS claim_reference TEXT,
  ADD COLUMN IF NOT EXISTS approved_claim_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS submitted_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS accepted_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS submitted_on DATE,
  ADD COLUMN IF NOT EXISTS response_on DATE,
  ADD COLUMN IF NOT EXISTS recovered_on DATE;

ALTER TABLE public.exception_events
  DROP CONSTRAINT IF EXISTS exception_events_approved_claim_amount_check,
  DROP CONSTRAINT IF EXISTS exception_events_submitted_amount_check,
  DROP CONSTRAINT IF EXISTS exception_events_accepted_amount_check;

ALTER TABLE public.exception_events
  ADD CONSTRAINT exception_events_approved_claim_amount_check
    CHECK (approved_claim_amount IS NULL OR approved_claim_amount >= 0),
  ADD CONSTRAINT exception_events_submitted_amount_check
    CHECK (submitted_amount IS NULL OR submitted_amount >= 0),
  ADD CONSTRAINT exception_events_accepted_amount_check
    CHECK (accepted_amount IS NULL OR accepted_amount >= 0);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('recovery-files', 'recovery-files', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit;

CREATE TABLE IF NOT EXISTS public.recovery_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  exception_id TEXT NOT NULL CHECK (length(btrim(exception_id)) > 0),
  original_name TEXT NOT NULL CHECK (length(btrim(original_name)) > 0),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 26214400),
  storage_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recovery_documents_case_idx
  ON public.recovery_documents (period_id, exception_id, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS recovery_documents_case_sha_unique_idx
  ON public.recovery_documents (period_id, exception_id, sha256);

ALTER TABLE public.recovery_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recovery_documents_select_own ON public.recovery_documents;
CREATE POLICY recovery_documents_select_own
  ON public.recovery_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.periods p
      WHERE p.id = period_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS recovery_documents_insert_own ON public.recovery_documents;
CREATE POLICY recovery_documents_insert_own
  ON public.recovery_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.periods p
      WHERE p.id = period_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.recovery_documents FROM anon;
GRANT SELECT, INSERT ON TABLE public.recovery_documents TO authenticated;
GRANT ALL ON TABLE public.recovery_documents TO service_role;

DROP POLICY IF EXISTS recovery_files_select_own ON storage.objects;
CREATE POLICY recovery_files_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'recovery-files'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS recovery_files_insert_own ON storage.objects;
CREATE POLICY recovery_files_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'recovery-files'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- Needed only to clean up an uploaded blob when metadata persistence fails.
DROP POLICY IF EXISTS recovery_files_delete_own ON storage.objects;
CREATE POLICY recovery_files_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'recovery-files'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE OR REPLACE FUNCTION public.set_exception_workflow(
  p_period_id UUID,
  p_exception_id TEXT,
  p_patch JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_period public.periods%ROWTYPE;
  v_invoice JSONB;
  v_current JSONB;
  v_merged JSONB;
  v_history JSONB;
  v_event JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  IF p_exception_id IS NULL OR btrim(p_exception_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_EXCEPTION_ID';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_PATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_patch) AS patch_key(key)
    WHERE patch_key.key NOT IN (
      'status',
      'note',
      'recoveredAmount',
      'claimReference',
      'approvedClaimAmount',
      'submittedAmount',
      'acceptedAmount',
      'submittedOn',
      'responseOn',
      'recoveredOn'
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_PATCH_KEY';
  END IF;

  IF p_patch ? 'status'
     AND COALESCE(p_patch ->> 'status', '') NOT IN (
       'new', 'reviewing', 'contacted', 'disputed', 'recovered', 'closed'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_STATUS';
  END IF;

  IF p_patch ? 'note'
     AND p_patch -> 'note' <> 'null'::jsonb
     AND jsonb_typeof(p_patch -> 'note') <> 'string' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_NOTE';
  END IF;

  IF p_patch ? 'claimReference'
     AND p_patch -> 'claimReference' <> 'null'::jsonb
     AND (
       jsonb_typeof(p_patch -> 'claimReference') <> 'string'
       OR length(p_patch ->> 'claimReference') > 200
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CLAIM_REFERENCE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_patch) AS amount_field(key, value)
    WHERE amount_field.key IN (
      'recoveredAmount',
      'approvedClaimAmount',
      'submittedAmount',
      'acceptedAmount'
    )
      AND amount_field.value <> 'null'::jsonb
      AND (
        jsonb_typeof(amount_field.value) <> 'number'
        OR (amount_field.value #>> '{}')::numeric < 0
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RECOVERY_AMOUNT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_patch) AS date_field(key, value)
    WHERE date_field.key IN ('submittedOn', 'responseOn', 'recoveredOn')
      AND date_field.value <> 'null'::jsonb
      AND (
        jsonb_typeof(date_field.value) <> 'string'
        OR (date_field.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$'
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RECOVERY_DATE';
  END IF;

  SELECT *
  INTO v_period
  FROM public.periods
  WHERE id = p_period_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PERIOD_NOT_FOUND';
  END IF;

  v_invoice := COALESCE(v_period.invoice, '{}'::jsonb);

  IF jsonb_typeof(v_invoice -> 'exceptionWorkflow') IS DISTINCT FROM 'object' THEN
    v_invoice := jsonb_set(
      v_invoice,
      '{exceptionWorkflow}',
      '{}'::jsonb,
      true
    );
  END IF;

  v_current := COALESCE(
    v_invoice #> ARRAY['exceptionWorkflow', p_exception_id],
    '{"status":"new"}'::jsonb
  );
  v_merged := v_current || p_patch;

  IF NOT (v_merged ? 'status') THEN
    v_merged := jsonb_set(v_merged, '{status}', '"new"'::jsonb, true);
  END IF;

  v_history := CASE
    WHEN jsonb_typeof(v_current -> 'history') = 'array'
      THEN v_current -> 'history'
    ELSE '[]'::jsonb
  END;

  v_event := jsonb_strip_nulls(
    jsonb_build_object(
      'at', v_now,
      'status', v_merged ->> 'status',
      'note', v_merged -> 'note',
      'recoveredAmount', v_merged -> 'recoveredAmount',
      'claimReference', v_merged -> 'claimReference',
      'approvedClaimAmount', v_merged -> 'approvedClaimAmount',
      'submittedAmount', v_merged -> 'submittedAmount',
      'acceptedAmount', v_merged -> 'acceptedAmount',
      'submittedOn', v_merged -> 'submittedOn',
      'responseOn', v_merged -> 'responseOn',
      'recoveredOn', v_merged -> 'recoveredOn'
    )
  );

  INSERT INTO public.exception_events (
    user_id,
    period_id,
    exception_id,
    status,
    note,
    recovered_amount,
    claim_reference,
    approved_claim_amount,
    submitted_amount,
    accepted_amount,
    submitted_on,
    response_on,
    recovered_on,
    event_source,
    created_at
  )
  VALUES (
    v_user_id,
    p_period_id,
    p_exception_id,
    v_merged ->> 'status',
    NULLIF(v_merged ->> 'note', ''),
    COALESCE(NULLIF(v_merged ->> 'recoveredAmount', '')::numeric, 0),
    NULLIF(v_merged ->> 'claimReference', ''),
    NULLIF(v_merged ->> 'approvedClaimAmount', '')::numeric,
    NULLIF(v_merged ->> 'submittedAmount', '')::numeric,
    NULLIF(v_merged ->> 'acceptedAmount', '')::numeric,
    NULLIF(v_merged ->> 'submittedOn', '')::date,
    NULLIF(v_merged ->> 'responseOn', '')::date,
    NULLIF(v_merged ->> 'recoveredOn', '')::date,
    'rpc',
    v_now
  );

  v_merged := jsonb_set(v_merged, '{updatedAt}', to_jsonb(v_now), true);
  v_merged := jsonb_set(
    v_merged,
    '{history}',
    v_history || jsonb_build_array(v_event),
    true
  );

  v_invoice := jsonb_set(
    v_invoice,
    ARRAY['exceptionWorkflow', p_exception_id],
    v_merged,
    true
  );

  UPDATE public.periods
  SET invoice = v_invoice
  WHERE id = p_period_id
    AND user_id = v_user_id
  RETURNING * INTO v_period;

  RETURN to_jsonb(v_period);
END;
$$;

REVOKE ALL ON FUNCTION public.set_exception_workflow(UUID, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_exception_workflow(UUID, TEXT, JSONB)
  TO authenticated;
