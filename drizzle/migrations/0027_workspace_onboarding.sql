CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own admin row" ON public.platform_admins
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (select auth.uid())) $$;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

CREATE TABLE public.workspace_onboarding (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_details'
    CHECK (status IN ('pending_details','meeting_booked','awaiting_payment','onboarding','active','suspended')),
  legal_name text,
  brand_name text,
  cr_number text,
  vat_number text,
  contact_name text,
  contact_mobile text,
  contact_national_id text,
  contact_email text,
  branch_count integer,
  logo_path text,
  meeting_at timestamptz,
  meeting_note text,
  admin_note text,
  submitted_at timestamptz,
  paid_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_onboarding TO authenticated;
GRANT ALL ON public.workspace_onboarding TO service_role;
ALTER TABLE public.workspace_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own onboarding" ON public.workspace_onboarding
  FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id) OR public.is_platform_admin());

INSERT INTO public.workspace_onboarding (workspace_id, status, activated_at)
SELECT id, 'active', now() FROM public.workspaces
ON CONFLICT (workspace_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_workspace uuid;
  v_is_invited boolean :=
    COALESCE((NEW.raw_user_meta_data ->> 'tadqeeq_invited')::boolean, false);
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  IF NOT v_is_invited THEN
    INSERT INTO public.workspaces (name, owner_user_id)
    VALUES (
      left('Tadqeeq · ' || COALESCE(
          NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
          NULLIF(split_part(NEW.email, '@', 1), ''), 'Workspace'), 160),
      NEW.id)
    RETURNING id INTO v_workspace;

    INSERT INTO public.workspace_members (workspace_id, user_id, role, status, joined_at)
    VALUES (v_workspace, NEW.id, 'owner', 'active', now());

    INSERT INTO public.workspace_onboarding (workspace_id, status, contact_email, contact_name)
    VALUES (v_workspace, 'pending_details', NEW.email, NEW.raw_user_meta_data ->> 'full_name');

    UPDATE public.profiles SET active_workspace_id = v_workspace WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;