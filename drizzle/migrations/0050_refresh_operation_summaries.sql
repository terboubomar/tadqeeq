-- Reprocessing an identical daily source file may refresh derived summary fields without duplicating rows.

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
      SET summary = p_summary, row_count = v_rows, original_name = p_original_name
      WHERE id = v_existing;
    v_import := v_existing;
    v_status := 'duplicate';
  ELSE
    INSERT INTO public.operation_imports
      (workspace_id,user_id,created_by,source_kind,platform,business_date,original_name,sha256,row_count,summary)
    VALUES (v_workspace,v_owner,v_actor,p_source_kind,p_platform,p_business_date,p_original_name,p_sha256,v_rows,p_summary)
    RETURNING id INTO v_import;
  END IF;

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
