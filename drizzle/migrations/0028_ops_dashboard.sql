CREATE TABLE public.ops_staff (
  user_id uuid PRIMARY KEY,
  role text NOT NULL DEFAULT 'support' CHECK (role IN ('owner','finance','sales','support')),
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ops_staff TO authenticated;
GRANT ALL ON public.ops_staff TO service_role;
ALTER TABLE public.ops_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ops_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.ops_staff WHERE user_id = auth.uid()
$$;

CREATE POLICY "ops staff read staff" ON public.ops_staff FOR SELECT TO authenticated USING (public.ops_role() IS NOT NULL);

CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pricing text NOT NULL DEFAULT 'per_branch' CHECK (pricing IN ('fixed','per_branch')),
  price numeric NOT NULL DEFAULT 0,
  cycle text NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly','yearly')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read plans" ON public.subscription_plans FOR SELECT TO authenticated USING (public.ops_role() IS NOT NULL);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  price numeric NOT NULL DEFAULT 0,
  branch_count integer NOT NULL DEFAULT 1,
  cycle text NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly','yearly')),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','overdue','cancelled','suspended')),
  starts_on date NOT NULL DEFAULT current_date,
  ends_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_workspace_idx ON public.subscriptions(workspace_id);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (public.ops_role() IS NOT NULL);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  paid_on date NOT NULL DEFAULT current_date,
  method text NOT NULL DEFAULT 'bank_transfer',
  reference text,
  receipt_path text,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_workspace_idx ON public.payments(workspace_id);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read payments" ON public.payments FOR SELECT TO authenticated USING (public.ops_role() IS NOT NULL);

CREATE TABLE public.ops_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  workspace_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ops_audit_log TO authenticated;
GRANT ALL ON public.ops_audit_log TO service_role;
ALTER TABLE public.ops_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read log" ON public.ops_audit_log FOR SELECT TO authenticated USING (public.ops_role() IS NOT NULL);

CREATE TABLE public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_user_id uuid,
  author_email text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_notes TO authenticated;
GRANT ALL ON public.client_notes TO service_role;
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops read notes" ON public.client_notes FOR SELECT TO authenticated USING (public.ops_role() IS NOT NULL);

INSERT INTO public.ops_staff (user_id, role, email)
SELECT pa.user_id, 'owner', u.email FROM public.platform_admins pa LEFT JOIN auth.users u ON u.id = pa.user_id
ON CONFLICT (user_id) DO NOTHING;