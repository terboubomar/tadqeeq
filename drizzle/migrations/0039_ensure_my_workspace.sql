CREATE OR REPLACE FUNCTION public.ensure_my_workspace()
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_uid uuid := auth.uid(); v_ws uuid; v_email text; v_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = v_uid) THEN RETURN NULL; END IF;
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
