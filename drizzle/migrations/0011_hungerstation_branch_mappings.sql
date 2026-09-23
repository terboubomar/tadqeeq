-- P1-T4: persist user-confirmed HungerStation branch identity mappings.
-- The stable key is HS Branch ID from the platform export. The mapped value is
-- the branch name as it appears on the HungerStation invoice. No financial
-- amounts participate in this identity layer.

CREATE TABLE IF NOT EXISTS public.hungerstation_branch_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hs_branch_id TEXT NOT NULL CHECK (length(btrim(hs_branch_id)) > 0),
  invoice_branch_name TEXT NOT NULL CHECK (length(btrim(invoice_branch_name)) > 0),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, hs_branch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS hungerstation_branch_mappings_user_invoice_name_unique_idx
  ON public.hungerstation_branch_mappings (user_id, lower(btrim(invoice_branch_name)));

ALTER TABLE public.hungerstation_branch_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hungerstation_branch_mappings_select_own
  ON public.hungerstation_branch_mappings;
CREATE POLICY hungerstation_branch_mappings_select_own
  ON public.hungerstation_branch_mappings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS hungerstation_branch_mappings_insert_own
  ON public.hungerstation_branch_mappings;
CREATE POLICY hungerstation_branch_mappings_insert_own
  ON public.hungerstation_branch_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS hungerstation_branch_mappings_update_own
  ON public.hungerstation_branch_mappings;
CREATE POLICY hungerstation_branch_mappings_update_own
  ON public.hungerstation_branch_mappings
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS hungerstation_branch_mappings_delete_own
  ON public.hungerstation_branch_mappings;
CREATE POLICY hungerstation_branch_mappings_delete_own
  ON public.hungerstation_branch_mappings
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
