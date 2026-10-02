-- Ads ROI: saved analyses of uploaded HungerStation ads reports, and per-brand cost settings.
--
-- An analysis stores only the figures read from the report (per campaign and day, plus the
-- optional per-store order totals), never the file. Profit, break-even and recommendations
-- are recalculated in application code from these inputs and the brand settings.
--
-- Additive and safe to re-run. Must be applied to production before deploying the code
-- that saves analyses (the page still analyses uploads without it, but cannot save).

CREATE TABLE IF NOT EXISTS public.ads_roi_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id()
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'hungerstation' CHECK (platform IN ('hungerstation')),
  date_from date NOT NULL,
  date_to date NOT NULL CHECK (date_to >= date_from),
  source_file_name text CHECK (source_file_name IS NULL OR length(source_file_name) <= 255),
  orders_file_name text CHECK (orders_file_name IS NULL OR length(orders_file_name) <= 255),
  report jsonb NOT NULL,
  orders jsonb,
  spent numeric(16,2) NOT NULL DEFAULT 0,
  gmv numeric(16,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ads_roi_analyses_workspace_owner_fkey
    FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);

-- One saved analysis per workspace, platform and date range: uploading the same days again replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS ads_roi_analyses_workspace_range_uidx
  ON public.ads_roi_analyses (workspace_id, platform, date_from, date_to);

CREATE TABLE IF NOT EXISTS public.ads_roi_brand_settings (
  workspace_id uuid NOT NULL DEFAULT private.active_workspace_id()
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_key text NOT NULL CHECK (length(btrim(brand_key)) BETWEEN 1 AND 120),
  commission_rate numeric(6,4) CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate < 1)),
  food_cost_rate numeric(6,4) CHECK (food_cost_rate IS NULL OR (food_cost_rate >= 0 AND food_cost_rate < 1)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, brand_key),
  CONSTRAINT ads_roi_brand_settings_workspace_owner_fkey
    FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, owner_user_id) ON DELETE RESTRICT
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ads_roi_analyses', 'ads_roi_brand_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_workspace_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_workspace_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_workspace_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_workspace_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.has_workspace_permission(workspace_id, ''financials.read''))',
      t || '_workspace_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.has_workspace_permission(workspace_id, ''imports.create''))',
      t || '_workspace_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.has_workspace_permission(workspace_id, ''imports.create'')) WITH CHECK (private.has_workspace_permission(workspace_id, ''imports.create''))',
      t || '_workspace_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.has_workspace_permission(workspace_id, ''imports.create''))',
      t || '_workspace_delete', t
    );
  END LOOP;
END
$$;
