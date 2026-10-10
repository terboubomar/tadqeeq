-- Scheduled report emails: a workspace saves schedules that email a summary of its audited periods (key figures,
-- change against the month before and a link to the reports) monthly, weekly or after each new period upload.
-- Recipients may be outside the workspace, so only users.manage (owner, admin) creates, edits or deletes schedules;
-- reports.read can see them. The scheduled job reads and updates rows with the service role. Additive and
-- re-runnable; must be applied to production before deploying the code that uses it.

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id()
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  frequency text NOT NULL CHECK (frequency IN ('monthly', 'weekly', 'on_upload')),
  -- Day 1-28 so every month has it; weekday 0 = Sunday … 6 = Saturday (Asia/Riyadh).
  day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 28),
  weekday smallint CHECK (weekday BETWEEN 0 AND 6),
  recipients text[] NOT NULL CHECK (cardinality(recipients) BETWEEN 1 AND 10),
  active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  -- For on_upload: the newest period already reported, so the same upload is not sent twice.
  last_period_id uuid,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_schedules_timing_check CHECK (
    (frequency = 'monthly' AND day_of_month IS NOT NULL)
    OR (frequency = 'weekly' AND weekday IS NOT NULL)
    OR frequency = 'on_upload'
  )
);

CREATE INDEX IF NOT EXISTS report_schedules_workspace_idx ON public.report_schedules (workspace_id);
CREATE INDEX IF NOT EXISTS report_schedules_active_idx ON public.report_schedules (frequency) WHERE active;

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_schedules FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT ALL ON public.report_schedules TO service_role;

DROP POLICY IF EXISTS report_schedules_select ON public.report_schedules;
DROP POLICY IF EXISTS report_schedules_insert ON public.report_schedules;
DROP POLICY IF EXISTS report_schedules_update ON public.report_schedules;
DROP POLICY IF EXISTS report_schedules_delete ON public.report_schedules;

CREATE POLICY report_schedules_select ON public.report_schedules
  FOR SELECT TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'reports.read'));
CREATE POLICY report_schedules_insert ON public.report_schedules
  FOR INSERT TO authenticated
  WITH CHECK (private.has_workspace_permission(workspace_id, 'users.manage'));
CREATE POLICY report_schedules_update ON public.report_schedules
  FOR UPDATE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'users.manage'))
  WITH CHECK (private.has_workspace_permission(workspace_id, 'users.manage'));
CREATE POLICY report_schedules_delete ON public.report_schedules
  FOR DELETE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'users.manage'));
