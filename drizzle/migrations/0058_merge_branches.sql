-- Cross-platform branch mapping: the same restaurant branch is named differently on each platform (emoji, promo text,
-- spelling), so an upload can add it to branch_registry as a second row. merge_branches folds one row into another
-- in a single transaction: the kept row takes the other's platform ids, every reference (team branch access, Telegram
-- branch groups and evidence, compensation cases and appeal marks, recovery case details) moves to the kept row,
-- and the folded row is deleted. Needs branches.manage in the active workspace. Refuses when both rows carry
-- different ids for the same platform, since that would mean two real branches.
-- Additive and re-runnable; must be applied to production before deploying the code that calls it.

CREATE OR REPLACE FUNCTION public.merge_branches(p_source uuid, p_target uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.branch_registry%ROWTYPE;
  v_target public.branch_registry%ROWTYPE;
BEGIN
  IF p_source IS NULL OR p_target IS NULL OR p_source = p_target THEN
    RAISE EXCEPTION 'merge_branches: choose two different branches' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source FROM public.branch_registry WHERE id = p_source FOR UPDATE;
  SELECT * INTO v_target FROM public.branch_registry WHERE id = p_target FOR UPDATE;
  IF v_source.id IS NULL OR v_target.id IS NULL OR v_source.workspace_id <> v_target.workspace_id THEN
    RAISE EXCEPTION 'merge_branches: branch not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.has_workspace_permission(v_target.workspace_id, 'branches.manage') THEN
    RAISE EXCEPTION 'merge_branches: not allowed' USING ERRCODE = '42501';
  END IF;

  IF (v_source.hungerstation_id IS NOT NULL AND v_target.hungerstation_id IS NOT NULL AND v_source.hungerstation_id <> v_target.hungerstation_id)
     OR (v_source.keeta_id IS NOT NULL AND v_target.keeta_id IS NOT NULL AND v_source.keeta_id <> v_target.keeta_id)
     OR (v_source.jahez_id IS NOT NULL AND v_target.jahez_id IS NOT NULL AND v_source.jahez_id <> v_target.jahez_id)
     OR (v_source.ninja_id IS NOT NULL AND v_target.ninja_id IS NOT NULL AND v_source.ninja_id <> v_target.ninja_id) THEN
    RAISE EXCEPTION 'merge_branches: both branches have an id on the same platform' USING ERRCODE = '23505';
  END IF;

  -- Free the source's ids first so the per-platform unique indexes allow moving them.
  UPDATE public.branch_registry
     SET hungerstation_id = NULL, keeta_id = NULL, jahez_id = NULL, ninja_id = NULL
   WHERE id = v_source.id;
  UPDATE public.branch_registry
     SET hungerstation_id = coalesce(v_target.hungerstation_id, v_source.hungerstation_id),
         keeta_id = coalesce(v_target.keeta_id, v_source.keeta_id),
         jahez_id = coalesce(v_target.jahez_id, v_source.jahez_id),
         ninja_id = coalesce(v_target.ninja_id, v_source.ninja_id),
         active = v_target.active OR v_source.active,
         updated_at = now()
   WHERE id = v_target.id;

  INSERT INTO public.workspace_member_branches (workspace_member_id, branch_id, workspace_id)
  SELECT workspace_member_id, v_target.id, workspace_id
    FROM public.workspace_member_branches
   WHERE branch_id = v_source.id
  ON CONFLICT DO NOTHING;
  DELETE FROM public.workspace_member_branches WHERE branch_id = v_source.id;

  UPDATE public.telegram_branch_chats SET branch_id = v_target.id WHERE branch_id = v_source.id;
  UPDATE public.telegram_order_evidence SET branch_id = v_target.id WHERE branch_id = v_source.id;
  UPDATE public.compensation_cases SET branch_id = v_target.id WHERE branch_id = v_source.id;
  UPDATE public.compensation_appeal_marks SET branch_id = v_target.id WHERE branch_id = v_source.id;
  UPDATE public.recovery_case_details SET branch_id = v_target.id WHERE branch_id = v_source.id;

  DELETE FROM public.branch_registry WHERE id = v_source.id;
  RETURN v_target.id;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_branches(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_branches(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_branches(uuid, uuid) TO authenticated;
