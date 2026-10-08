-- Delete one Daily Operations upload and only the rows derived from that upload.

CREATE OR REPLACE FUNCTION public.delete_operation_import(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_workspace uuid := private.active_workspace_id();
  v_actor uuid := auth.uid();
  v_import public.operation_imports%ROWTYPE;
BEGIN
  IF v_actor IS NULL
    OR v_workspace IS NULL
    OR NOT private.has_workspace_permission(v_workspace, 'imports.create')
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_import
  FROM public.operation_imports
  WHERE id = p_import_id AND workspace_id = v_workspace
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operation import not found';
  END IF;

  DELETE FROM public.operation_adjustments
  WHERE workspace_id = v_workspace AND source_import_id = p_import_id;

  DELETE FROM public.operation_orders
  WHERE workspace_id = v_workspace AND source_import_id = p_import_id;

  DELETE FROM public.operation_imports
  WHERE workspace_id = v_workspace AND id = p_import_id;

  RETURN jsonb_build_object(
    'import_id', v_import.id,
    'source_kind', v_import.source_kind,
    'business_date', v_import.business_date,
    'original_name', v_import.original_name
  );
END $$;

REVOKE ALL ON FUNCTION public.delete_operation_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_operation_import(uuid) TO authenticated, service_role;
