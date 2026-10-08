-- Account-level subscriptions with plan-controlled company workspaces.
--
-- The signup workspace remains the account's first company. Trial accounts cannot create
-- another company. Once an account has an active subscription, the plan controls the total
-- number of owner workspaces: البداية 1, النمو 3, الشاملة unlimited.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS workspace_limit integer
    CHECK (workspace_limit IS NULL OR workspace_limit >= 1);

UPDATE public.subscription_plans SET workspace_limit = 1 WHERE workspace_limit IS NULL;
UPDATE public.subscription_plans SET workspace_limit = 1 WHERE code = 'start';
UPDATE public.subscription_plans SET workspace_limit = 3 WHERE code = 'growth';
UPDATE public.subscription_plans SET workspace_limit = NULL WHERE code = 'unlimited';

-- A restaurant period may legitimately exist in two companies owned by the same account.
DROP INDEX IF EXISTS public.periods_user_platform_active_range_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS periods_workspace_platform_active_range_unique_idx
  ON public.periods (workspace_id, platform, period_start, period_end)
  WHERE period_start IS NOT NULL
    AND period_end IS NOT NULL
    AND superseded_at IS NULL;

-- HungerStation branch identity is company-specific as well.
ALTER TABLE public.hungerstation_branch_mappings
  DROP CONSTRAINT IF EXISTS hungerstation_branch_mappings_user_id_hs_branch_id_key;
DROP INDEX IF EXISTS public.hungerstation_branch_mappings_user_invoice_name_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS hungerstation_branch_mappings_workspace_branch_unique_idx
  ON public.hungerstation_branch_mappings (workspace_id, hs_branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS hungerstation_branch_mappings_workspace_invoice_name_unique_idx
  ON public.hungerstation_branch_mappings (workspace_id, lower(btrim(invoice_branch_name)));

-- Data policies remain plan- and MFA-aware. Membership can span companies, but application data
-- is visible only for the workspace selected in the profile. Resolve plan features from the
-- owner account so secondary workspaces inherit the same subscription.
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
  v_owner uuid;
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

  SELECT owner_user_id INTO v_owner FROM public.workspaces WHERE id = p_workspace_id;
  SELECT p.features, s.addons, true INTO v_features, v_addons, v_found
  FROM public.subscriptions s
  JOIN public.workspaces w ON w.id = s.workspace_id
  JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE w.owner_user_id = v_owner AND s.status IN ('active', 'trial', 'overdue')
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
  SELECT p_workspace_id = private.active_workspace_id()
     AND private.workspace_role_allows(p_workspace_id, p_permission)
     AND private.workspace_feature_allows(p_workspace_id, p_permission)
     AND private.mfa_satisfied();
$$;

REVOKE ALL ON FUNCTION private.workspace_feature_allows(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_workspace_permission(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.workspace_feature_allows(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_workspace_permission(uuid,text) TO authenticated;

-- A subscription belongs to the owner account. It can be stored against any company owned by
-- that account, while usage and entitlements are shared across all of those companies.
CREATE OR REPLACE FUNCTION public.my_workspace_plan(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_sub record;
  v_uploads integer;
  v_month date;
  v_orders numeric;
  v_workspace_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF NOT private.is_workspace_member(p_workspace_id) AND NOT public.is_platform_admin() THEN
    RETURN NULL;
  END IF;

  SELECT owner_user_id INTO v_owner FROM public.workspaces WHERE id = p_workspace_id;
  IF v_owner IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_workspace_count
  FROM public.workspaces WHERE owner_user_id = v_owner;

  SELECT count(*) INTO v_uploads
  FROM public.periods p
  JOIN public.workspaces w ON w.id = p.workspace_id
  WHERE w.owner_user_id = v_owner
    AND p.created_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh');

  WITH current_periods AS (
    SELECT date_trunc('month', coalesce(p.period_start, (p.created_at AT TIME ZONE 'Asia/Riyadh')::date))::date AS month,
           CASE WHEN jsonb_typeof(p.summary -> 'orders') = 'number' THEN (p.summary ->> 'orders')::numeric ELSE 0 END AS orders
    FROM public.periods p
    JOIN public.workspaces w ON w.id = p.workspace_id
    WHERE w.owner_user_id = v_owner AND p.superseded_at IS NULL
  )
  SELECT month, sum(orders) INTO v_month, v_orders
  FROM current_periods
  WHERE month = (SELECT max(month) FROM current_periods)
  GROUP BY month;
  v_orders := coalesce(v_orders, 0);

  SELECT p.id, p.name, p.features, p.upload_limit, p.order_limit, p.workspace_limit, s.addons
  INTO v_sub
  FROM public.subscriptions s
  JOIN public.workspaces w ON w.id = s.workspace_id
  JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE w.owner_user_id = v_owner AND s.status IN ('active','trial','overdue')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN jsonb_build_object(
      'plan_id', null, 'plan_name', null, 'features', null, 'upload_limit', null,
      'uploads_this_month', v_uploads, 'order_limit', null, 'monthly_orders', v_orders,
      'orders_month', v_month, 'orders_this_month', v_orders, 'addons', '[]'::jsonb,
      'workspace_limit', 0, 'workspace_count', v_workspace_count
    );
  END IF;

  RETURN jsonb_build_object(
    'plan_id', v_sub.id, 'plan_name', v_sub.name, 'features', v_sub.features,
    'upload_limit', v_sub.upload_limit, 'uploads_this_month', v_uploads,
    'order_limit', v_sub.order_limit, 'monthly_orders', v_orders, 'orders_month', v_month,
    'orders_this_month', v_orders, 'addons', coalesce(v_sub.addons, '[]'::jsonb),
    'workspace_limit', v_sub.workspace_limit, 'workspace_count', v_workspace_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_workspace_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_workspace_plan(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.switch_my_workspace(p_workspace_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT private.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'You are not an active member of this workspace';
  END IF;

  UPDATE public.profiles SET active_workspace_id = p_workspace_id WHERE id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  RETURN p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.switch_my_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_my_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_account_workspace(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text := btrim(p_name);
  v_plan record;
  v_count integer;
  v_workspace uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF length(v_name) < 1 OR length(v_name) > 160 THEN
    RAISE EXCEPTION 'Workspace name must be between 1 and 160 characters';
  END IF;

  -- Serialize the quota check and creation for this account.
  PERFORM 1 FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT p.workspace_limit INTO v_plan
  FROM public.subscriptions s
  JOIN public.workspaces w ON w.id = s.workspace_id
  JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE w.owner_user_id = v_user AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active subscription is required to create a workspace';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces w
    JOIN public.workspace_onboarding o ON o.workspace_id = w.id
    WHERE w.owner_user_id = v_user AND o.status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active account is required to create a workspace';
  END IF;

  SELECT count(*) INTO v_count FROM public.workspaces WHERE owner_user_id = v_user;
  IF v_plan.workspace_limit IS NOT NULL AND v_count >= v_plan.workspace_limit THEN
    RAISE EXCEPTION 'Workspace limit reached for this subscription';
  END IF;

  INSERT INTO public.workspaces (name, owner_user_id)
  VALUES (v_name, v_user)
  RETURNING id INTO v_workspace;

  INSERT INTO public.workspace_members (workspace_id, user_id, role, status)
  VALUES (v_workspace, v_user, 'owner', 'active');

  INSERT INTO public.workspace_onboarding (workspace_id, status, activated_at)
  VALUES (v_workspace, 'active', now());

  UPDATE public.profiles SET active_workspace_id = v_workspace WHERE id = v_user;

  INSERT INTO public.workspace_audit_events
    (workspace_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  VALUES
    (v_workspace, v_user, 'workspace.created', 'workspace', v_workspace::text, jsonb_build_object('name', v_name));

  RETURN v_workspace;
END;
$$;

REVOKE ALL ON FUNCTION public.create_account_workspace(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_account_workspace(text) TO authenticated;
