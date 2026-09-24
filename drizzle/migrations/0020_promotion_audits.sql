-- B1-T1: persisted, user-confirmed promotion audit inputs.
-- Financial outputs remain deterministic and are derived in application code.

CREATE TABLE IF NOT EXISTS public.promotion_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (
    length(btrim(name)) >= 1 AND length(btrim(name)) <= 160
  ),
  campaign_revenue NUMERIC(16,2) NOT NULL CHECK (campaign_revenue >= 0),
  organic_baseline NUMERIC(16,2) NOT NULL CHECK (organic_baseline >= 0),
  restaurant_funded_discount NUMERIC(16,2) NOT NULL DEFAULT 0
    CHECK (restaurant_funded_discount >= 0),
  platform_funded_discount NUMERIC(16,2) NOT NULL DEFAULT 0
    CHECK (platform_funded_discount >= 0),
  unknown_funded_discount NUMERIC(16,2) NOT NULL DEFAULT 0
    CHECK (unknown_funded_discount >= 0),
  advertising_spend NUMERIC(16,2) NOT NULL DEFAULT 0
    CHECK (advertising_spend >= 0),
  commission_fees NUMERIC(16,2) NOT NULL DEFAULT 0
    CHECK (commission_fees >= 0),
  payment_fees NUMERIC(16,2) NOT NULL DEFAULT 0
    CHECK (payment_fees >= 0),
  delivery_campaign_fees NUMERIC(16,2) NOT NULL DEFAULT 0
    CHECK (delivery_campaign_fees >= 0),
  other_marketplace_fees NUMERIC(16,2) NOT NULL DEFAULT 0
    CHECK (other_marketplace_fees >= 0),
  cogs_amount NUMERIC(16,2) NOT NULL DEFAULT 0
    CHECK (cogs_amount >= 0),
  platform_roas NUMERIC(12,4) CHECK (
    platform_roas IS NULL OR platform_roas >= 0
  ),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promotion_audits_user_period_updated_idx
  ON public.promotion_audits (user_id, period_id, updated_at DESC);

ALTER TABLE public.promotion_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.promotion_audits FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promotion_audits TO authenticated;
GRANT ALL ON TABLE public.promotion_audits TO service_role;

DROP POLICY IF EXISTS promotion_audits_select_own ON public.promotion_audits;
CREATE POLICY promotion_audits_select_own
  ON public.promotion_audits
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.periods p
      WHERE p.id = promotion_audits.period_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS promotion_audits_insert_own ON public.promotion_audits;
CREATE POLICY promotion_audits_insert_own
  ON public.promotion_audits
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.periods p
      WHERE p.id = promotion_audits.period_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS promotion_audits_update_own ON public.promotion_audits;
CREATE POLICY promotion_audits_update_own
  ON public.promotion_audits
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.periods p
      WHERE p.id = promotion_audits.period_id
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS promotion_audits_delete_own ON public.promotion_audits;
CREATE POLICY promotion_audits_delete_own
  ON public.promotion_audits
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
