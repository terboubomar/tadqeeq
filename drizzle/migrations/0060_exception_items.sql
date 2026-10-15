-- 0060: a status and a document reference for each charge inside a combined exception.
--
-- An exception such as «بنود خصم غير مصنفة» groups several invoice charges (printers, a monthly subscription, a
-- free-delivery campaign). set_exception_workflow now accepts `items`: one decision per charge, each
-- {line, status: pending | accepted | claimable, documentRef}. Everything else is unchanged from 0059.
-- Additive and re-runnable; the previous app version keeps working (it never sends `items`).

CREATE OR REPLACE FUNCTION public.set_exception_workflow(
  p_period_id uuid,
  p_exception_id text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_workspace UUID := private.active_workspace_id();
  v_owner UUID;
  v_period public.periods%ROWTYPE;
  v_invoice JSONB;
  v_current JSONB;
  v_merged JSONB;
  v_history JSONB;
  v_event JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_actor IS NULL OR v_workspace IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  IF NOT private.has_workspace_permission(v_workspace, 'exceptions.manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FORBIDDEN';
  END IF;

  SELECT owner_user_id INTO v_owner
  FROM public.workspaces
  WHERE id = v_workspace;

  IF p_exception_id IS NULL OR btrim(p_exception_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_EXCEPTION_ID';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_PATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_patch) AS patch_key(key)
    WHERE patch_key.key NOT IN ('status', 'note', 'recoveredAmount', 'owner', 'classification', 'claimableAmount', 'attachments', 'items')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_PATCH_KEY';
  END IF;

  IF p_patch ? 'status'
     AND COALESCE(p_patch ->> 'status', '') NOT IN (
       'new','reviewing','evidence_requested','classified','claimable','contacted','disputed','recovered','rejected','closed'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_STATUS';
  END IF;

  IF p_patch ? 'note'
     AND p_patch -> 'note' <> 'null'::jsonb
     AND jsonb_typeof(p_patch -> 'note') <> 'string' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_NOTE';
  END IF;

  IF p_patch ? 'recoveredAmount'
     AND p_patch -> 'recoveredAmount' <> 'null'::jsonb
     AND (
       jsonb_typeof(p_patch -> 'recoveredAmount') <> 'number'
       OR (p_patch ->> 'recoveredAmount')::numeric < 0
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RECOVERED_AMOUNT';
  END IF;

  IF p_patch ? 'claimableAmount'
     AND p_patch -> 'claimableAmount' <> 'null'::jsonb
     AND (
       jsonb_typeof(p_patch -> 'claimableAmount') <> 'number'
       OR (p_patch ->> 'claimableAmount')::numeric < 0
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CLAIMABLE_AMOUNT';
  END IF;

  IF (p_patch ? 'owner' AND p_patch -> 'owner' <> 'null'::jsonb
        AND (jsonb_typeof(p_patch -> 'owner') <> 'string' OR length(p_patch ->> 'owner') > 120))
     OR (p_patch ? 'classification' AND p_patch -> 'classification' <> 'null'::jsonb
        AND (jsonb_typeof(p_patch -> 'classification') <> 'string' OR length(p_patch ->> 'classification') > 200)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_TEXT';
  END IF;

  -- Attachments: up to 20 documents, each {path, name}, stored in this workspace's folder of exception-documents.
  IF p_patch ? 'attachments' AND p_patch -> 'attachments' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_patch -> 'attachments') <> 'array'
       OR jsonb_array_length(p_patch -> 'attachments') > 20
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_patch -> 'attachments') AS item(value)
         WHERE jsonb_typeof(item.value) <> 'object'
            OR jsonb_typeof(item.value -> 'path') <> 'string'
            OR jsonb_typeof(item.value -> 'name') <> 'string'
            OR NOT ((item.value ->> 'path') LIKE v_workspace::text || '/%')
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ATTACHMENTS';
    END IF;
  END IF;

  -- Items: one decision per charge inside a combined exception, up to 50, each {line, status, documentRef}, where
  -- status is pending, accepted (a valid fee) or claimable (disputed), and documentRef names the supporting document.
  IF p_patch ? 'items' AND p_patch -> 'items' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_patch -> 'items') <> 'array'
       OR jsonb_array_length(p_patch -> 'items') > 50
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_patch -> 'items') AS item(value)
         WHERE jsonb_typeof(item.value) <> 'object'
            OR jsonb_typeof(item.value -> 'line') IS DISTINCT FROM 'string'
            OR length(item.value ->> 'line') NOT BETWEEN 1 AND 200
            OR COALESCE(item.value ->> 'status', '') NOT IN ('pending', 'accepted', 'claimable')
            OR (item.value ? 'documentRef' AND item.value -> 'documentRef' <> 'null'::jsonb
                AND (jsonb_typeof(item.value -> 'documentRef') <> 'string' OR length(item.value ->> 'documentRef') > 200))
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_ITEMS';
    END IF;
  END IF;

  SELECT *
  INTO v_period
  FROM public.periods
  WHERE id = p_period_id
    AND workspace_id = v_workspace
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PERIOD_NOT_FOUND';
  END IF;

  v_invoice := COALESCE(v_period.invoice, '{}'::jsonb);

  IF jsonb_typeof(v_invoice -> 'exceptionWorkflow') IS DISTINCT FROM 'object' THEN
    v_invoice := jsonb_set(v_invoice, '{exceptionWorkflow}', '{}'::jsonb, true);
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
      'owner', v_merged -> 'owner',
      'claimableAmount', v_merged -> 'claimableAmount'
    )
  );

  INSERT INTO public.exception_events (
    user_id,
    workspace_id,
    period_id,
    exception_id,
    status,
    note,
    recovered_amount,
    event_source,
    created_at
  )
  VALUES (
    v_owner,
    v_workspace,
    p_period_id,
    p_exception_id,
    v_merged ->> 'status',
    NULLIF(v_merged ->> 'note', ''),
    COALESCE(NULLIF(v_merged ->> 'recoveredAmount', '')::numeric, 0),
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
    AND workspace_id = v_workspace
  RETURNING * INTO v_period;

  RETURN to_jsonb(v_period);
END;
$$;
REVOKE ALL ON FUNCTION public.set_exception_workflow(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_exception_workflow(uuid,text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_exception_workflow(uuid,text,jsonb) TO authenticated;
