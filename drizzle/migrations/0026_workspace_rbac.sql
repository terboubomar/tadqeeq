BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_id_owner_key
  ON public.workspaces (id, owner_user_id);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','auditor','compensation','branch_manager','viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','suspended')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id),
  UNIQUE (id, workspace_id)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

INSERT INTO public.workspaces (name, owner_user_id)
SELECT
  left(
    'Tadqeeq · ' ||
    COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(split_part(u.email, '@', 1), ''), 'Workspace'),
    160
  ),
  u.id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_members wm WHERE wm.user_id = u.id
);

INSERT INTO public.workspace_members (
  workspace_id, user_id, role, status, invited_by, joined_at
)
SELECT w.id, w.owner_user_id, 'owner', 'active', NULL, now()
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1
  FROM public.workspace_members wm
  WHERE wm.workspace_id = w.id AND wm.user_id = w.owner_user_id
);

UPDATE public.profiles p
SET active_workspace_id = chosen.workspace_id
FROM (
  SELECT DISTINCT ON (wm.user_id)
    wm.user_id,
    wm.workspace_id
  FROM public.workspace_members wm
  WHERE wm.status = 'active'
  ORDER BY wm.user_id, (wm.role = 'owner') DESC, wm.created_at
) chosen
WHERE p.id = chosen.user_id
  AND p.active_workspace_id IS NULL;

ALTER TABLE public.branch_registry
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

UPDATE public.branch_registry b
SET workspace_id = w.id
FROM public.workspaces w
WHERE b.workspace_id IS NULL
  AND w.owner_user_id = b.user_id;

INSERT INTO public.branch_registry (user_id, workspace_id, name, active)
SELECT DISTINCT t.user_id, w.id, btrim(t.branch_name), true
FROM public.telegram_branch_chats t
JOIN public.workspaces w ON w.owner_user_id = t.user_id
WHERE btrim(t.branch_name) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.branch_registry b
    WHERE b.workspace_id = w.id
      AND lower(btrim(b.name)) = lower(btrim(t.branch_name))
  );

INSERT INTO public.branch_registry (user_id, workspace_id, name, active)
SELECT DISTINCT c.user_id, w.id, btrim(c.branch_name), true
FROM public.compensation_cases c
JOIN public.workspaces w ON w.owner_user_id = c.user_id
WHERE c.branch_name IS NOT NULL
  AND btrim(c.branch_name) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.branch_registry b
    WHERE b.workspace_id = w.id
      AND lower(btrim(b.name)) = lower(btrim(c.branch_name))
  );

ALTER TABLE public.branch_registry ALTER COLUMN workspace_id SET NOT NULL;

DROP INDEX IF EXISTS public.branch_registry_user_name_idx;
ALTER TABLE public.branch_registry DROP CONSTRAINT IF EXISTS branch_registry_user_id_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS branch_registry_workspace_name_idx
  ON public.branch_registry (workspace_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS branch_registry_workspace_hs_idx
  ON public.branch_registry (workspace_id, hungerstation_id)
  WHERE hungerstation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS branch_registry_workspace_keeta_idx
  ON public.branch_registry (workspace_id, keeta_id)
  WHERE keeta_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS branch_registry_workspace_jahez_idx
  ON public.branch_registry (workspace_id, jahez_id)
  WHERE jahez_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS branch_registry_id_workspace_key
  ON public.branch_registry (id, workspace_id);

CREATE TABLE IF NOT EXISTS public.workspace_member_branches (
  workspace_id uuid NOT NULL,
  workspace_member_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_member_id, branch_id),
  FOREIGN KEY (workspace_member_id, workspace_id)
    REFERENCES public.workspace_members(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id, workspace_id)
    REFERENCES public.branch_registry(id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.workspace_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (length(btrim(event_type)) BETWEEN 1 AND 120),
  entity_type text NOT NULL CHECK (length(btrim(entity_type)) BETWEEN 1 AND 120),
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.active_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT p.active_workspace_id
      FROM public.profiles p
      JOIN public.workspace_members wm
        ON wm.workspace_id = p.active_workspace_id
       AND wm.user_id = p.id
       AND wm.status = 'active'
      WHERE p.id = (select auth.uid())
      LIMIT 1
    ),
    (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = (select auth.uid())
        AND wm.status = 'active'
      ORDER BY (wm.role = 'owner') DESC, wm.created_at
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.workspace_role(p_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT wm.role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = (select auth.uid())
    AND wm.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = (select auth.uid())
      AND wm.status = 'active'
  );
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

CREATE OR REPLACE FUNCTION private.can_access_branch(
  p_workspace_id uuid,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH member AS (
    SELECT wm.id, wm.role
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = (select auth.uid())
      AND wm.status = 'active'
    LIMIT 1
  )
  SELECT COALESCE(
    CASE
      WHEN (SELECT role FROM member) IN ('owner','admin','auditor','viewer') THEN true
      WHEN p_branch_id IS NULL THEN false
      ELSE EXISTS (
        SELECT 1
        FROM public.workspace_member_branches wmb
        WHERE wmb.workspace_id = p_workspace_id
          AND wmb.workspace_member_id = (SELECT id FROM member)
          AND wmb.branch_id = p_branch_id
      )
    END,
    false
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_owner_folder(
  p_owner text,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.owner_user_id::text = p_owner
      AND private.has_workspace_permission(w.id, p_permission)
  );
$$;

REVOKE ALL ON FUNCTION private.active_workspace_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.workspace_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_workspace_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_workspace_permission(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_branch(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_owner_folder(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.active_workspace_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.workspace_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_workspace_permission(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_branch(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_owner_folder(text,text) TO authenticated;

ALTER TABLE public.branch_registry ALTER COLUMN workspace_id SET DEFAULT private.active_workspace_id();

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_usage',
    'audit_source_files',
    'compensation_cases',
    'contract_documents',
    'contract_fee_rules',
    'contract_rule_events',
    'contract_versions',
    'exception_events',
    'format_change_alerts',
    'hungerstation_branch_mappings',
    'periods',
    'platform_contracts',
    'promotion_audits',
    'recovery_case_details',
    'recovery_case_documents',
    'recovery_case_events',
    'telegram_branch_chats',
    'telegram_order_evidence',
    'compensation_appeal_marks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE',
      t
    );
    EXECUTE format(
      'UPDATE public.%I x SET workspace_id = w.id FROM public.workspaces w WHERE x.workspace_id IS NULL AND w.owner_user_id = x.user_id',
      t
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN workspace_id SET DEFAULT private.active_workspace_id()',
      t
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (workspace_id)',
      t || '_workspace_idx',
      t
    );
  END LOOP;
END
$;

-- Preserve the legacy data-owner invariant while workspace_id becomes the
-- authorization boundary. Every workspace-owned row must keep user_id equal
-- to that workspace's owner, even if a staff client bypasses application code.
DO $
DECLARE
  t text;
  constraint_name text;
  owner_tables text[] := ARRAY[
    'branch_registry',
    'ai_usage',
    'audit_source_files',
    'compensation_cases',
    'contract_documents',
    'contract_fee_rules',
    'contract_rule_events',
    'contract_versions',
    'exception_events',
    'format_change_alerts',
    'hungerstation_branch_mappings',
    'periods',
    'platform_contracts',
    'promotion_audits',
    'recovery_case_details',
    'recovery_case_documents',
    'recovery_case_events',
    'telegram_branch_chats',
    'telegram_order_evidence',
    'compensation_appeal_marks'
  ];
BEGIN
  FOREACH t IN ARRAY owner_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    constraint_name := t || '_workspace_owner_fkey';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = to_regclass('public.' || t)
        AND conname = constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT',
        t,
        constraint_name
      );
    END IF;
  END LOOP;
END
$;

ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE public.ai_usage SET actor_user_id = user_id WHERE actor_user_id IS NULL;
ALTER TABLE public.ai_usage ALTER COLUMN actor_user_id SET DEFAULT auth.uid();

ALTER TABLE public.telegram_branch_chats
  ADD COLUMN IF NOT EXISTS branch_id uuid;

UPDATE public.telegram_branch_chats t
SET branch_id = b.id
FROM public.branch_registry b
WHERE t.branch_id IS NULL
  AND b.workspace_id = t.workspace_id
  AND lower(btrim(b.name)) = lower(btrim(t.branch_name));

ALTER TABLE public.telegram_branch_chats ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.telegram_branch_chats
  DROP CONSTRAINT IF EXISTS telegram_branch_chats_branch_workspace_fkey;
ALTER TABLE public.telegram_branch_chats
  ADD CONSTRAINT telegram_branch_chats_branch_workspace_fkey
  FOREIGN KEY (branch_id, workspace_id)
  REFERENCES public.branch_registry(id, workspace_id)
  ON DELETE RESTRICT;

ALTER TABLE public.telegram_order_evidence
  ADD COLUMN IF NOT EXISTS branch_id uuid;

UPDATE public.telegram_order_evidence e
SET branch_id = t.branch_id
FROM public.telegram_branch_chats t
WHERE e.branch_id IS NULL
  AND t.id = e.branch_chat_id
  AND t.workspace_id = e.workspace_id;

ALTER TABLE public.telegram_order_evidence ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE public.telegram_order_evidence
  DROP CONSTRAINT IF EXISTS telegram_order_evidence_branch_workspace_fkey;
ALTER TABLE public.telegram_order_evidence
  ADD CONSTRAINT telegram_order_evidence_branch_workspace_fkey
  FOREIGN KEY (branch_id, workspace_id)
  REFERENCES public.branch_registry(id, workspace_id)
  ON DELETE RESTRICT;

ALTER TABLE public.compensation_cases
  ADD COLUMN IF NOT EXISTS branch_id uuid;

UPDATE public.compensation_cases c
SET branch_id = e.branch_id
FROM public.telegram_order_evidence e
WHERE c.branch_id IS NULL
  AND c.evidence_id = e.id
  AND c.workspace_id = e.workspace_id;

UPDATE public.compensation_cases c
SET branch_id = b.id
FROM public.branch_registry b
WHERE c.branch_id IS NULL
  AND c.branch_name IS NOT NULL
  AND b.workspace_id = c.workspace_id
  AND lower(btrim(b.name)) = lower(btrim(c.branch_name));

ALTER TABLE public.compensation_cases
  DROP CONSTRAINT IF EXISTS compensation_cases_branch_workspace_fkey;
ALTER TABLE public.compensation_cases
  ADD CONSTRAINT compensation_cases_branch_workspace_fkey
  FOREIGN KEY (branch_id, workspace_id)
  REFERENCES public.branch_registry(id, workspace_id)
  ON DELETE RESTRICT;

ALTER TABLE public.compensation_appeal_marks
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branch_registry(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workspace_members_user_status_idx
  ON public.workspace_members (user_id, status, created_at);
CREATE INDEX IF NOT EXISTS workspace_member_branches_workspace_branch_idx
  ON public.workspace_member_branches (workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS workspace_audit_events_workspace_created_idx
  ON public.workspace_audit_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS telegram_branch_chats_workspace_branch_idx
  ON public.telegram_branch_chats (workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS telegram_order_evidence_workspace_branch_idx
  ON public.telegram_order_evidence (workspace_id, branch_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS compensation_cases_workspace_branch_idx
  ON public.compensation_cases (workspace_id, branch_id, updated_at DESC);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_member_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.workspaces FROM anon, authenticated;
REVOKE ALL ON public.workspace_members FROM anon, authenticated;
REVOKE ALL ON public.workspace_member_branches FROM anon, authenticated;
REVOKE ALL ON public.workspace_audit_events FROM anon, authenticated;

GRANT SELECT ON public.workspaces TO authenticated;
GRANT SELECT ON public.workspace_members TO authenticated;
GRANT SELECT ON public.workspace_member_branches TO authenticated;
GRANT SELECT ON public.workspace_audit_events TO authenticated;

GRANT ALL ON public.workspaces TO service_role;
GRANT ALL ON public.workspace_members TO service_role;
GRANT ALL ON public.workspace_member_branches TO service_role;
GRANT ALL ON public.workspace_audit_events TO service_role;

DROP POLICY IF EXISTS workspaces_member_select ON public.workspaces;
CREATE POLICY workspaces_member_select
ON public.workspaces FOR SELECT TO authenticated
USING (private.is_workspace_member(id));

DROP POLICY IF EXISTS workspace_members_visible ON public.workspace_members;
CREATE POLICY workspace_members_visible
ON public.workspace_members FOR SELECT TO authenticated
USING (
  user_id = (select auth.uid())
  OR private.has_workspace_permission(workspace_id, 'users.manage')
);

DROP POLICY IF EXISTS workspace_member_branches_visible ON public.workspace_member_branches;
CREATE POLICY workspace_member_branches_visible
ON public.workspace_member_branches FOR SELECT TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'users.manage')
  OR EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.id = workspace_member_id
      AND wm.user_id = (select auth.uid())
      AND wm.status = 'active'
  )
);

DROP POLICY IF EXISTS workspace_audit_events_read ON public.workspace_audit_events;
CREATE POLICY workspace_audit_events_read
ON public.workspace_audit_events FOR SELECT TO authenticated
USING (private.has_workspace_permission(workspace_id, 'audit_log.read'));


-- Profiles remain user-owned, but active_workspace_id may only point to a
-- workspace where that same user has an active membership.
REVOKE DELETE ON public.profiles FROM authenticated;
DROP POLICY IF EXISTS "own profile select" ON public.profiles;
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
DROP POLICY IF EXISTS profile_self_select ON public.profiles;
DROP POLICY IF EXISTS profile_self_insert ON public.profiles;
DROP POLICY IF EXISTS profile_self_update ON public.profiles;

CREATE POLICY profile_self_select
ON public.profiles FOR SELECT TO authenticated
USING ((select auth.uid()) = id);

CREATE POLICY profile_self_insert
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  (select auth.uid()) = id
  AND (
    active_workspace_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = active_workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.status = 'active'
    )
  )
);

CREATE POLICY profile_self_update
ON public.profiles FOR UPDATE TO authenticated
USING ((select auth.uid()) = id)
WITH CHECK (
  (select auth.uid()) = id
  AND (
    active_workspace_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = active_workspace_id
        AND wm.user_id = (select auth.uid())
        AND wm.status = 'active'
    )
  )
);

DO $$
DECLARE
  rec record;
  t text;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'ai_usage',
        'audit_source_files',
        'branch_registry',
        'compensation_cases',
        'compensation_appeal_marks',
        'contract_documents',
        'contract_fee_rules',
        'contract_rule_events',
        'contract_versions',
        'exception_events',
        'format_change_alerts',
        'hungerstation_branch_mappings',
        'periods',
        'platform_contracts',
        'promotion_audits',
        'recovery_case_details',
        'recovery_case_documents',
        'recovery_case_events',
        'telegram_branch_chats',
        'telegram_order_evidence'
      ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', rec.policyname, rec.schemaname, rec.tablename);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'periods',
    'audit_source_files',
    'format_change_alerts',
    'hungerstation_branch_mappings',
    'promotion_audits'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.has_workspace_permission(workspace_id, ''periods.read''))',
      t || '_workspace_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.has_workspace_permission(workspace_id, ''imports.create''))',
      t || '_workspace_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.has_workspace_permission(workspace_id, ''imports.create'')) WITH CHECK (private.has_workspace_permission(workspace_id, ''imports.create''))',
      t || '_workspace_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.has_workspace_permission(workspace_id, ''imports.create''))',
      t || '_workspace_delete', t
    );
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'platform_contracts',
    'contract_versions',
    'contract_fee_rules',
    'contract_documents',
    'contract_rule_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.has_workspace_permission(workspace_id, ''contracts.read''))',
      t || '_workspace_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.has_workspace_permission(workspace_id, ''contracts.manage''))',
      t || '_workspace_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.has_workspace_permission(workspace_id, ''contracts.manage'')) WITH CHECK (private.has_workspace_permission(workspace_id, ''contracts.manage''))',
      t || '_workspace_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.has_workspace_permission(workspace_id, ''contracts.manage''))',
      t || '_workspace_delete', t
    );
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'recovery_case_details',
    'recovery_case_documents',
    'recovery_case_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.has_workspace_permission(workspace_id, ''recovery.read''))',
      t || '_workspace_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.has_workspace_permission(workspace_id, ''recovery.manage''))',
      t || '_workspace_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.has_workspace_permission(workspace_id, ''recovery.manage'')) WITH CHECK (private.has_workspace_permission(workspace_id, ''recovery.manage''))',
      t || '_workspace_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.has_workspace_permission(workspace_id, ''recovery.manage''))',
      t || '_workspace_delete', t
    );
  END LOOP;
END
$$;

ALTER TABLE public.branch_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.branch_registry FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_registry TO authenticated;
GRANT ALL ON public.branch_registry TO service_role;

CREATE POLICY branch_registry_workspace_select
ON public.branch_registry FOR SELECT TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'branches.read')
  AND private.can_access_branch(workspace_id, id)
);
CREATE POLICY branch_registry_workspace_insert
ON public.branch_registry FOR INSERT TO authenticated
WITH CHECK (private.has_workspace_permission(workspace_id, 'branches.manage'));
CREATE POLICY branch_registry_workspace_update
ON public.branch_registry FOR UPDATE TO authenticated
USING (private.has_workspace_permission(workspace_id, 'branches.manage'))
WITH CHECK (private.has_workspace_permission(workspace_id, 'branches.manage'));
CREATE POLICY branch_registry_workspace_delete
ON public.branch_registry FOR DELETE TO authenticated
USING (private.has_workspace_permission(workspace_id, 'branches.manage'));

ALTER TABLE public.telegram_branch_chats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_branch_chats FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_branch_chats TO authenticated;
GRANT ALL ON public.telegram_branch_chats TO service_role;

CREATE POLICY telegram_branch_chats_workspace_select
ON public.telegram_branch_chats FOR SELECT TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'telegram.read')
  AND private.can_access_branch(workspace_id, branch_id)
);
CREATE POLICY telegram_branch_chats_workspace_insert
ON public.telegram_branch_chats FOR INSERT TO authenticated
WITH CHECK (
  private.has_workspace_permission(workspace_id, 'telegram.manage')
  AND private.can_access_branch(workspace_id, branch_id)
);
CREATE POLICY telegram_branch_chats_workspace_update
ON public.telegram_branch_chats FOR UPDATE TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'telegram.manage')
  AND private.can_access_branch(workspace_id, branch_id)
)
WITH CHECK (
  private.has_workspace_permission(workspace_id, 'telegram.manage')
  AND private.can_access_branch(workspace_id, branch_id)
);
CREATE POLICY telegram_branch_chats_workspace_delete
ON public.telegram_branch_chats FOR DELETE TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'telegram.manage')
  AND private.can_access_branch(workspace_id, branch_id)
);

ALTER TABLE public.telegram_order_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_order_evidence FROM anon, authenticated;
GRANT SELECT ON public.telegram_order_evidence TO authenticated;
GRANT ALL ON public.telegram_order_evidence TO service_role;

CREATE POLICY telegram_order_evidence_workspace_select
ON public.telegram_order_evidence FOR SELECT TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'telegram.read')
  AND private.can_access_branch(workspace_id, branch_id)
);

ALTER TABLE public.compensation_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compensation_cases FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compensation_cases TO authenticated;
GRANT ALL ON public.compensation_cases TO service_role;

CREATE POLICY compensation_cases_workspace_select
ON public.compensation_cases FOR SELECT TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'compensation.read')
  AND (
    branch_id IS NULL
      AND private.workspace_role(workspace_id) IN ('owner','admin','auditor','viewer')
    OR branch_id IS NOT NULL
      AND private.can_access_branch(workspace_id, branch_id)
  )
);
CREATE POLICY compensation_cases_workspace_insert
ON public.compensation_cases FOR INSERT TO authenticated
WITH CHECK (
  private.has_workspace_permission(workspace_id, 'compensation.manage')
  AND (
    branch_id IS NULL
      AND private.workspace_role(workspace_id) IN ('owner','admin','auditor')
    OR branch_id IS NOT NULL
      AND private.can_access_branch(workspace_id, branch_id)
  )
);
CREATE POLICY compensation_cases_workspace_update
ON public.compensation_cases FOR UPDATE TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'compensation.manage')
  AND (
    branch_id IS NULL
      AND private.workspace_role(workspace_id) IN ('owner','admin','auditor')
    OR branch_id IS NOT NULL
      AND private.can_access_branch(workspace_id, branch_id)
  )
)
WITH CHECK (
  private.has_workspace_permission(workspace_id, 'compensation.manage')
  AND (
    branch_id IS NULL
      AND private.workspace_role(workspace_id) IN ('owner','admin','auditor')
    OR branch_id IS NOT NULL
      AND private.can_access_branch(workspace_id, branch_id)
  )
);
CREATE POLICY compensation_cases_workspace_delete
ON public.compensation_cases FOR DELETE TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'compensation.manage')
  AND private.workspace_role(workspace_id) IN ('owner','admin','auditor')
);

ALTER TABLE public.compensation_appeal_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compensation_appeal_marks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compensation_appeal_marks TO authenticated;
GRANT ALL ON public.compensation_appeal_marks TO service_role;

CREATE POLICY compensation_appeal_marks_workspace_select
ON public.compensation_appeal_marks FOR SELECT TO authenticated
USING (
  private.has_workspace_permission(workspace_id, 'compensation.read')
  AND (
    branch_id IS NULL
      AND private.workspace_role(workspace_id) IN ('owner','admin','auditor','compensation','viewer')
    OR branch_id IS NOT NULL
      AND private.can_access_branch(workspace_id, branch_id)
  )
);
CREATE POLICY compensation_appeal_marks_workspace_insert
ON public.compensation_appeal_marks FOR INSERT TO authenticated
WITH CHECK (
  private.has_workspace_permission(workspace_id, 'compensation.manage')
  AND (
    branch_id IS NULL
      AND private.workspace_role(workspace_id) IN ('owner','admin','auditor','compensation')
    OR branch_id IS NOT NULL
      AND private.can_access_branch(workspace_id, branch_id)
  )
);
CREATE POLICY compensation_appeal_marks_workspace_update
ON public.compensation_appeal_marks FOR UPDATE TO authenticated
USING (private.has_workspace_permission(workspace_id, 'compensation.manage'))
WITH CHECK (private.has_workspace_permission(workspace_id, 'compensation.manage'));
CREATE POLICY compensation_appeal_marks_workspace_delete
ON public.compensation_appeal_marks FOR DELETE TO authenticated
USING (private.has_workspace_permission(workspace_id, 'compensation.manage'));

ALTER TABLE public.exception_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exception_events FROM anon, authenticated;
GRANT SELECT ON public.exception_events TO authenticated;
GRANT ALL ON public.exception_events TO service_role;
CREATE POLICY exception_events_workspace_select
ON public.exception_events FOR SELECT TO authenticated
USING (private.has_workspace_permission(workspace_id, 'exceptions.read'));

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

CREATE POLICY ai_usage_workspace_select
ON public.ai_usage FOR SELECT TO authenticated
USING (
  actor_user_id = (select auth.uid())
  AND private.has_workspace_permission(workspace_id, 'ai.use')
);
CREATE POLICY ai_usage_workspace_update
ON public.ai_usage FOR UPDATE TO authenticated
USING (
  actor_user_id = (select auth.uid())
  AND private.has_workspace_permission(workspace_id, 'ai.use')
)
WITH CHECK (
  actor_user_id = (select auth.uid())
  AND private.has_workspace_permission(workspace_id, 'ai.use')
);

CREATE OR REPLACE FUNCTION public.reserve_ai_call(
  p_feature text,
  p_model text,
  p_prompt_version text,
  p_period_id uuid,
  p_exception_id text,
  p_limit integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid := private.active_workspace_id();
  v_owner uuid;
  v_count integer;
  v_id uuid;
BEGIN
  IF v_actor IS NULL OR v_workspace IS NULL THEN
    RAISE EXCEPTION 'AI_UNAUTHENTICATED';
  END IF;

  IF NOT private.has_workspace_permission(v_workspace, 'ai.use') THEN
    RAISE EXCEPTION 'AI_FORBIDDEN';
  END IF;

  SELECT owner_user_id INTO v_owner
  FROM public.workspaces
  WHERE id = v_workspace;

  SELECT count(*) INTO v_count
  FROM public.ai_usage
  WHERE workspace_id = v_workspace
    AND created_at > now() - interval '1 hour';

  IF v_count >= COALESCE(p_limit, 30) THEN
    RAISE EXCEPTION 'AI_RATE_LIMIT_EXCEEDED';
  END IF;

  INSERT INTO public.ai_usage (
    user_id,
    workspace_id,
    actor_user_id,
    feature,
    model,
    prompt_version,
    period_id,
    exception_id,
    status
  )
  VALUES (
    v_owner,
    v_workspace,
    v_actor,
    p_feature,
    p_model,
    p_prompt_version,
    p_period_id,
    p_exception_id,
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_call(text,text,text,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_ai_call(text,text,text,uuid,text,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_call(text,text,text,uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_exception_workflow(
  p_period_id uuid,
  p_exception_id text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_workspace UUID := private.active_workspace_id();
  v_owner UUID;
  v_period public.periods%ROWTYPE;
  v_invoice JSONB;
  v_current JSONB;
  v_merged JSONB;
  v_history JSONB;
  v_event JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_actor IS NULL OR v_workspace IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  IF NOT private.has_workspace_permission(v_workspace, 'exceptions.manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'FORBIDDEN';
  END IF;

  SELECT owner_user_id INTO v_owner
  FROM public.workspaces
  WHERE id = v_workspace;

  IF p_exception_id IS NULL OR btrim(p_exception_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_EXCEPTION_ID';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_PATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_patch) AS patch_key(key)
    WHERE patch_key.key NOT IN ('status', 'note', 'recoveredAmount')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_PATCH_KEY';
  END IF;

  IF p_patch ? 'status'
     AND COALESCE(p_patch ->> 'status', '') NOT IN (
       'new','reviewing','contacted','disputed','recovered','closed'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_STATUS';
  END IF;

  IF p_patch ? 'note'
     AND p_patch -> 'note' <> 'null'::jsonb
     AND jsonb_typeof(p_patch -> 'note') <> 'string' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_WORKFLOW_NOTE';
  END IF;

  IF p_patch ? 'recoveredAmount'
     AND p_patch -> 'recoveredAmount' <> 'null'::jsonb
     AND (
       jsonb_typeof(p_patch -> 'recoveredAmount') <> 'number'
       OR (p_patch ->> 'recoveredAmount')::numeric < 0
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RECOVERED_AMOUNT';
  END IF;

  SELECT *
  INTO v_period
  FROM public.periods
  WHERE id = p_period_id
    AND workspace_id = v_workspace
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PERIOD_NOT_FOUND';
  END IF;

  v_invoice := COALESCE(v_period.invoice, '{}'::jsonb);

  IF jsonb_typeof(v_invoice -> 'exceptionWorkflow') IS DISTINCT FROM 'object' THEN
    v_invoice := jsonb_set(v_invoice, '{exceptionWorkflow}', '{}'::jsonb, true);
  END IF;

  v_current := COALESCE(
    v_invoice #> ARRAY['exceptionWorkflow', p_exception_id],
    '{"status":"new"}'::jsonb
  );
  v_merged := v_current || p_patch;

  IF NOT (v_merged ? 'status') THEN
    v_merged := jsonb_set(v_merged, '{status}', '"new"'::jsonb, true);
  END IF;

  v_history := CASE
    WHEN jsonb_typeof(v_current -> 'history') = 'array'
      THEN v_current -> 'history'
    ELSE '[]'::jsonb
  END;

  v_event := jsonb_strip_nulls(
    jsonb_build_object(
      'at', v_now,
      'status', v_merged ->> 'status',
      'note', v_merged -> 'note',
      'recoveredAmount', v_merged -> 'recoveredAmount'
    )
  );

  INSERT INTO public.exception_events (
    user_id,
    workspace_id,
    period_id,
    exception_id,
    status,
    note,
    recovered_amount,
    event_source,
    created_at
  )
  VALUES (
    v_owner,
    v_workspace,
    p_period_id,
    p_exception_id,
    v_merged ->> 'status',
    NULLIF(v_merged ->> 'note', ''),
    COALESCE(NULLIF(v_merged ->> 'recoveredAmount', '')::numeric, 0),
    'rpc',
    v_now
  );

  v_merged := jsonb_set(v_merged, '{updatedAt}', to_jsonb(v_now), true);
  v_merged := jsonb_set(
    v_merged,
    '{history}',
    v_history || jsonb_build_array(v_event),
    true
  );

  v_invoice := jsonb_set(
    v_invoice,
    ARRAY['exceptionWorkflow', p_exception_id],
    v_merged,
    true
  );

  UPDATE public.periods
  SET invoice = v_invoice
  WHERE id = p_period_id
    AND workspace_id = v_workspace
  RETURNING * INTO v_period;

  RETURN to_jsonb(v_period);
END;
$$;

REVOKE ALL ON FUNCTION public.set_exception_workflow(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_exception_workflow(uuid,text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_exception_workflow(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
      left(
        'Tadqeeq · ' ||
        COALESCE(
          NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
          NULLIF(split_part(NEW.email, '@', 1), ''),
          'Workspace'
        ),
        160
      ),
      NEW.id
    )
    RETURNING id INTO v_workspace;

    INSERT INTO public.workspace_members (
      workspace_id, user_id, role, status, joined_at
    )
    VALUES (v_workspace, NEW.id, 'owner', 'active', now());

    UPDATE public.profiles
    SET active_workspace_id = v_workspace
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

DROP POLICY IF EXISTS source_files_select_own ON storage.objects;
DROP POLICY IF EXISTS source_files_insert_own ON storage.objects;
DROP POLICY IF EXISTS source_files_delete_own ON storage.objects;
CREATE POLICY source_files_workspace_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'source-files'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'periods.read')
);
CREATE POLICY source_files_workspace_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'source-files'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'imports.create')
);
CREATE POLICY source_files_workspace_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'source-files'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'imports.create')
);

DROP POLICY IF EXISTS contract_files_select_own ON storage.objects;
DROP POLICY IF EXISTS contract_files_insert_own ON storage.objects;
DROP POLICY IF EXISTS contract_files_delete_own ON storage.objects;
CREATE POLICY contract_files_workspace_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contract-files'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'contracts.read')
);
CREATE POLICY contract_files_workspace_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contract-files'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'contracts.manage')
);
CREATE POLICY contract_files_workspace_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'contract-files'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'contracts.manage')
);

DROP POLICY IF EXISTS recovery_case_files_select_own ON storage.objects;
DROP POLICY IF EXISTS recovery_case_files_insert_own ON storage.objects;
DROP POLICY IF EXISTS recovery_case_files_delete_own ON storage.objects;
CREATE POLICY recovery_case_files_workspace_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'recovery-case-files'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'recovery.read')
);
CREATE POLICY recovery_case_files_workspace_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'recovery-case-files'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'recovery.manage')
);
CREATE POLICY recovery_case_files_workspace_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'recovery-case-files'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'recovery.manage')
);

DROP POLICY IF EXISTS telegram_evidence_thumbnails_select_own ON storage.objects;
CREATE POLICY telegram_evidence_workspace_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'telegram-evidence-thumbnails'
  AND private.can_access_owner_folder((storage.foldername(name))[1], 'telegram.read')
);

COMMIT;
