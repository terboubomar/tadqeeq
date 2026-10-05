-- Messages from the public contact page (/contact), read and handled in the ops console (/ops/messages).
-- Only the server (service role) reads or writes this table: no grants or policies for anon / authenticated.
-- Re-runnable.

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL CHECK (topic IN ('sales', 'support', 'billing', 'other')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  company text CHECK (company IS NULL OR length(company) <= 160),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  mobile text NOT NULL CHECK (length(mobile) BETWEEN 8 AND 20),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  -- SHA-256 of the sender's IP, only to limit repeated sends; the IP itself is not stored.
  ip_hash text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled')),
  handled_at timestamptz,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_status_idx ON public.contact_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_ip_idx ON public.contact_messages (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_email_idx ON public.contact_messages (email, created_at DESC);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_messages FROM anon, authenticated;
GRANT ALL ON public.contact_messages TO service_role;
