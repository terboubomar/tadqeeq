-- Tadqeeq in Claude and ChatGPT (the MCP) for every plan that has Tadqeeq AI.
--
-- 0040 opened the MCP to the الشاملة plan only. It now follows Tadqeeq AI: plans that include the
-- "ai" feature (الشاملة) and subscriptions with the add-on package (compensation center + Telegram bot +
-- Tadqeeq AI + Claude/ChatGPT) on any plan. Trial, suspended and other rules are unchanged.
--
-- Re-runnable (CREATE OR REPLACE). Apply to production before deploying the matching code.

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
  v_features jsonb;
  v_addons jsonb;
  v_has_ai boolean;
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
    SELECT p.code, p.name, p.features, s.addons INTO v_plan_code, v_plan_name, v_features, v_addons
    FROM public.subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
    WHERE s.workspace_id = v_ws AND s.status IN ('active', 'trial', 'overdue')
    ORDER BY s.created_at DESC
    LIMIT 1;
  END IF;
  v_has_ai := coalesce(v_features ? 'ai', false) OR coalesce(v_addons ? 'compensation_ai', false);

  v_reason := CASE
    WHEN v_admin THEN NULL
    WHEN v_ws IS NULL THEN 'no_workspace'
    WHEN v_status = 'suspended' THEN 'suspended'
    WHEN coalesce(v_status, 'active') <> 'active' THEN 'trial'
    WHEN NOT v_has_ai THEN 'plan'
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
    'has_addon', coalesce(v_addons ? 'compensation_ai', false),
    'allowed', v_reason IS NULL,
    'reason', v_reason
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_access() TO authenticated;
