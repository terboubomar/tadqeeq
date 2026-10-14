-- Exception recovery workflow (gap analysis, Gap 3): turns رادار exceptions into claims.
--  1. Workflow statuses gain evidence_requested, classified, claimable and rejected (the existing six stay valid), and
--     an exception can carry an owner, a classification, a claimable amount and attached documents.
--  2. exception_classification_rules: a workspace's rules such as «Printers → hardware, not commissionable», applied
--     by the app to matching invoice-only exceptions in past and future periods.
--  3. exception-documents bucket: documents attached to exceptions, stored under <workspace_id>/…; read with
--     exceptions.read, written with exceptions.manage.
-- Additive and re-runnable; the previous app version keeps working (it only sends the older keys and statuses).
-- Must be applied to production before deploying the code that uses it.

ALTER TABLE public.exception_events DROP CONSTRAINT IF EXISTS exception_events_status_check;
ALTER TABLE public.exception_events ADD CONSTRAINT exception_events_status_check CHECK (
  status IN ('new', 'reviewing', 'evidence_requested', 'classified', 'claimable', 'contacted', 'disputed', 'recovered', 'rejected', 'closed')
);

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
    WHERE patch_key.key NOT IN ('status', 'note', 'recoveredAmount', 'owner', 'classification', 'claimableAmount', 'attachments')
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

CREATE TABLE IF NOT EXISTS public.exception_classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id()
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform text CHECK (platform IS NULL OR platform IN ('hungerstation', 'keeta', 'jahez')),
  -- Matched, case-insensitively, as a substring of the exception's invoice line («Printers», «الاشتراك الشهري»).
  match_text text NOT NULL CHECK (length(btrim(match_text)) BETWEEN 2 AND 120),
  classification text NOT NULL CHECK (length(btrim(classification)) BETWEEN 2 AND 120),
  commissionable boolean NOT NULL DEFAULT false,
  -- Whether a matching item is a claim against the platform (claimable) or a legitimate charge (classified).
  claimable boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exception_classification_rules_workspace_idx
  ON public.exception_classification_rules (workspace_id, created_at);

REVOKE ALL ON TABLE public.exception_classification_rules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exception_classification_rules TO authenticated;
GRANT ALL ON TABLE public.exception_classification_rules TO service_role;
ALTER TABLE public.exception_classification_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exception_classification_rules_read ON public.exception_classification_rules;
CREATE POLICY exception_classification_rules_read ON public.exception_classification_rules
  FOR SELECT TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'exceptions.read'));

DROP POLICY IF EXISTS exception_classification_rules_write ON public.exception_classification_rules;
CREATE POLICY exception_classification_rules_write ON public.exception_classification_rules
  FOR ALL TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'exceptions.manage'))
  WITH CHECK (private.has_workspace_permission(workspace_id, 'exceptions.manage'));

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('exception-documents', 'exception-documents', false, 20971520)
ON CONFLICT (id) DO NOTHING;

-- The first folder of every object is the workspace id; anything else is refused.
CREATE OR REPLACE FUNCTION private.can_access_exception_document(p_name text, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN private.has_workspace_permission(((storage.foldername(p_name))[1])::uuid, p_permission)
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION private.can_access_exception_document(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_exception_document(text,text) TO authenticated;

DROP POLICY IF EXISTS exception_documents_select ON storage.objects;
CREATE POLICY exception_documents_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'exception-documents' AND private.can_access_exception_document(name, 'exceptions.read'));

DROP POLICY IF EXISTS exception_documents_insert ON storage.objects;
CREATE POLICY exception_documents_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'exception-documents' AND private.can_access_exception_document(name, 'exceptions.manage'));

DROP POLICY IF EXISTS exception_documents_delete ON storage.objects;
CREATE POLICY exception_documents_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'exception-documents' AND private.can_access_exception_document(name, 'exceptions.manage'));
