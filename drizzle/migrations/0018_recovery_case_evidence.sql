-- A2-T3: recovery claim dates and private supporting evidence.
-- Extends the lineage-aware recovery case model introduced in 0017.

ALTER TABLE public.recovery_case_details
  ADD COLUMN IF NOT EXISTS submitted_on DATE,
  ADD COLUMN IF NOT EXISTS response_on DATE,
  ADD COLUMN IF NOT EXISTS recovered_on DATE;

ALTER TABLE public.recovery_case_details
  DROP CONSTRAINT IF EXISTS recovery_case_details_response_date_order_check,
  DROP CONSTRAINT IF EXISTS recovery_case_details_recovered_date_order_check;

ALTER TABLE public.recovery_case_details
  ADD CONSTRAINT recovery_case_details_response_date_order_check CHECK (
    response_on IS NULL OR submitted_on IS NULL OR response_on >= submitted_on
  ),
  ADD CONSTRAINT recovery_case_details_recovered_date_order_check CHECK (
    recovered_on IS NULL
    OR response_on IS NULL
    OR recovered_on >= response_on
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('recovery-case-files', 'recovery-case-files', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit;

CREATE TABLE IF NOT EXISTS public.recovery_case_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recovery_case_id UUID NOT NULL
    REFERENCES public.recovery_case_details(id) ON DELETE RESTRICT,
  lineage_id UUID NOT NULL,
  exception_id TEXT NOT NULL CHECK (length(btrim(exception_id)) > 0),
  original_name TEXT NOT NULL CHECK (length(btrim(original_name)) > 0),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 26214400),
  storage_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recovery_case_id, sha256)
);

CREATE INDEX IF NOT EXISTS recovery_case_documents_user_created_idx
  ON public.recovery_case_documents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recovery_case_documents_case_created_idx
  ON public.recovery_case_documents (recovery_case_id, created_at, id);

ALTER TABLE public.recovery_case_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recovery_case_documents FROM anon;
GRANT SELECT, INSERT ON TABLE public.recovery_case_documents TO authenticated;
GRANT ALL ON TABLE public.recovery_case_documents TO service_role;
REVOKE UPDATE, DELETE ON TABLE public.recovery_case_documents FROM authenticated;

DROP POLICY IF EXISTS recovery_case_documents_select_own
  ON public.recovery_case_documents;
CREATE POLICY recovery_case_documents_select_own
  ON public.recovery_case_documents
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS recovery_case_documents_insert_own
  ON public.recovery_case_documents;
CREATE POLICY recovery_case_documents_insert_own
  ON public.recovery_case_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.recovery_case_details d
      WHERE d.id = recovery_case_documents.recovery_case_id
        AND d.user_id = (select auth.uid())
        AND d.lineage_id = recovery_case_documents.lineage_id
        AND d.exception_id = recovery_case_documents.exception_id
    )
  );

DROP POLICY IF EXISTS recovery_case_files_select_own ON storage.objects;
CREATE POLICY recovery_case_files_select_own
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recovery-case-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS recovery_case_files_insert_own ON storage.objects;
CREATE POLICY recovery_case_files_insert_own
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recovery-case-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Delete is storage-cleanup only when metadata persistence fails. Document
-- metadata itself stays immutable/read-only for authenticated users.
DROP POLICY IF EXISTS recovery_case_files_delete_own ON storage.objects;
CREATE POLICY recovery_case_files_delete_own
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'recovery-case-files'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
