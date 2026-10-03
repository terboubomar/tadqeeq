-- Smart columns: confirmed matches between a platform's renamed columns and the names the
-- analysis engines expect.
--
-- When a platform renames a required column, the upload suggests which new column it is and
-- the user confirms. The confirmed match is stored here and applied to later uploads and
-- re-analyses by renaming the header cell before the engine reads the file. A match only
-- applies when the expected column is missing, so files in the original format are untouched.
--
-- Additive and safe to re-run. Without it uploads still offer the matching step, but the
-- confirmed match is not remembered for the next file.

CREATE TABLE IF NOT EXISTS public.format_column_aliases (
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id()
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('hungerstation', 'keeta', 'jahez')),
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 120),
  canonical text NOT NULL CHECK (length(btrim(canonical)) BETWEEN 1 AND 200),
  observed text NOT NULL CHECK (length(btrim(observed)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, platform, source, observed),
  CONSTRAINT format_column_aliases_workspace_owner_fkey
    FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);

ALTER TABLE public.format_column_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.format_column_aliases FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.format_column_aliases TO authenticated;
GRANT ALL ON public.format_column_aliases TO service_role;

DROP POLICY IF EXISTS format_column_aliases_workspace_select ON public.format_column_aliases;
DROP POLICY IF EXISTS format_column_aliases_workspace_insert ON public.format_column_aliases;
DROP POLICY IF EXISTS format_column_aliases_workspace_update ON public.format_column_aliases;
DROP POLICY IF EXISTS format_column_aliases_workspace_delete ON public.format_column_aliases;

CREATE POLICY format_column_aliases_workspace_select ON public.format_column_aliases
  FOR SELECT TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'periods.read'));
CREATE POLICY format_column_aliases_workspace_insert ON public.format_column_aliases
  FOR INSERT TO authenticated
  WITH CHECK (private.has_workspace_permission(workspace_id, 'imports.create'));
CREATE POLICY format_column_aliases_workspace_update ON public.format_column_aliases
  FOR UPDATE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'imports.create'))
  WITH CHECK (private.has_workspace_permission(workspace_id, 'imports.create'));
CREATE POLICY format_column_aliases_workspace_delete ON public.format_column_aliases
  FOR DELETE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'imports.create'));
