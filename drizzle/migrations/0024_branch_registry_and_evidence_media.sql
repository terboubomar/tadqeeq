CREATE TABLE IF NOT EXISTS public.branch_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  hungerstation_id text,
  keeta_id text,
  jahez_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS branch_registry_user_name_idx ON public.branch_registry (user_id, lower(name));
REVOKE ALL ON TABLE public.branch_registry FROM anon;
REVOKE ALL ON TABLE public.branch_registry FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_registry TO authenticated;
GRANT ALL ON TABLE public.branch_registry TO service_role;
ALTER TABLE public.branch_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branch_registry_own" ON public.branch_registry;
CREATE POLICY "branch_registry_own" ON public.branch_registry FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.telegram_order_evidence DROP CONSTRAINT IF EXISTS telegram_order_evidence_media_type_check;
ALTER TABLE public.telegram_order_evidence ADD CONSTRAINT telegram_order_evidence_media_type_check
  CHECK (media_type IN ('video','video_document','photo','image_document'));