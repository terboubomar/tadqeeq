-- P2-T5: retain unsupported source formats and create a support-safe alert.
-- This remains user-owned and does not introduce company/SILO provisioning.

CREATE TABLE IF NOT EXISTS public.format_change_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('hungerstation', 'keeta', 'jahez')),
  source_kind TEXT NOT NULL DEFAULT 'data' CHECK (source_kind IN ('data')),
  expected_format_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  observed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  original_name TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 26214400),
  storage_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS format_change_alerts_user_created_idx
  ON public.format_change_alerts (user_id, created_at DESC);

ALTER TABLE public.format_change_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS format_change_alerts_select_own ON public.format_change_alerts;
CREATE POLICY format_change_alerts_select_own
  ON public.format_change_alerts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Alerts are created by the authoritative server path using the authenticated
-- user's RLS context. Users cannot update the structural evidence fields.
DROP POLICY IF EXISTS format_change_alerts_insert_own ON public.format_change_alerts;
CREATE POLICY format_change_alerts_insert_own
  ON public.format_change_alerts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS format_change_alerts_delete_own ON public.format_change_alerts;
CREATE POLICY format_change_alerts_delete_own
  ON public.format_change_alerts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
