-- Fix the contract audit trigger shared by platform_contracts, contract_versions,
-- contract_fee_rules and contract_documents.
--
-- 1. It read OLD.status / NEW.status directly. Only contract_versions has a status
--    column, so PL/pgSQL raised `record "old" has no field "status"` on every
--    insert, update or delete of a contract, fee rule or document. Read the status
--    from the JSON copy of the row instead, which is safe for every table.
-- 2. Since 0026, contract_rule_events.workspace_id is NOT NULL and defaults to the
--    caller's active workspace, which is empty for server (service role) writes.
--    Copy the workspace from the audited row instead.
--
-- Forward-only: replaces the function body; triggers, owner and grants are kept.
CREATE OR REPLACE FUNCTION public.log_contract_rule_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row JSONB;
  v_old JSONB;
  v_new JSONB;
  v_user_id UUID;
  v_workspace_id UUID;
  v_contract_id UUID;
  v_entity_id UUID;
  v_entity_type TEXT;
  v_event_type TEXT;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_row := COALESCE(v_new, v_old);
  v_user_id := (v_row ->> 'user_id')::uuid;
  v_workspace_id := (v_row ->> 'workspace_id')::uuid;

  IF TG_TABLE_NAME = 'platform_contracts' THEN
    v_contract_id := (v_row ->> 'id')::uuid;
    v_entity_id := v_contract_id;
    v_entity_type := 'contract';
  ELSIF TG_TABLE_NAME = 'contract_versions' THEN
    v_contract_id := (v_row ->> 'contract_id')::uuid;
    v_entity_id := (v_row ->> 'id')::uuid;
    v_entity_type := 'version';
  ELSIF TG_TABLE_NAME = 'contract_fee_rules' THEN
    v_contract_id := (v_row ->> 'contract_id')::uuid;
    v_entity_id := (v_row ->> 'id')::uuid;
    v_entity_type := 'rule';
  ELSE
    v_contract_id := (v_row ->> 'contract_id')::uuid;
    v_entity_id := (v_row ->> 'id')::uuid;
    v_entity_type := 'document';
  END IF;

  v_event_type := lower(TG_OP);
  IF TG_TABLE_NAME = 'contract_versions'
     AND TG_OP = 'UPDATE'
     AND (v_old ->> 'status') IS DISTINCT FROM 'approved'
     AND (v_new ->> 'status') = 'approved' THEN
    v_event_type := 'approve';
  END IF;

  INSERT INTO public.contract_rule_events (
    user_id,
    workspace_id,
    contract_id,
    entity_type,
    entity_id,
    event_type,
    before_data,
    after_data
  )
  VALUES (
    v_user_id,
    v_workspace_id,
    v_contract_id,
    v_entity_type,
    v_entity_id,
    v_event_type,
    v_old,
    v_new
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
