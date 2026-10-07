-- Client-side daily operations. This is deliberately separate from periods and the accounting engine.

CREATE TABLE IF NOT EXISTS public.operation_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id() REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('hungerstation_orders','keeta_orders','jahez_orders','jahez_adjustments')),
  platform text NOT NULL CHECK (platform IN ('hungerstation','keeta','jahez')),
  business_date date NOT NULL,
  original_name text NOT NULL CHECK (length(original_name) BETWEEN 1 AND 255),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer NOT NULL CHECK (row_count >= 0),
  summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operation_imports_workspace_owner_fkey FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS operation_imports_workspace_source_sha_uidx
  ON public.operation_imports (workspace_id, source_kind, sha256);
CREATE INDEX IF NOT EXISTS operation_imports_workspace_date_idx
  ON public.operation_imports (workspace_id, business_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.operation_orders (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_import_id uuid NOT NULL REFERENCES public.operation_imports(id) ON DELETE RESTRICT,
  platform text NOT NULL CHECK (platform IN ('hungerstation','keeta','jahez')),
  order_id text NOT NULL CHECK (length(btrim(order_id)) BETWEEN 1 AND 120),
  business_date date NOT NULL,
  branch_id text,
  branch_name text,
  status text,
  delivery_mode text,
  gross_sales numeric(16,2) NOT NULL DEFAULT 0,
  delivery_amount numeric(16,2) NOT NULL DEFAULT 0,
  complaint boolean NOT NULL DEFAULT false,
  complaint_reason text,
  refund_type text,
  refund_amount numeric(16,2),
  charges_total numeric(16,2) NOT NULL DEFAULT 0,
  settlement_amount numeric(16,2) NOT NULL DEFAULT 0,
  raw_data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, platform, order_id),
  CONSTRAINT operation_orders_workspace_owner_fkey FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS operation_orders_workspace_date_idx
  ON public.operation_orders (workspace_id, business_date DESC, platform);

CREATE TABLE IF NOT EXISTS public.operation_adjustments (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_import_id uuid NOT NULL REFERENCES public.operation_imports(id) ON DELETE RESTRICT,
  platform text NOT NULL DEFAULT 'jahez' CHECK (platform = 'jahez'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  order_id text NOT NULL,
  business_date date NOT NULL,
  branch_name text,
  transaction_type text NOT NULL CHECK (transaction_type IN ('debit','credit')),
  reason text,
  amount numeric(16,2) NOT NULL CHECK (amount >= 0),
  comment text,
  raw_data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, fingerprint),
  CONSTRAINT operation_adjustments_workspace_owner_fkey FOREIGN KEY (workspace_id, user_id)
    REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS operation_adjustments_workspace_date_idx
  ON public.operation_adjustments (workspace_id, business_date DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['operation_imports','operation_orders','operation_adjustments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_workspace_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_workspace_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_workspace_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_workspace_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.has_workspace_permission(workspace_id, ''financials.read''))', t || '_workspace_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.has_workspace_permission(workspace_id, ''imports.create''))', t || '_workspace_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.has_workspace_permission(workspace_id, ''imports.create'')) WITH CHECK (private.has_workspace_permission(workspace_id, ''imports.create''))', t || '_workspace_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.has_workspace_permission(workspace_id, ''imports.create''))', t || '_workspace_delete', t);
  END LOOP;
END $$;

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
  v_rows integer := jsonb_array_length(COALESCE(p_orders, '[]'::jsonb)) + jsonb_array_length(COALESCE(p_adjustments, '[]'::jsonb));
BEGIN
  IF v_actor IS NULL OR v_workspace IS NULL OR NOT private.has_workspace_permission(v_workspace, 'imports.create') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT owner_user_id INTO v_owner FROM public.workspaces WHERE id = v_workspace;
  SELECT id INTO v_existing FROM public.operation_imports
    WHERE workspace_id = v_workspace AND source_kind = p_source_kind AND sha256 = p_sha256;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status','duplicate','import_id',v_existing,'rows',v_rows);
  END IF;

  INSERT INTO public.operation_imports
    (workspace_id,user_id,created_by,source_kind,platform,business_date,original_name,sha256,row_count,summary)
  VALUES (v_workspace,v_owner,v_actor,p_source_kind,p_platform,p_business_date,p_original_name,p_sha256,v_rows,p_summary)
  RETURNING id INTO v_import;

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
  RETURN jsonb_build_object('status','saved','import_id',v_import,'rows',v_rows);
END $$;

REVOKE ALL ON FUNCTION public.import_operation_snapshot(text,text,date,text,text,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_operation_snapshot(text,text,date,text,text,jsonb,jsonb,jsonb) TO authenticated, service_role;
