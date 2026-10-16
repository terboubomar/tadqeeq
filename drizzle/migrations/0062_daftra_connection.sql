-- 0062: Daftra as a second direct accounting connection.
--
-- Daftra's API lives on each account's own site (mystore.daftra.com), so a connection also keeps that host. Only
-- Daftra hosts are allowed, so a saved key can never be sent elsewhere. Additive and re-runnable.

ALTER TABLE public.accounting_connections ADD COLUMN IF NOT EXISTS site text;

ALTER TABLE public.accounting_connections DROP CONSTRAINT IF EXISTS accounting_connections_site_check;
ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_site_check CHECK (
  site IS NULL OR site ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(daftra|daftara)\.com$'
);

ALTER TABLE public.accounting_connections DROP CONSTRAINT IF EXISTS accounting_connections_provider_check;
ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_provider_check CHECK (
  provider IN ('qoyod', 'daftra') AND (provider <> 'daftra' OR site IS NOT NULL)
);

ALTER TABLE public.accounting_sync_entries DROP CONSTRAINT IF EXISTS accounting_sync_entries_provider_check;
ALTER TABLE public.accounting_sync_entries ADD CONSTRAINT accounting_sync_entries_provider_check CHECK (provider IN ('qoyod', 'daftra'));
