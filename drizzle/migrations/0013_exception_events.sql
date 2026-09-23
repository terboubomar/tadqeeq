-- P3-T4 (non-SILO portion): append-only exception workflow events.
-- Current period snapshots remain user-owned. No company roles, invites or
-- provisioning are introduced here.

CREATE TABLE IF NOT EXISTS public.exception_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  exception_id TEXT NOT NULL CHECK (length(btrim(exception_id)) > 0),
  status TEXT NOT NULL CHECK (
    status IN ('new', 'reviewing', 'contacted', 'disputed', 'recovered', 'closed')
  ),
  note TEXT,
  recovered_amount NUMERIC NOT NULL DEFAULT 0 CHECK (recovered_amount >= 0),
  event_source TEXT NOT NULL DEFAULT 'rpc' CHECK (event_source IN ('rpc', 'legacy')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exception_events_period_exception_created_idx
  ON public.exception_events (period_id, exception_id, created_at, id);

ALTER TABLE public.exception_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exception_events_select_own ON public.exception_events;
CREATE POLICY exception_events_select_own
  ON public.exception_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.periods p
      WHERE p.id = period_id
        AND p.user_id = auth.uid()
    )
  );

-- No direct INSERT/UPDATE/DELETE grant is given to authenticated users.
-- Events are written only by the validated workflow RPC below.
REVOKE INSERT, UPDATE, DELETE ON public.exception_events FROM authenticated;
GRANT SELECT ON public.exception_events TO authenticated;
GRANT ALL ON public.exception_events TO service_role;

-- Existing audit results become immutable to normal clients. The only allowed
-- mutation is the workflow materialization performed by set_exception_workflow.
REVOKE UPDATE ON public.periods FROM authenticated;

-- Preserve historical workflow entries already stored in period JSON.
INSERT INTO public.exception_events (
  user_id,
  period_id,
  exception_id,
  status,
  note,
  recovered_amount,
  event_source,
  created_at
)
SELECT
  p.user_id,
  p.id,
  workflow.key,
  COALESCE(NULLIF(event.item ->> 'status', ''), 'new'),
  NULLIF(event.item ->> 'note', ''),
  COALESCE(NULLIF(event.item ->> 'recoveredAmount', '')::numeric, 0),
  'legacy',
  COALESCE(NULLIF(event.item ->> 'at', '')::timestamptz, p.created_at)
FROM public.periods p
CROSS JOIN LATERAL jsonb_each(
  CASE
    WHEN jsonb_typeof(p.invoice -> 'exceptionWorkflow') = 'object'
      THEN p.invoice -> 'exceptionWorkflow'
    ELSE '{}'::jsonb
  END
) AS workflow(key, value)
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(workflow.value -> 'history') = 'array'
      THEN workflow.value -> 'history'
    ELSE '[]'::jsonb
  END
) AS event(item)
ON CONFLICT DO NOTHING;

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
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTH_REQUIRED';
  END IF;

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
    AND user_id = v_user_id
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

  INSERT INTO public.exception_events (
    user_id,
    period_id,
    exception_id,
    status,
    note,
    recovered_amount,
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
    'rpc',
    v_now
  );

  v_merged := jsonb_set(
    v_merged,
    '{updatedAt}',
    to_jsonb(v_now),
    true
  );

  -- Keep the current snapshot compatible with the existing UI, but the
  -- append-only exception_events table is now the immutable audit source.
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
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_exception_workflow(UUID, TEXT, JSONB)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.set_exception_workflow(UUID, TEXT, JSONB)
  TO authenticated;
