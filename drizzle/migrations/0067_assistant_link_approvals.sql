-- 0067: an AI-assistant (Claude / ChatGPT) token works only if the link was approved from a session that
-- finished every sign-in step.
--
-- Why: assistant tokens carry `client_id` and were exempt from the email-code and authenticator checks
-- (migrations 0044, 0045). Supabase approves a link from the browser, so someone holding only the
-- password could approve one by calling Supabase directly, skip the consent page, and read workspace
-- data with the token. Now the app's server records each approval only after checking both codes
-- (record_assistant_link_approval, service role only), and a token whose (user, client) pair has no
-- record fails the checks. Links that already existed when this was applied are recorded once, so
-- current users keep their assistants.
--
-- Must be applied to production together with the app change that records approvals.

CREATE TABLE IF NOT EXISTS public.assistant_link_approvals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_session_id text,
  PRIMARY KEY (user_id, client_id)
);

ALTER TABLE public.assistant_link_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_link_approvals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.assistant_link_approvals TO service_role;

CREATE OR REPLACE FUNCTION private.assistant_link_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assistant_link_approvals a
    WHERE a.user_id = (select auth.uid())
      AND a.client_id::text = coalesce((select auth.jwt()) ->> 'client_id', '')
  );
$$;

CREATE OR REPLACE FUNCTION private.email_code_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN coalesce((select auth.jwt()) ->> 'client_id', '') <> '' THEN private.assistant_link_approved()
    ELSE (
      NOT (coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb) @> '[{"method":"password"}]'::jsonb)
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
      )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION private.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN coalesce((select auth.jwt()) ->> 'client_id', '') <> '' THEN private.assistant_link_approved()
    ELSE (
      coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = (select auth.uid()) AND f.status = 'verified'
      )
    ) AND private.email_code_satisfied()
  END;
$$;

REVOKE ALL ON FUNCTION private.assistant_link_approved() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.assistant_link_approved() TO authenticated;
GRANT EXECUTE ON FUNCTION private.email_code_satisfied() TO authenticated;
GRANT EXECUTE ON FUNCTION private.mfa_satisfied() TO authenticated;

-- Called by the app's server after it has checked both sign-in codes; reads the client from the pending
-- Supabase authorization so the browser cannot name a different one.
CREATE OR REPLACE FUNCTION public.record_assistant_link_approval(
  p_authorization_id text,
  p_user_id uuid,
  p_session_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client uuid;
BEGIN
  SELECT a.client_id INTO v_client
  FROM auth.oauth_authorizations a
  WHERE a.authorization_id = p_authorization_id
    AND (a.user_id IS NULL OR a.user_id = p_user_id)
    AND a.expires_at > now();
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'authorization not found or expired' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.assistant_link_approvals (user_id, client_id, approved_at, approved_session_id)
  VALUES (p_user_id, v_client, now(), p_session_id)
  ON CONFLICT (user_id, client_id) DO UPDATE
    SET approved_at = excluded.approved_at, approved_session_id = excluded.approved_session_id;
  RETURN v_client;
END;
$$;

REVOKE ALL ON FUNCTION public.record_assistant_link_approval(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_assistant_link_approval(text, uuid, text) TO service_role;

-- Links that existed before this change keep working.
DO $$
BEGIN
  IF to_regclass('auth.oauth_consents') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.assistant_link_approvals (user_id, client_id, approved_at)
      SELECT DISTINCT ON (c.user_id, c.client_id) c.user_id, c.client_id, c.granted_at
      FROM auth.oauth_consents c
      WHERE c.revoked_at IS NULL
      ON CONFLICT (user_id, client_id) DO NOTHING
    $sql$;
  END IF;
END $$;
