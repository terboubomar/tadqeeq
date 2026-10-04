-- Audits started from an AI assistant (Claude, ChatGPT) through the Tadqeeq MCP.
--
-- The assistant cannot pass large Excel/PDF files to the MCP, so it asks for an audit request and
-- gives the user a link to /import with the platform and bank fee filled in. The upload runs the
-- normal engine as the signed-in user; when the period is saved (or turns out to be a duplicate),
-- the server marks the request complete with that period so the assistant can read the result.
--
-- The MCP is part of the الشاملة plan (code 'unlimited'); mcp_access() says whether the caller's
-- workspace may use it. Platform admins may always use it.
--
-- Additive and re-runnable. Apply to production before deploying the code that calls these functions.

CREATE TABLE IF NOT EXISTS public.mcp_audit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('hungerstation', 'keeta', 'jahez')),
  bank_fee_pct numeric CHECK (bank_fee_pct IS NULL OR (bank_fee_pct >= 0 AND bank_fee_pct <= 10)),
  label text CHECK (label IS NULL OR length(label) <= 120),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  period_id uuid REFERENCES public.periods(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_audit_requests_user_idx ON public.mcp_audit_requests (user_id, created_at DESC);

ALTER TABLE public.mcp_audit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_audit_requests FROM anon, authenticated;
GRANT SELECT ON public.mcp_audit_requests TO authenticated;
GRANT ALL ON public.mcp_audit_requests TO service_role;
DROP POLICY IF EXISTS mcp_audit_requests_own_select ON public.mcp_audit_requests;
CREATE POLICY mcp_audit_requests_own_select ON public.mcp_audit_requests FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Who is calling, which workspace and plan, and whether the MCP is open to them.
CREATE OR REPLACE FUNCTION public.mcp_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_admin boolean;
  v_email text;
  v_ws_name text;
  v_role text;
  v_status text;
  v_plan_code text;
  v_plan_name text;
  v_reason text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  v_admin := public.is_platform_admin();
  v_ws := private.active_workspace_id();
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_ws IS NOT NULL THEN
    SELECT name INTO v_ws_name FROM public.workspaces WHERE id = v_ws;
    v_role := private.workspace_role(v_ws);
    SELECT status INTO v_status FROM public.workspace_onboarding WHERE workspace_id = v_ws;
    SELECT p.code, p.name INTO v_plan_code, v_plan_name
    FROM public.subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE s.workspace_id = v_ws AND s.status IN ('active', 'trial', 'overdue')
    ORDER BY s.created_at DESC
    LIMIT 1;
  END IF;

  v_reason := CASE
    WHEN v_admin THEN NULL
    WHEN v_ws IS NULL THEN 'no_workspace'
    WHEN v_status = 'suspended' THEN 'suspended'
    WHEN coalesce(v_status, 'active') <> 'active' THEN 'trial'
    WHEN v_plan_code IS DISTINCT FROM 'unlimited' THEN 'plan'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'email', v_email,
    'workspace_id', v_ws,
    'workspace_name', v_ws_name,
    'role', v_role,
    'onboarding_status', coalesce(v_status, 'active'),
    'plan_code', v_plan_code,
    'plan_name', v_plan_name,
    'allowed', v_reason IS NULL,
    'reason', v_reason
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_access() TO authenticated;

-- Opens an audit request for the caller's workspace (MCP plan and upload permission required).
CREATE OR REPLACE FUNCTION public.mcp_create_audit_request(p_platform text, p_bank_fee_pct numeric, p_label text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_access jsonb := public.mcp_access();
  v_ws uuid;
  v_id uuid;
BEGIN
  IF v_access IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  IF NOT (v_access ->> 'allowed')::boolean THEN RAISE EXCEPTION 'MCP not available: %', v_access ->> 'reason'; END IF;
  v_ws := (v_access ->> 'workspace_id')::uuid;
  IF v_ws IS NULL OR NOT private.has_workspace_permission(v_ws, 'imports.create') THEN
    RAISE EXCEPTION 'Your role cannot upload files in this workspace';
  END IF;
  INSERT INTO public.mcp_audit_requests (workspace_id, user_id, platform, bank_fee_pct, label)
  VALUES (v_ws, auth.uid(), p_platform, p_bank_fee_pct, nullif(btrim(p_label), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_create_audit_request(text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_create_audit_request(text, numeric, text) TO authenticated;

-- Called by the upload after the period is saved: links the caller's open request to the period.
CREATE OR REPLACE FUNCTION public.mcp_complete_audit_request(p_request_id uuid, p_period_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req public.mcp_audit_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.mcp_audit_requests WHERE id = p_request_id AND user_id = auth.uid();
  IF v_req.id IS NULL OR v_req.status <> 'pending' OR v_req.expires_at < now() THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.periods
    WHERE id = p_period_id AND workspace_id = v_req.workspace_id AND platform = v_req.platform
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.mcp_audit_requests SET status = 'completed', period_id = p_period_id, completed_at = now() WHERE id = v_req.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_complete_audit_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_complete_audit_request(uuid, uuid) TO authenticated;
