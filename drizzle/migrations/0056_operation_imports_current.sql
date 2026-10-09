-- Daily Operations: one current upload per source and day, and orders that span days.
-- 1. The upload that owns a day's rows is the only one counted. Re-uploading an older file makes it current again;
--    deleting the current upload leaves the day empty instead of falling back to an older summary with no rows.
-- 2. An order can appear on more than one day (Keeta records a cancellation's compensation, or an order's sales, on a
--    later day), so an order is stored once per day. Re-runnable.

ALTER TABLE public.operation_imports ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- Existing data: the newest upload for each source and day is current, older ones are superseded.
UPDATE public.operation_imports AS i
SET superseded_at = COALESCE(i.superseded_at, now())
WHERE i.superseded_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.operation_imports AS newer
    WHERE newer.workspace_id = i.workspace_id
      AND newer.source_kind = i.source_kind
      AND newer.business_date = i.business_date
      AND (newer.created_at, newer.id) > (i.created_at, i.id)
  );

CREATE INDEX IF NOT EXISTS operation_imports_workspace_current_idx
  ON public.operation_imports (workspace_id, business_date DESC) WHERE superseded_at IS NULL;

ALTER TABLE public.operation_orders DROP CONSTRAINT IF EXISTS operation_orders_pkey;
ALTER TABLE public.operation_orders
  ADD CONSTRAINT operation_orders_pkey PRIMARY KEY (workspace_id, platform, business_date, order_id);

CREATE OR REPLACE FUNCTION public.import_operation_snapshot(
  p_source_kind text, p_platform text, p_business_date date, p_original_name text,
  p_sha256 text, p_summary jsonb, p_orders jsonb, p_adjustments jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, private, pg_temp AS $$
DECLARE
  v_workspace uuid := private.active_workspace_id();
  v_owner uuid;
  v_actor uuid := auth.uid();
  v_import uuid;
  v_existing uuid;
  v_status text := 'saved';
  v_rows integer := jsonb_array_length(COALESCE(p_orders, '[]'::jsonb)) + jsonb_array_length(COALESCE(p_adjustments, '[]'::jsonb));
BEGIN
  IF v_actor IS NULL OR v_workspace IS NULL OR NOT private.has_workspace_permission(v_workspace, 'imports.create') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT owner_user_id INTO v_owner FROM public.workspaces WHERE id = v_workspace;
  SELECT id INTO v_existing FROM public.operation_imports
    WHERE workspace_id = v_workspace AND source_kind = p_source_kind AND sha256 = p_sha256;
  IF v_existing IS NOT NULL THEN
    UPDATE public.operation_imports
      SET summary = p_summary, row_count = v_rows, original_name = p_original_name, superseded_at = NULL
      WHERE id = v_existing;
    v_import := v_existing;
    v_status := 'duplicate';
  ELSE
    INSERT INTO public.operation_imports
      (workspace_id,user_id,created_by,source_kind,platform,business_date,original_name,sha256,row_count,summary)
    VALUES (v_workspace,v_owner,v_actor,p_source_kind,p_platform,p_business_date,p_original_name,p_sha256,v_rows,p_summary)
    RETURNING id INTO v_import;
  END IF;

  -- This upload now owns the day's rows; every other upload of the same source and day stops counting.
  UPDATE public.operation_imports
    SET superseded_at = now()
    WHERE workspace_id = v_workspace AND source_kind = p_source_kind AND business_date = p_business_date
      AND id <> v_import AND superseded_at IS NULL;

  IF p_source_kind <> 'jahez_adjustments' THEN
    DELETE FROM public.operation_orders
      WHERE workspace_id = v_workspace AND platform = p_platform AND business_date = p_business_date;
    INSERT INTO public.operation_orders
      (workspace_id,user_id,source_import_id,platform,order_id,business_date,branch_id,branch_name,status,delivery_mode,
       gross_sales,delivery_amount,complaint,complaint_reason,refund_type,refund_amount,charges_total,settlement_amount,raw_data)
    SELECT v_workspace,v_owner,v_import,p_platform,x."orderId",x."businessDate"::date,x."branchId",x."branchName",x.status,x."deliveryMode",
      x."grossSales",x."deliveryAmount",x.complaint,x."complaintReason",x."refundType",x."refundAmount",x."chargesTotal",x."settlementAmount",x."rawData"
    FROM jsonb_to_recordset(COALESCE(p_orders,'[]'::jsonb)) AS x(
      "orderId" text,"businessDate" text,"branchId" text,"branchName" text,status text,"deliveryMode" text,
      "grossSales" numeric,"deliveryAmount" numeric,complaint boolean,"complaintReason" text,"refundType" text,
      "refundAmount" numeric,"chargesTotal" numeric,"settlementAmount" numeric,"rawData" jsonb
    );
  ELSE
    DELETE FROM public.operation_adjustments
      WHERE workspace_id = v_workspace AND business_date = p_business_date;
    INSERT INTO public.operation_adjustments
      (workspace_id,user_id,source_import_id,fingerprint,order_id,business_date,branch_name,transaction_type,reason,amount,comment,raw_data)
    SELECT v_workspace,v_owner,v_import,x.fingerprint,x."orderId",x."businessDate"::date,x."branchName",x."transactionType",x.reason,x.amount,x.comment,x."rawData"
    FROM jsonb_to_recordset(COALESCE(p_adjustments,'[]'::jsonb)) AS x(
      fingerprint text,"orderId" text,"businessDate" text,"branchName" text,"transactionType" text,reason text,amount numeric,comment text,"rawData" jsonb
    );
  END IF;
  RETURN jsonb_build_object('status',v_status,'import_id',v_import,'rows',v_rows);
END $$;

REVOKE ALL ON FUNCTION public.import_operation_snapshot(text,text,date,text,text,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_operation_snapshot(text,text,date,text,text,jsonb,jsonb,jsonb) TO authenticated, service_role;
