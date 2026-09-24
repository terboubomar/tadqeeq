-- Compensation Evidence V1: Telegram branch binding, order evidence, and human-reviewed compensation cases.
-- Original videos stay in Telegram. Tadqeeq stores Telegram file identifiers plus a private thumbnail.

CREATE TABLE IF NOT EXISTS public.telegram_branch_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_key TEXT NOT NULL CHECK (length(btrim(branch_key)) BETWEEN 1 AND 160),
  branch_name TEXT NOT NULL CHECK (length(btrim(branch_name)) BETWEEN 1 AND 160),
  telegram_chat_id BIGINT,
  telegram_chat_title TEXT CHECK (
    telegram_chat_title IS NULL OR length(btrim(telegram_chat_title)) BETWEEN 1 AND 255
  ),
  connect_code_hash TEXT CHECK (
    connect_code_hash IS NULL OR connect_code_hash ~ '^[0-9a-f]{64}$'
  ),
  connect_code_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  UNIQUE (user_id, branch_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_branch_chats_connected_chat_uidx
  ON public.telegram_branch_chats (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS telegram_branch_chats_user_updated_idx
  ON public.telegram_branch_chats (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS telegram_branch_chats_connect_hash_idx
  ON public.telegram_branch_chats (connect_code_hash)
  WHERE connect_code_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_order_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_chat_id UUID NOT NULL,
  order_number TEXT NOT NULL CHECK (length(btrim(order_number)) BETWEEN 1 AND 120),
  order_lookup_key TEXT NOT NULL CHECK (length(btrim(order_lookup_key)) BETWEEN 1 AND 120),
  telegram_chat_id BIGINT NOT NULL,
  telegram_message_id BIGINT NOT NULL,
  telegram_file_id TEXT NOT NULL CHECK (length(btrim(telegram_file_id)) > 0),
  telegram_file_unique_id TEXT NOT NULL CHECK (length(btrim(telegram_file_unique_id)) > 0),
  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'video_document')),
  thumbnail_file_id TEXT,
  thumbnail_storage_path TEXT UNIQUE,
  sender_telegram_id BIGINT,
  sender_name TEXT CHECK (
    sender_name IS NULL OR length(btrim(sender_name)) BETWEEN 1 AND 200
  ),
  caption TEXT CHECK (caption IS NULL OR length(caption) <= 1024),
  captured_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  UNIQUE (telegram_chat_id, telegram_message_id),
  CONSTRAINT telegram_order_evidence_branch_owner_fkey
    FOREIGN KEY (branch_chat_id, user_id)
    REFERENCES public.telegram_branch_chats(id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS telegram_order_evidence_user_order_idx
  ON public.telegram_order_evidence (user_id, order_lookup_key, captured_at DESC);

CREATE INDEX IF NOT EXISTS telegram_order_evidence_branch_created_idx
  ON public.telegram_order_evidence (branch_chat_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.compensation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.periods(id) ON DELETE SET NULL,
  evidence_id UUID,
  platform TEXT NOT NULL CHECK (platform IN ('hungerstation', 'keeta', 'jahez')),
  order_number TEXT NOT NULL CHECK (length(btrim(order_number)) BETWEEN 1 AND 120),
  branch_name TEXT CHECK (
    branch_name IS NULL OR length(btrim(branch_name)) BETWEEN 1 AND 160
  ),
  compensation_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (compensation_amount >= 0),
  compensation_reason TEXT NOT NULL CHECK (
    length(btrim(compensation_reason)) BETWEEN 1 AND 1000
  ),
  employee_explanation TEXT NOT NULL CHECK (
    length(btrim(employee_explanation)) BETWEEN 1 AND 6000
  ),
  audit_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_ar TEXT NOT NULL CHECK (length(draft_ar) <= 12000),
  draft_en TEXT NOT NULL CHECK (length(draft_en) <= 12000),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (
    status IN ('draft', 'ready', 'submitted', 'accepted', 'rejected', 'recovered', 'closed')
  ),
  aggregator_case_reference TEXT CHECK (
    aggregator_case_reference IS NULL
    OR length(btrim(aggregator_case_reference)) BETWEEN 1 AND 160
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT compensation_cases_evidence_owner_fkey
    FOREIGN KEY (evidence_id, user_id)
    REFERENCES public.telegram_order_evidence(id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS compensation_cases_user_updated_idx
  ON public.compensation_cases (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS compensation_cases_user_order_idx
  ON public.compensation_cases (user_id, order_number, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'telegram-evidence-thumbnails',
  'telegram-evidence-thumbnails',
  false,
  2097152
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit;

ALTER TABLE public.telegram_branch_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_order_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_cases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.telegram_branch_chats FROM anon, authenticated;
REVOKE ALL ON TABLE public.telegram_order_evidence FROM anon, authenticated;
REVOKE ALL ON TABLE public.compensation_cases FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.telegram_branch_chats TO authenticated;
GRANT SELECT
  ON TABLE public.telegram_order_evidence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.compensation_cases TO authenticated;

GRANT ALL ON TABLE public.telegram_branch_chats TO service_role;
GRANT ALL ON TABLE public.telegram_order_evidence TO service_role;
GRANT ALL ON TABLE public.compensation_cases TO service_role;

DROP POLICY IF EXISTS telegram_branch_chats_select_own ON public.telegram_branch_chats;
CREATE POLICY telegram_branch_chats_select_own
  ON public.telegram_branch_chats
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS telegram_branch_chats_insert_own ON public.telegram_branch_chats;
CREATE POLICY telegram_branch_chats_insert_own
  ON public.telegram_branch_chats
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS telegram_branch_chats_update_own ON public.telegram_branch_chats;
CREATE POLICY telegram_branch_chats_update_own
  ON public.telegram_branch_chats
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS telegram_branch_chats_delete_own ON public.telegram_branch_chats;
CREATE POLICY telegram_branch_chats_delete_own
  ON public.telegram_branch_chats
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS telegram_order_evidence_select_own ON public.telegram_order_evidence;
CREATE POLICY telegram_order_evidence_select_own
  ON public.telegram_order_evidence
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS compensation_cases_select_own ON public.compensation_cases;
CREATE POLICY compensation_cases_select_own
  ON public.compensation_cases
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS compensation_cases_insert_own ON public.compensation_cases;
CREATE POLICY compensation_cases_insert_own
  ON public.compensation_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      period_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.periods p
        WHERE p.id = compensation_cases.period_id
          AND p.user_id = (select auth.uid())
      )
    )
    AND (
      evidence_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.telegram_order_evidence e
        WHERE e.id = compensation_cases.evidence_id
          AND e.user_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS compensation_cases_update_own ON public.compensation_cases;
CREATE POLICY compensation_cases_update_own
  ON public.compensation_cases
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      period_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.periods p
        WHERE p.id = compensation_cases.period_id
          AND p.user_id = (select auth.uid())
      )
    )
    AND (
      evidence_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.telegram_order_evidence e
        WHERE e.id = compensation_cases.evidence_id
          AND e.user_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS compensation_cases_delete_own ON public.compensation_cases;
CREATE POLICY compensation_cases_delete_own
  ON public.compensation_cases
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS telegram_evidence_thumbnails_select_own ON storage.objects;
CREATE POLICY telegram_evidence_thumbnails_select_own
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'telegram-evidence-thumbnails'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
