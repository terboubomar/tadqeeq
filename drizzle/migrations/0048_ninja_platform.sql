-- Add Ninja as a first-class audit platform and branch identifier.
-- Existing HungerStation, Keeta and Jahez rows remain unchanged.

ALTER TABLE public.periods
  DROP CONSTRAINT IF EXISTS periods_platform_check;
ALTER TABLE public.periods
  ADD CONSTRAINT periods_platform_check
  CHECK (platform IN ('hungerstation', 'keeta', 'jahez', 'ninja'));

ALTER TABLE public.audit_source_files
  DROP CONSTRAINT IF EXISTS audit_source_files_platform_check;
ALTER TABLE public.audit_source_files
  ADD CONSTRAINT audit_source_files_platform_check
  CHECK (platform IN ('hungerstation', 'keeta', 'jahez', 'ninja'));

ALTER TABLE public.branch_registry
  ADD COLUMN IF NOT EXISTS ninja_id text;

CREATE UNIQUE INDEX IF NOT EXISTS branch_registry_workspace_ninja_idx
  ON public.branch_registry (workspace_id, ninja_id)
  WHERE ninja_id IS NOT NULL;

ALTER TABLE public.smart_watch_acceptances
  DROP CONSTRAINT IF EXISTS smart_watch_acceptances_platform_check;
ALTER TABLE public.smart_watch_acceptances
  ADD CONSTRAINT smart_watch_acceptances_platform_check
  CHECK (platform IN ('hungerstation', 'keeta', 'jahez', 'ninja'));
