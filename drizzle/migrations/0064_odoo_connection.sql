-- 0064: Odoo as a fourth direct accounting connection.
--
-- Odoo runs on the customer's own address (mycompany.odoo.com or their domain), kept in site as a plain host name: no
-- addresses by number, no ports. The sealed secret holds the API key with its database and login. Additive and
-- re-runnable.

ALTER TABLE public.accounting_connections DROP CONSTRAINT IF EXISTS accounting_connections_site_check;
ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_site_check CHECK (
  site IS NULL
  OR (provider = 'daftra' AND site ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(daftra|daftara)\.com$')
  OR (provider = 'zoho' AND site ~ '^www\.zohoapis\.(com|eu|in|com\.au|jp|ca|sa|com\.cn)$')
  OR (
    provider = 'odoo'
    AND length(site) <= 253
    AND site ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
    AND site !~ '\.(localhost|local|internal)$'
  )
);

ALTER TABLE public.accounting_connections DROP CONSTRAINT IF EXISTS accounting_connections_provider_check;
ALTER TABLE public.accounting_connections ADD CONSTRAINT accounting_connections_provider_check CHECK (
  provider IN ('qoyod', 'daftra', 'zoho', 'odoo') AND (provider = 'qoyod' OR site IS NOT NULL)
);

ALTER TABLE public.accounting_sync_entries DROP CONSTRAINT IF EXISTS accounting_sync_entries_provider_check;
ALTER TABLE public.accounting_sync_entries ADD CONSTRAINT accounting_sync_entries_provider_check CHECK (provider IN ('qoyod', 'daftra', 'zoho', 'odoo'));
