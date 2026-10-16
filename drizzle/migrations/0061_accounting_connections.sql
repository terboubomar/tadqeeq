-- 0061: direct connections to accounting systems (Qoyod first).
--
-- accounting_connections holds a workspace's API key for an accounting system, encrypted by the app server
-- (AES-256-GCM, key in the INTEGRATIONS_ENCRYPTION_KEY server secret); the database never sees the plain key.
-- accounting_sync_entries records every journal entry sent, so the same entry is never posted twice.
-- Both tables are server-only: no grants or policies for anon or authenticated, so the browser cannot read or write
-- them; the app reads them with the service role after checking the user's permission.
-- Additive and re-runnable.

CREATE TABLE IF NOT EXISTS public.accounting_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('qoyod')),
  secret_ciphertext text NOT NULL CHECK (length(secret_ciphertext) BETWEEN 20 AND 4000),
  -- The key's last four characters, to show which key is connected.
  secret_hint text NOT NULL CHECK (length(secret_hint) BETWEEN 1 AND 8),
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

REVOKE ALL ON TABLE public.accounting_connections FROM PUBLIC;
REVOKE ALL ON TABLE public.accounting_connections FROM anon;
REVOKE ALL ON TABLE public.accounting_connections FROM authenticated;
GRANT ALL ON TABLE public.accounting_connections TO service_role;
ALTER TABLE public.accounting_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.accounting_sync_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('qoyod')),
  -- The period's lineage id (or id), so re-analysing a period does not post its entries again.
  period_key text NOT NULL CHECK (length(period_key) BETWEEN 1 AND 64),
  -- Which entry of the period: the branch's cost-center key, or its name.
  entry_key text NOT NULL CHECK (length(entry_key) BETWEEN 1 AND 200),
  reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 80),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 80),
  total numeric(14, 2) NOT NULL,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, period_key, entry_key)
);

REVOKE ALL ON TABLE public.accounting_sync_entries FROM PUBLIC;
REVOKE ALL ON TABLE public.accounting_sync_entries FROM anon;
REVOKE ALL ON TABLE public.accounting_sync_entries FROM authenticated;
GRANT ALL ON TABLE public.accounting_sync_entries TO service_role;
ALTER TABLE public.accounting_sync_entries ENABLE ROW LEVEL SECURITY;
