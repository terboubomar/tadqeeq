-- Plan limits and engine-only invoice periods, enforced in the database (docs/SECURITY_BUILD_SPEC.md, M4 + L3).
--
-- M4: plan features (contracts, compensation, Tadqeeq AI, exceptions, financials) were only removed from a
-- user's permissions by the app server. A trial or lower-plan member calling the database API directly with
-- their own token could still use them. private.has_workspace_permission now also asks the plan, with the
-- same rules as the app (src/lib/plans.ts resolvePlanAccess + featuresWithAddons):
--   * onboarding steps before "active" (the free trial) allow only invoice_audit;
--   * otherwise the latest live subscription's plan features, plus compensation + ai with the add-on;
--   * no live subscription with a plan = everything (as the app does for accounts without a plan);
--   * platform admins are never limited.
-- Permissions that belong to no plan feature (periods.read, imports.create, users.manage...) are unchanged.
-- The role rules are kept exactly as they were (copied from 0026), now in private.workspace_role_allows.
--
-- L3: members can no longer insert or update public.periods directly; the upload saves periods on the server
-- (service role, after its own permission check) and re-analysis uses its SECURITY DEFINER functions.
-- Reading and deleting periods are unchanged.
--
-- Re-runnable. Apply AFTER deploying the code that saves uploads on the server (the old code saves periods as
-- the user, which this migration blocks; the new code works with or without it).

CREATE OR REPLACE FUNCTION private.workspace_role_allows(
  p_workspace_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH member AS (
    SELECT wm.role
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = (select auth.uid())
      AND wm.status = 'active'
    LIMIT 1
  )
  SELECT COALESCE(
    CASE (SELECT role FROM member)
      WHEN 'owner' THEN true
      WHEN 'admin' THEN p_permission <> 'workspace.owner.transfer'
      WHEN 'auditor' THEN p_permission = ANY (ARRAY[
        'branches.read',
        'imports.create',
        'periods.read',
        'periods.reanalyze',
        'reports.read',
        'financials.read',
        'contracts.read',
        'contracts.manage',
        'exceptions.read',
        'exceptions.manage',
        'compensation.read',
        'compensation.manage',
        'telegram.read',
        'recovery.read',
        'recovery.manage',
        'ai.use',
        'audit_log.read'
      ])
      WHEN 'compensation' THEN p_permission = ANY (ARRAY[
        'branches.read',
        'compensation.read',
        'compensation.manage',
        'telegram.read',
        'telegram.manage',
        'recovery.read',
        'recovery.manage',
        'ai.use'
      ])
      WHEN 'branch_manager' THEN p_permission = ANY (ARRAY[
        'branches.read',
        'compensation.read',
        'telegram.read'
      ])
      WHEN 'viewer' THEN p_permission = ANY (ARRAY[
        'branches.read',
        'periods.read',
        'reports.read',
        'financials.read',
        'contracts.read',
        'exceptions.read',
        'compensation.read',
        'recovery.read'
      ])
      ELSE false
    END,
    false
  );
$$;

CREATE OR REPLACE FUNCTION private.workspace_feature_allows(p_workspace_id uuid, p_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_feature text;
  v_status text;
  v_features jsonb;
  v_addons jsonb;
  v_found boolean := false;
BEGIN
  v_feature := CASE
    WHEN p_permission = 'financials.read' THEN 'invoice_audit'
    WHEN p_permission IN ('exceptions.read', 'exceptions.manage') THEN 'exceptions'
    WHEN p_permission IN ('compensation.read', 'compensation.manage', 'telegram.read', 'telegram.manage', 'recovery.read', 'recovery.manage') THEN 'compensation'
    WHEN p_permission IN ('contracts.read', 'contracts.manage') THEN 'contracts'
    WHEN p_permission = 'ai.use' THEN 'ai'
    ELSE NULL
  END;
  IF v_feature IS NULL THEN RETURN true; END IF;
  IF public.is_platform_admin() THEN RETURN true; END IF;

  SELECT status INTO v_status FROM public.workspace_onboarding WHERE workspace_id = p_workspace_id;
  IF v_status IN ('pending_details', 'meeting_booked', 'awaiting_payment', 'onboarding') THEN
    RETURN v_feature = 'invoice_audit';
  END IF;

  SELECT p.features, s.addons, true INTO v_features, v_addons, v_found
  FROM public.subscriptions s
  JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.workspace_id = p_workspace_id AND s.status IN ('active', 'trial', 'overdue')
  ORDER BY s.created_at DESC
  LIMIT 1;
  IF NOT coalesce(v_found, false) THEN RETURN true; END IF;

  IF coalesce(v_features ? v_feature, false) THEN RETURN true; END IF;
  RETURN v_feature IN ('compensation', 'ai') AND coalesce(v_addons ? 'compensation_ai', false);
END;
$$;

CREATE OR REPLACE FUNCTION private.has_workspace_permission(
  p_workspace_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.workspace_role_allows(p_workspace_id, p_permission)
     AND private.workspace_feature_allows(p_workspace_id, p_permission);
$$;

REVOKE ALL ON FUNCTION private.workspace_role_allows(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.workspace_feature_allows(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.workspace_role_allows(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.workspace_feature_allows(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_workspace_permission(uuid, text) TO authenticated;

-- L3: invoice periods are written by the server only.
REVOKE INSERT, UPDATE ON public.periods FROM authenticated;
DROP POLICY IF EXISTS periods_workspace_insert ON public.periods;
DROP POLICY IF EXISTS periods_workspace_update ON public.periods;
