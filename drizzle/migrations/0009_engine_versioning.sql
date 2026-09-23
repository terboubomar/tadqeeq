-- P2-T2: make stored audits traceable to the deterministic engine and
-- source-format fingerprints that produced them.
ALTER TABLE public.periods
  ADD COLUMN IF NOT EXISTS engine_version TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS format_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.periods.engine_version IS
  'Deterministic Tadqeeq accounting engine version used to produce the stored audit.';
COMMENT ON COLUMN public.periods.format_ids IS
  'Versioned platform source-format fingerprints detected before analysis.';
