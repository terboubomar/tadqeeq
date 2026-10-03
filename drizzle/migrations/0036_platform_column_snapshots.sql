-- New and vanished money columns: the columns each workspace's earlier files had, per platform.
--
-- Every upload's columns are compared with the columns remembered here; a new column carrying
-- amounts, or a column that used to carry amounts and is gone, is reported on the import and the
-- dashboard so a fee the engines do not read is never silently counted as zero. Only column
-- names and two flags are stored, never amounts or file contents. Nothing here changes audit
-- results.
--
-- Additive and safe to re-run. Without it uploads work as before, without these reports.

CREATE TABLE IF NOT EXISTS public.platform_column_snapshots (
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id()
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('hungerstation', 'keeta', 'jahez')),
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 120),
  columns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(columns) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, platform, source),
  CONSTRAINT platform_column_snapshots_workspace_owner_fkey
    FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);

ALTER TABLE public.platform_column_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_column_snapshots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_column_snapshots TO authenticated;
GRANT ALL ON public.platform_column_snapshots TO service_role;

DROP POLICY IF EXISTS platform_column_snapshots_workspace_select ON public.platform_column_snapshots;
DROP POLICY IF EXISTS platform_column_snapshots_workspace_insert ON public.platform_column_snapshots;
DROP POLICY IF EXISTS platform_column_snapshots_workspace_update ON public.platform_column_snapshots;
DROP POLICY IF EXISTS platform_column_snapshots_workspace_delete ON public.platform_column_snapshots;

CREATE POLICY platform_column_snapshots_workspace_select ON public.platform_column_snapshots
  FOR SELECT TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'periods.read'));
CREATE POLICY platform_column_snapshots_workspace_insert ON public.platform_column_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (private.has_workspace_permission(workspace_id, 'imports.create'));
CREATE POLICY platform_column_snapshots_workspace_update ON public.platform_column_snapshots
  FOR UPDATE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'imports.create'))
  WITH CHECK (private.has_workspace_permission(workspace_id, 'imports.create'));
CREATE POLICY platform_column_snapshots_workspace_delete ON public.platform_column_snapshots
  FOR DELETE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'imports.create'));
