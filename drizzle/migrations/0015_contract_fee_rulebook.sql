-- A1-T1: Contract & Fee Rulebook foundation.
-- This adds a user-owned, versioned commercial rule layer without changing any
-- platform accounting engine, formula, tolerance, settlement logic, or SILO model.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('contract-files', 'contract-files', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit;

CREATE TABLE IF NOT EXISTS public.platform_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('hungerstation', 'keeta', 'jahez')),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  external_reference TEXT,
  counterparty TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_contracts_user_platform_name_unique_idx
  ON public.platform_contracts (user_id, platform, lower(btrim(name)))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS platform_contracts_user_platform_idx
  ON public.platform_contracts (user_id, platform, created_at DESC);

CREATE TABLE IF NOT EXISTS public.contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved')),
  source_note TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, contract_id, user_id),
  UNIQUE (contract_id, version_number),
  CONSTRAINT contract_versions_date_range_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT contract_versions_contract_owner_fkey
    FOREIGN KEY (contract_id, user_id)
    REFERENCES public.platform_contracts(id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS contract_versions_contract_dates_idx
  ON public.contract_versions (contract_id, effective_from DESC, version_number DESC);

CREATE TABLE IF NOT EXISTS public.contract_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL,
  version_id UUID NOT NULL,
  rule_key TEXT NOT NULL CHECK (length(btrim(rule_key)) > 0),
  rule_type TEXT NOT NULL CHECK (
    rule_type IN (
      'commission_rate',
      'payment_fee',
      'wallet_fee',
      'minimum_fee',
      'delivery_fee',
      'promotion_funding',
      'free_delivery_funding',
      'advertising_fee',
      'refund_rule',
      'tax_rule',
      'other_fee'
    )
  ),
  value_kind TEXT NOT NULL CHECK (
    value_kind IN ('percentage', 'amount', 'boolean', 'text')
  ),
  numeric_value NUMERIC(18,6),
  text_value TEXT,
  currency TEXT CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  funding_source TEXT CHECK (
    funding_source IS NULL OR
    funding_source IN ('platform', 'merchant', 'shared', 'unknown')
  ),
  scope_type TEXT NOT NULL DEFAULT 'all'
    CHECK (scope_type IN ('all', 'branch')),
  scope_key TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_fee_rules_version_owner_fkey
    FOREIGN KEY (version_id, contract_id, user_id)
    REFERENCES public.contract_versions(id, contract_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT contract_fee_rules_value_shape_check CHECK (
    (value_kind IN ('percentage', 'amount') AND numeric_value IS NOT NULL AND text_value IS NULL)
    OR
    (value_kind IN ('boolean', 'text') AND numeric_value IS NULL AND text_value IS NOT NULL)
  ),
  CONSTRAINT contract_fee_rules_percentage_check CHECK (
    value_kind <> 'percentage' OR (numeric_value >= 0 AND numeric_value <= 100)
  ),
  CONSTRAINT contract_fee_rules_amount_currency_check CHECK (
    value_kind <> 'amount' OR currency IS NOT NULL
  ),
  CONSTRAINT contract_fee_rules_scope_check CHECK (
    (scope_type = 'all' AND scope_key IS NULL)
    OR
    (scope_type = 'branch' AND length(btrim(scope_key)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_fee_rules_version_rule_scope_unique_idx
  ON public.contract_fee_rules (
    version_id,
    lower(btrim(rule_key)),
    scope_type,
    COALESCE(lower(btrim(scope_key)), '')
  );

CREATE INDEX IF NOT EXISTS contract_fee_rules_lookup_idx
  ON public.contract_fee_rules (contract_id, version_id, rule_type, scope_type);

CREATE TABLE IF NOT EXISTS public.contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL,
  version_id UUID NOT NULL,
  original_name TEXT NOT NULL CHECK (length(btrim(original_name)) > 0),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 26214400),
  storage_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_documents_version_owner_fkey
    FOREIGN KEY (version_id, contract_id, user_id)
    REFERENCES public.contract_versions(id, contract_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS contract_documents_version_idx
  ON public.contract_documents (version_id, created_at);

CREATE TABLE IF NOT EXISTS public.contract_rule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('contract', 'version', 'rule', 'document')),
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('insert', 'update', 'delete', 'approve')),
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_rule_events_contract_idx
  ON public.contract_rule_events (contract_id, created_at DESC);

ALTER TABLE public.platform_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_rule_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_contracts_own ON public.platform_contracts;
CREATE POLICY platform_contracts_own ON public.platform_contracts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS contract_versions_own ON public.contract_versions;
CREATE POLICY contract_versions_own ON public.contract_versions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS contract_fee_rules_own ON public.contract_fee_rules;
CREATE POLICY contract_fee_rules_own ON public.contract_fee_rules
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS contract_documents_own ON public.contract_documents;
CREATE POLICY contract_documents_own ON public.contract_documents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS contract_rule_events_select_own ON public.contract_rule_events;
CREATE POLICY contract_rule_events_select_own ON public.contract_rule_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.contract_rule_events FROM authenticated;

DROP POLICY IF EXISTS contract_files_select_own ON storage.objects;
CREATE POLICY contract_files_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'contract-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS contract_files_insert_own ON storage.objects;
CREATE POLICY contract_files_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contract-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS contract_files_delete_own ON storage.objects;
CREATE POLICY contract_files_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'contract-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.guard_contract_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_overlap UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' THEN
      RAISE EXCEPTION 'Approved contract versions are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Approved contract versions are immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.contract_fee_rules r
      WHERE r.version_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'A contract version requires at least one fee rule before approval';
    END IF;

    SELECT v.id INTO v_overlap
    FROM public.contract_versions v
    WHERE v.contract_id = NEW.contract_id
      AND v.id <> NEW.id
      AND v.status = 'approved'
      AND daterange(
        v.effective_from,
        CASE WHEN v.effective_to IS NULL THEN NULL ELSE v.effective_to + 1 END,
        '[)'
      ) && daterange(
        NEW.effective_from,
        CASE WHEN NEW.effective_to IS NULL THEN NULL ELSE NEW.effective_to + 1 END,
        '[)'
      )
    LIMIT 1;

    IF v_overlap IS NOT NULL THEN
      RAISE EXCEPTION 'Approved contract versions may not overlap in effective dates';
    END IF;

    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_versions_guard_trigger ON public.contract_versions;
CREATE TRIGGER contract_versions_guard_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.contract_versions
FOR EACH ROW EXECUTE FUNCTION public.guard_contract_version();

CREATE OR REPLACE FUNCTION public.guard_contract_rule()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_version_id UUID;
  v_status TEXT;
BEGIN
  v_version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;

  SELECT status INTO v_status
  FROM public.contract_versions
  WHERE id = v_version_id;

  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'Rules in an approved contract version are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_fee_rules_guard_trigger ON public.contract_fee_rules;
CREATE TRIGGER contract_fee_rules_guard_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.contract_fee_rules
FOR EACH ROW EXECUTE FUNCTION public.guard_contract_rule();

CREATE OR REPLACE FUNCTION public.guard_contract_document()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_version_id UUID;
  v_status TEXT;
BEGIN
  v_version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;

  SELECT status INTO v_status
  FROM public.contract_versions
  WHERE id = v_version_id;

  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'Documents in an approved contract version are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_documents_guard_trigger ON public.contract_documents;
CREATE TRIGGER contract_documents_guard_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.contract_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_contract_document();

CREATE OR REPLACE FUNCTION public.log_contract_rule_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
  v_old JSONB;
  v_new JSONB;
  v_user_id UUID;
  v_contract_id UUID;
  v_entity_id UUID;
  v_entity_type TEXT;
  v_event_type TEXT;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_row := COALESCE(v_new, v_old);
  v_user_id := (v_row ->> 'user_id')::uuid;

  IF TG_TABLE_NAME = 'platform_contracts' THEN
    v_contract_id := (v_row ->> 'id')::uuid;
    v_entity_id := v_contract_id;
    v_entity_type := 'contract';
  ELSIF TG_TABLE_NAME = 'contract_versions' THEN
    v_contract_id := (v_row ->> 'contract_id')::uuid;
    v_entity_id := (v_row ->> 'id')::uuid;
    v_entity_type := 'version';
  ELSIF TG_TABLE_NAME = 'contract_fee_rules' THEN
    v_contract_id := (v_row ->> 'contract_id')::uuid;
    v_entity_id := (v_row ->> 'id')::uuid;
    v_entity_type := 'rule';
  ELSE
    v_contract_id := (v_row ->> 'contract_id')::uuid;
    v_entity_id := (v_row ->> 'id')::uuid;
    v_entity_type := 'document';
  END IF;

  v_event_type := lower(TG_OP);
  IF TG_TABLE_NAME = 'contract_versions'
     AND TG_OP = 'UPDATE'
     AND OLD.status <> 'approved'
     AND NEW.status = 'approved' THEN
    v_event_type := 'approve';
  END IF;

  INSERT INTO public.contract_rule_events (
    user_id,
    contract_id,
    entity_type,
    entity_id,
    event_type,
    before_data,
    after_data
  )
  VALUES (
    v_user_id,
    v_contract_id,
    v_entity_type,
    v_entity_id,
    v_event_type,
    v_old,
    v_new
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS platform_contracts_audit_trigger ON public.platform_contracts;
CREATE TRIGGER platform_contracts_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.platform_contracts
FOR EACH ROW EXECUTE FUNCTION public.log_contract_rule_event();

DROP TRIGGER IF EXISTS contract_versions_audit_trigger ON public.contract_versions;
CREATE TRIGGER contract_versions_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.contract_versions
FOR EACH ROW EXECUTE FUNCTION public.log_contract_rule_event();

DROP TRIGGER IF EXISTS contract_fee_rules_audit_trigger ON public.contract_fee_rules;
CREATE TRIGGER contract_fee_rules_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.contract_fee_rules
FOR EACH ROW EXECUTE FUNCTION public.log_contract_rule_event();

DROP TRIGGER IF EXISTS contract_documents_audit_trigger ON public.contract_documents;
CREATE TRIGGER contract_documents_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.contract_documents
FOR EACH ROW EXECUTE FUNCTION public.log_contract_rule_event();

COMMENT ON COLUMN public.contract_fee_rules.numeric_value IS
  'Percentage values are stored as percentage points (for example 18.000000 means 18%), not decimal ratios.';
