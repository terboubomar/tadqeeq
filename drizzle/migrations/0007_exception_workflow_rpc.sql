-- B6: atomically update one exception workflow entry inside a period.
-- The function runs with caller permissions/RLS and locks the selected period row
-- so concurrent edits to different exceptions cannot overwrite one another.

CREATE OR REPLACE FUNCTION public.set_exception_workflow(
  p_period_id UUID,
  p_exception_id TEXT,
  p_patch JSONB
)
RETURNS public.periods
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_period public.periods%ROWTYPE;
  v_invoice JSONB;
  v_current JSONB;
  v_merged JSONB;
  v_history JSONB;
  v_event JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_exception_id IS NULL OR btrim(p_exception_id) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_EXCEPTION_ID';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_WORKFLOW_PATCH';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_object_keys(p_patch) AS patch_key(key)
     WHERE patch_key.key NOT IN ('status', 'note', 'recoveredAmount')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_WORKFLOW_PATCH_KEY';
  END IF;

  IF p_patch ? 'status'
     AND COALESCE(p_patch ->> 'status', '') NOT IN (
       'new',
       'reviewing',
       'contacted',
       'disputed',
       'recovered',
       'closed'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_WORKFLOW_STATUS';
  END IF;

  IF p_patch ? 'note'
     AND p_patch -> 'note' <> 'null'::jsonb
     AND jsonb_typeof(p_patch -> 'note') <> 'string' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_WORKFLOW_NOTE';
  END IF;

  IF p_patch ? 'recoveredAmount'
     AND p_patch -> 'recoveredAmount' <> 'null'::jsonb
     AND jsonb_typeof(p_patch -> 'recoveredAmount') <> 'number' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_RECOVERED_AMOUNT';
  END IF;

  IF p_patch ? 'recoveredAmount'
     AND p_patch -> 'recoveredAmount' <> 'null'::jsonb
     AND (p_patch ->> 'recoveredAmount')::numeric < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_RECOVERED_AMOUNT';
  END IF;

  SELECT *
    INTO v_period
    FROM public.periods
   WHERE id = p_period_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'PERIOD_NOT_FOUND';
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
      'recoveredAmount', v_merged -> 'recoveredAmount'
    )
  );

  v_merged := jsonb_set(
    v_merged,
    '{updatedAt}',
    to_jsonb(v_now),
    true
  );

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
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$$;

REVOKE ALL ON FUNCTION public.set_exception_workflow(UUID, TEXT, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_exception_workflow(UUID, TEXT, JSONB)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.set_exception_workflow(UUID, TEXT, JSONB)
  TO authenticated;
