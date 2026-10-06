-- The workspace's own chart of accounts for the journal entries shown in the branch report.
-- One row per entry account (sales revenue, output VAT, platform receivable, ...): the workspace's code and name.
-- Read with financials.read; edited with contracts.manage (owner, admin, auditor). Re-runnable.

CREATE TABLE IF NOT EXISTS public.journal_account_settings (
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id()
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_key text NOT NULL CHECK (account_key IN (
    'platform_receivable',
    'sales_revenue',
    'output_vat',
    'commission_expense',
    'payment_fee_expense',
    'marketing_expense',
    'compensation_expense',
    'other_platform_fee_expense',
    'input_vat',
    'settlement_difference'
  )),
  account_code text NOT NULL DEFAULT '' CHECK (length(account_code) <= 40),
  account_name text NOT NULL DEFAULT '' CHECK (length(account_name) <= 160),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, account_key),
  CONSTRAINT journal_account_settings_workspace_owner_fkey
    FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);

ALTER TABLE public.journal_account_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_account_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_account_settings TO authenticated;
GRANT ALL ON public.journal_account_settings TO service_role;

DROP POLICY IF EXISTS journal_account_settings_select ON public.journal_account_settings;
DROP POLICY IF EXISTS journal_account_settings_insert ON public.journal_account_settings;
DROP POLICY IF EXISTS journal_account_settings_update ON public.journal_account_settings;
DROP POLICY IF EXISTS journal_account_settings_delete ON public.journal_account_settings;

CREATE POLICY journal_account_settings_select ON public.journal_account_settings
  FOR SELECT TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'financials.read'));
CREATE POLICY journal_account_settings_insert ON public.journal_account_settings
  FOR INSERT TO authenticated
  WITH CHECK (private.has_workspace_permission(workspace_id, 'contracts.manage'));
CREATE POLICY journal_account_settings_update ON public.journal_account_settings
  FOR UPDATE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'contracts.manage'))
  WITH CHECK (private.has_workspace_permission(workspace_id, 'contracts.manage'));
CREATE POLICY journal_account_settings_delete ON public.journal_account_settings
  FOR DELETE TO authenticated
  USING (private.has_workspace_permission(workspace_id, 'contracts.manage'));
