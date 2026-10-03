-- Smart watch: the charge levels a user confirmed as expected for a branch.
--
-- The smart watch compares each branch's platform charges with its usual level and flags
-- unusual ones. When the user marks an alert as expected, the accepted rate is stored here
-- and the same branch and charge stay quiet until they go clearly above it. Nothing here
-- changes audit results; it only hides alerts and records the user's answers.
--
-- Additive and safe to re-run. Without it the dashboard still shows alerts but cannot
-- remember answers.

CREATE TABLE IF NOT EXISTS public.smart_watch_acceptances (
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id()
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('hungerstation', 'keeta', 'jahez')),
  branch_key text NOT NULL CHECK (length(btrim(branch_key)) BETWEEN 1 AND 300),
  branch_name text CHECK (branch_name IS NULL OR length(branch_name) <= 300),
  metric text NOT NULL CHECK (metric IN ('commission', 'payment_fees', 'delivery', 'compensation', 'total_cost')),
  accepted_rate numeric(10,6) NOT NULL CHECK (accepted_rate >= 0 AND accepted_rate <= 10),
  typical_rate numeric(10,6) CHECK (typical_rate IS NULL OR (typical_rate >= 0 AND typical_rate <= 10)),
  period_id uuid REFERENCES public.periods(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, platform, branch_key, metric),
  CONSTRAINT smart_watch_acceptances_workspace_owner_fkey
    FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);

ALTER TABLE public.smart_watch_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.smart_watch_acceptances FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_watch_acceptances TO authenticated;
GRANT ALL ON public.smart_watch_acceptances TO service_role;

DROP POLICY IF EXISTS smart_watch_acceptances_workspace_select ON public.smart_watch_acceptances;
DROP POLICY IF EXISTS smart_watch_acceptances_workspace_insert ON public.smart_watch_acceptances;
DROP POLICY IF EXISTS smart_watch_acceptances_workspace_update ON public.smart_watch_acceptances;
DROP POLICY IF EXISTS smart_watch_acceptances_workspace_delete ON public.smart_watch_acceptances;

CREATE POLICY smart_watch_acceptances_workspace_select ON public.smart_watch_acceptances
  FOR SELECT TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'periods.read'));
CREATE POLICY smart_watch_acceptances_workspace_insert ON public.smart_watch_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (private.has_workspace_permission(workspace_id, 'exceptions.manage'));
CREATE POLICY smart_watch_acceptances_workspace_update ON public.smart_watch_acceptances
  FOR UPDATE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'exceptions.manage'))
  WITH CHECK (private.has_workspace_permission(workspace_id, 'exceptions.manage'));
CREATE POLICY smart_watch_acceptances_workspace_delete ON public.smart_watch_acceptances
  FOR DELETE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'exceptions.manage'));
