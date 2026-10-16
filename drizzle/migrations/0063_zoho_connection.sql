-- 0063: Zoho Books as a third direct accounting connection.
--
-- Zoho signs in with OAuth; the sealed secret holds the refresh token and the account's data center, and site keeps
-- that data center's API host (www.zohoapis.sa, ...). Each provider may only keep its own kind of host. Additive and
-- re-runnable.

ALTER TABLE public.accounting_connections DROP CONSTRAINT IF EXISTS accounting_connections_site_check;
ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_site_check CHECK (
  site IS NULL
  OR (provider = 'daftra' AND site ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(daftra|daftara)\.com$')
  OR (provider = 'zoho' AND site ~ '^www\.zohoapis\.(com|eu|in|com\.au|jp|ca|sa|com\.cn)$')
);

ALTER TABLE public.accounting_connections DROP CONSTRAINT IF EXISTS accounting_connections_provider_check;
ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_provider_check CHECK (
  provider IN ('qoyod', 'daftra', 'zoho') AND (provider = 'qoyod' OR site IS NOT NULL)
);

ALTER TABLE public.accounting_sync_entries DROP CONSTRAINT IF EXISTS accounting_sync_entries_provider_check;
ALTER TABLE public.accounting_sync_entries ADD CONSTRAINT accounting_sync_entries_provider_check CHECK (provider IN ('qoyod', 'daftra', 'zoho'));
