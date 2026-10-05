-- Email sign-in code after the password (second step for every password sign-in).
--
-- A session that signed in with a password (JWT amr contains "password") only gets company data after the
-- 6-digit code emailed to the account was entered for that session (public.email_signin_codes.verified_at).
-- Not affected: Google / Apple sign-ins, sessions at aal2 (authenticator-app users use that code instead),
-- OAuth tokens of Claude / ChatGPT (client_id claim). Same rule as emailCodeRequired in src/lib/mfa.ts.
-- Codes are written only by the server (service role); users have no direct access. Re-runnable.
-- Must be applied to production before the code that sends the codes.

CREATE TABLE IF NOT EXISTS public.email_signin_codes (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text,
  expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  sends integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_signin_codes_user_idx ON public.email_signin_codes (user_id);

GRANT ALL ON public.email_signin_codes TO service_role;
ALTER TABLE public.email_signin_codes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.email_code_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT (coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb) @> '[{"method":"password"}]'::jsonb)
      OR coalesce((select auth.jwt()) ->> 'client_id', '') <> ''
      OR coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
      OR EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = (select auth.uid()) AND f.status = 'verified'
      )
      OR EXISTS (
        SELECT 1 FROM public.email_signin_codes c
        WHERE c.user_id = (select auth.uid())
          AND c.session_id::text = coalesce((select auth.jwt()) ->> 'session_id', '')
          AND c.verified_at IS NOT NULL
      );
$$;

CREATE OR REPLACE FUNCTION private.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
        coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     OR coalesce((select auth.jwt()) ->> 'client_id', '') <> ''
     OR NOT EXISTS (
          SELECT 1 FROM auth.mfa_factors f
          WHERE f.user_id = (select auth.uid()) AND f.status = 'verified'
        )
    ) AND private.email_code_satisfied();
$$;

REVOKE ALL ON FUNCTION private.email_code_satisfied() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.email_code_satisfied() TO authenticated;
GRANT EXECUTE ON FUNCTION private.mfa_satisfied() TO authenticated;
