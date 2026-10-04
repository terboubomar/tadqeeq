-- Abuse limits and workspace hygiene (docs/SECURITY_BUILD_SPEC.md, L2 + L4). Re-runnable; safe to apply before or
-- after deploying the code.
--
-- L2: an AI assistant can open at most 30 upload links per company per hour.
-- L4: ensure_my_workspace no longer creates a trial company for ops staff, platform admins, or members a company
--     removed (they now see "not linked to a company" instead of getting a fresh trial).

CREATE INDEX IF NOT EXISTS mcp_audit_requests_workspace_idx ON public.mcp_audit_requests (workspace_id, created_at DESC);

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
  IF (
    SELECT count(*) FROM public.mcp_audit_requests
    WHERE workspace_id = v_ws AND created_at > now() - interval '1 hour'
  ) >= 30 THEN
    RAISE EXCEPTION 'Too many audit links in the last hour. Use an open link or try again later.';
  END IF;
  INSERT INTO public.mcp_audit_requests (workspace_id, user_id, platform, bank_fee_pct, label)
  VALUES (v_ws, auth.uid(), p_platform, p_bank_fee_pct, nullif(btrim(p_label), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_create_audit_request(text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_create_audit_request(text, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_my_workspace()
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_uid uuid := auth.uid(); v_ws uuid; v_email text; v_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = v_uid) THEN RETURN NULL; END IF;
  -- Tadqeeq staff use the ops console; they are not customers.
  IF EXISTS (SELECT 1 FROM public.ops_staff WHERE user_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = v_uid) THEN
    RETURN NULL;
  END IF;
  -- A member a company removed must be invited again, not handed a new trial.
  IF EXISTS (
    SELECT 1 FROM public.workspace_audit_events
    WHERE event_type = 'user_removed' AND metadata ->> 'userId' = v_uid::text
  ) THEN
    RETURN NULL;
  END IF;
  SELECT email, raw_user_meta_data->>'full_name' INTO v_email, v_name FROM auth.users WHERE id = v_uid;
  INSERT INTO public.profiles (id, full_name, email) VALUES (v_uid, v_name, v_email) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.workspaces (name, owner_user_id)
  VALUES (left('Tadqeeq · ' || COALESCE(NULLIF(btrim(v_name),''), NULLIF(split_part(v_email,'@',1),''), 'Workspace'),160), v_uid)
  RETURNING id INTO v_ws;
  INSERT INTO public.workspace_members (workspace_id, user_id, role, status, joined_at) VALUES (v_ws, v_uid, 'owner', 'active', now());
  INSERT INTO public.workspace_onboarding (workspace_id, status, contact_email, contact_name) VALUES (v_ws, 'pending_details', v_email, v_name);
  UPDATE public.profiles SET active_workspace_id = v_ws WHERE id = v_uid;
  RETURN v_ws;
END $f$;
REVOKE ALL ON FUNCTION public.ensure_my_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_workspace() TO authenticated;
