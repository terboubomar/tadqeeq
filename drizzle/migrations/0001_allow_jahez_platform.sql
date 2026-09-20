-- Allow periods created by the Jahez audit engine.
-- Safe for existing HungerStation and Keeta rows.
ALTER TABLE public.periods
  DROP CONSTRAINT IF EXISTS periods_platform_check;

ALTER TABLE public.periods
  ADD CONSTRAINT periods_platform_check
  CHECK (platform IN ('hungerstation', 'keeta', 'jahez'));
