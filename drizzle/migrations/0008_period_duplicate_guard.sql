-- Prevent concurrent or cross-tab duplicate period inserts.
-- Current ownership is user-based; P3 will replace this index when periods become company-owned.
CREATE UNIQUE INDEX IF NOT EXISTS periods_user_platform_range_unique_idx
  ON public.periods (user_id, platform, period_start, period_end)
  WHERE period_start IS NOT NULL
    AND period_end IS NOT NULL;
