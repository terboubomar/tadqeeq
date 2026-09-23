-- P2-T1: retain exact audit inputs privately so a saved audit can be reproduced.
-- Ownership remains the existing authenticated user model. No company/Silo model
-- is introduced by this migration.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('source-files', 'source-files', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit;

CREATE TABLE IF NOT EXISTS public.audit_source_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('hungerstation', 'keeta', 'jahez')),
  source_kind TEXT NOT NULL CHECK (
    source_kind IN ('data', 'invoice', 'cpc_invoice', 'compensation')
  ),
  original_name TEXT NOT NULL,
  format_id TEXT,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 26214400),
  storage_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_source_files_period_idx
  ON public.audit_source_files (period_id, created_at);

ALTER TABLE public.audit_source_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_source_files_select_own ON public.audit_source_files;
CREATE POLICY audit_source_files_select_own
  ON public.audit_source_files
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS audit_source_files_insert_own ON public.audit_source_files;
CREATE POLICY audit_source_files_insert_own
  ON public.audit_source_files
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS audit_source_files_delete_own ON public.audit_source_files;
CREATE POLICY audit_source_files_delete_own
  ON public.audit_source_files
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS source_files_select_own ON storage.objects;
CREATE POLICY source_files_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'source-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS source_files_insert_own ON storage.objects;
CREATE POLICY source_files_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'source-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS source_files_delete_own ON storage.objects;
CREATE POLICY source_files_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'source-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
