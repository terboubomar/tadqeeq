-- A2-T3 follow-up: enforce least-privilege access for recovery evidence metadata.
-- 0018 intended authenticated users to have only SELECT + INSERT.

REVOKE ALL ON TABLE public.recovery_case_documents FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.recovery_case_documents TO authenticated;
GRANT ALL ON TABLE public.recovery_case_documents TO service_role;
