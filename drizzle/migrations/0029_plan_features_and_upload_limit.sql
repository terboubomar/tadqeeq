ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS upload_limit integer,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highlighted boolean NOT NULL DEFAULT false;

GRANT SELECT ON public.subscription_plans TO anon, authenticated;
DROP POLICY IF EXISTS "public read active plans" ON public.subscription_plans;
CREATE POLICY "public read active plans" ON public.subscription_plans
  FOR SELECT TO anon, authenticated USING (active = true);

CREATE OR REPLACE FUNCTION public.my_workspace_plan(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_uploads integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND status = 'active'
  ) AND NOT public.is_platform_admin() THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_uploads FROM public.periods
  WHERE workspace_id = p_workspace_id
    AND created_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh');

  SELECT p.id, p.name, p.features, p.upload_limit INTO v_sub
  FROM public.subscriptions s
  JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.workspace_id = p_workspace_id AND s.status IN ('active','trial','overdue')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN jsonb_build_object('plan_id', null, 'plan_name', null, 'features', null, 'upload_limit', null, 'uploads_this_month', v_uploads);
  END IF;

  RETURN jsonb_build_object('plan_id', v_sub.id, 'plan_name', v_sub.name, 'features', v_sub.features,
    'upload_limit', v_sub.upload_limit, 'uploads_this_month', v_uploads);
END;
$$;

REVOKE ALL ON FUNCTION public.my_workspace_plan(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_workspace_plan(uuid) TO authenticated;