DROP INDEX IF EXISTS public.periods_user_platform_range_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS periods_user_platform_label_range_unique_idx
  ON public.periods (user_id, platform, lower(btrim(label)), period_start, period_end)
  WHERE period_start IS NOT NULL
    AND period_end IS NOT NULL;