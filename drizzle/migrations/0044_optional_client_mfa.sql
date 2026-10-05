-- Optional two-step sign-in for client users (authenticator app, Supabase TOTP).
--
-- A user who turned it on (a verified factor in auth.mfa_factors) only gets company data with a session that
-- passed the 6-digit code (JWT aal = aal2). OAuth tokens issued to Claude / ChatGPT carry a client_id claim and
-- stay at aal1; they are accepted because approving the connection already required the code
-- (src/routes/[.]lovable.oauth.consent.tsx). Users without a factor are unchanged.
-- Same rule as mfaSatisfied in src/lib/mfa.ts. Re-runnable.

CREATE OR REPLACE FUNCTION private.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
      OR coalesce((select auth.jwt()) ->> 'client_id', '') <> ''
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = (select auth.uid()) AND f.status = 'verified'
      );
$$;

CREATE OR REPLACE FUNCTION private.has_workspace_permission(
  p_workspace_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.workspace_role_allows(p_workspace_id, p_permission)
     AND private.workspace_feature_allows(p_workspace_id, p_permission)
     AND private.mfa_satisfied();
$$;

REVOKE ALL ON FUNCTION private.mfa_satisfied() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.mfa_satisfied() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_workspace_permission(uuid, text) TO authenticated;
