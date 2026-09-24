CREATE TABLE public.compensation_appeal_marks (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, order_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compensation_appeal_marks TO authenticated;
GRANT ALL ON public.compensation_appeal_marks TO service_role;
ALTER TABLE public.compensation_appeal_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appeal_marks_own" ON public.compensation_appeal_marks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);