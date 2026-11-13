-- 0066: remove table and function permissions the client roles never use.
--
-- Why: a check of the production database showed `anon` (signed-out requests) holding every
-- privilege, TRUNCATE included, on eleven older public tables, and `authenticated` holding
-- TRUNCATE on twelve. Row-level security already blocks reading and writing rows, but
-- TRUNCATE, REFERENCES and TRIGGER are not row-level and no client uses them. `anon` could
-- also execute two admin-check functions. Nothing in the app runs these as `anon`; the only
-- signed-out read is the active price plans, which keeps its grant.
--
-- Must be applied to production. Re-runnable, no data changes, no row-access changes for
-- signed-in users.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- The public pricing page reads active plans without signing in (policy "public read active plans").
GRANT SELECT ON public.subscription_plans TO anon;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ops_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_role() TO authenticated, service_role;
