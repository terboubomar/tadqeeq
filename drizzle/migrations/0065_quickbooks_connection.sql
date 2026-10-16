-- 0065: QuickBooks Online as a fifth direct accounting connection.
--
-- QuickBooks signs in with Intuit (OAuth); the sealed secret holds the refresh token (replaced each time it is used),
-- the company id and the environment. Its API host is fixed, so it keeps no site. Additive and re-runnable.

ALTER TABLE public.accounting_connections DROP CONSTRAINT IF EXISTS accounting_connections_provider_check;
ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_provider_check CHECK (
  provider IN ('qoyod', 'daftra', 'zoho', 'odoo', 'quickbooks') AND (provider IN ('qoyod', 'quickbooks') OR site IS NOT NULL)
);

ALTER TABLE public.accounting_sync_entries DROP CONSTRAINT IF EXISTS accounting_sync_entries_provider_check;
ALTER TABLE public.accounting_sync_entries ADD CONSTRAINT accounting_sync_entries_provider_check CHECK (
  provider IN ('qoyod', 'daftra', 'zoho', 'odoo', 'quickbooks')
);
