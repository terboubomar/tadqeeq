CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('hungerstation','keeta')),
  label TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  branches JSONB NOT NULL DEFAULT '[]'::jsonb,
  daily JSONB NOT NULL DEFAULT '[]'::jsonb,
  invoice JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX periods_user_idx ON public.periods (user_id, period_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.periods TO authenticated;
GRANT ALL ON public.periods TO service_role;

ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own periods select" ON public.periods FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own periods insert" ON public.periods FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own periods update" ON public.periods FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own periods delete" ON public.periods FOR DELETE TO authenticated USING (auth.uid() = user_id);