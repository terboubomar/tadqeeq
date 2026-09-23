-- A1-T1.1: harden Contract & Fee Rulebook Data API grants and trigger functions.
-- Keep the Rulebook available only to authenticated users, still constrained by
-- the ownership RLS policies created in 0015.

REVOKE ALL ON TABLE public.platform_contracts FROM anon;
REVOKE ALL ON TABLE public.contract_versions FROM anon;
REVOKE ALL ON TABLE public.contract_fee_rules FROM anon;
REVOKE ALL ON TABLE public.contract_documents FROM anon;
REVOKE ALL ON TABLE public.contract_rule_events FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.platform_contracts
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.contract_versions
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.contract_fee_rules
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.contract_documents
  TO authenticated;

GRANT SELECT
  ON TABLE public.contract_rule_events
  TO authenticated;

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.contract_rule_events
  FROM authenticated;

-- These are trigger-only functions. They must not be callable through the Data API.
ALTER FUNCTION public.log_contract_rule_event() SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.log_contract_rule_event()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_contract_version()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_contract_rule()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_contract_document()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.log_contract_rule_event() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_contract_version() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_contract_rule() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_contract_document() TO postgres;
