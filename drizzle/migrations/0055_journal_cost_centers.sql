-- Cost center per branch for the journal entries: the code each branch's entry lines carry in exports.
-- Keyed by platform and the platform's branch ID, so a code set once applies to every later period.
-- Read with financials.read; edited with contracts.manage (owner, admin, auditor), like the chart of accounts. Re-runnable.

CREATE TABLE IF NOT EXISTS public.journal_cost_centers (
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id()
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('hungerstation', 'keeta', 'jahez')),
  branch_key text NOT NULL CHECK (length(branch_key) BETWEEN 1 AND 200),
  branch_name text NOT NULL DEFAULT '' CHECK (length(branch_name) <= 200),
  cost_center text NOT NULL DEFAULT '' CHECK (length(cost_center) <= 60),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, platform, branch_key),
  CONSTRAINT journal_cost_centers_workspace_owner_fkey
    FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);

ALTER TABLE public.journal_cost_centers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_cost_centers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_cost_centers TO authenticated;
GRANT ALL ON public.journal_cost_centers TO service_role;

DROP POLICY IF EXISTS journal_cost_centers_select ON public.journal_cost_centers;
DROP POLICY IF EXISTS journal_cost_centers_insert ON public.journal_cost_centers;
DROP POLICY IF EXISTS journal_cost_centers_update ON public.journal_cost_centers;
DROP POLICY IF EXISTS journal_cost_centers_delete ON public.journal_cost_centers;

CREATE POLICY journal_cost_centers_select ON public.journal_cost_centers
  FOR SELECT TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'financials.read'));
CREATE POLICY journal_cost_centers_insert ON public.journal_cost_centers
  FOR INSERT TO authenticated
  WITH CHECK (private.has_workspace_permission(workspace_id, 'contracts.manage'));
CREATE POLICY journal_cost_centers_update ON public.journal_cost_centers
  FOR UPDATE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'contracts.manage'))
  WITH CHECK (private.has_workspace_permission(workspace_id, 'contracts.manage'));
CREATE POLICY journal_cost_centers_delete ON public.journal_cost_centers
  FOR DELETE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'contracts.manage'));
