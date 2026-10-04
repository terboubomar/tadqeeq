-- Order-based plans.
--
-- Plans are priced by the orders checked per month, with unlimited branches, platforms, users
-- and uploads. A plan carries its monthly and yearly price, an order limit (soft: never blocks an
-- upload) and may be priced by agreement. A subscription can add the add-on package
-- (compensation center + Telegram bot + Tadqeeq AI). my_workspace_plan also returns the add-ons,
-- the order limit and the orders checked this month.
--
-- Additive and re-runnable; the previous app version keeps working. Apply to production before
-- deploying the code that reads the new columns. The five plans are inserted once (by code) and
-- never overwritten, so prices edited in the ops console are kept.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS order_limit integer,
  ADD COLUMN IF NOT EXISTS price_yearly numeric,
  ADD COLUMN IF NOT EXISTS custom_price boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_code_key
  ON public.subscription_plans (code) WHERE code IS NOT NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS addons jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO public.subscription_plans
  (code, name, pricing, price, price_yearly, cycle, active, features, upload_limit, order_limit, custom_price, description, sort_order, highlighted)
SELECT v.code, v.name, 'fixed', v.price, v.price_yearly, 'monthly', true, '["invoice_audit","exceptions","contracts"]'::jsonb, NULL, v.order_limit, v.custom_price, v.description, v.sort_order, v.highlighted
FROM (VALUES
  ('start',      'البداية',   299::numeric,  2990::numeric,  3000,  false, 'لمطعم أو مقهى بطلبات حتى 3,000 شهرياً',          10, false),
  ('growth',     'النمو',     599::numeric,  5990::numeric,  10000, false, 'لمطعم بعدة فروع حتى 10,000 طلب شهرياً',          20, false),
  ('scale',      'التوسع',    999::numeric,  9990::numeric,  30000, false, 'لمجموعة مطاعم حتى 30,000 طلب شهرياً',            30, true),
  ('groups',     'المجموعات', 1690::numeric, 16900::numeric, 75000, false, 'للمجموعات الكبيرة حتى 75,000 طلب شهرياً',         40, false),
  ('enterprise', 'المؤسسات',  0::numeric,    NULL::numeric,  NULL,  true,  'أكثر من 75,000 طلب شهرياً، بسعر وخدمة حسب الاتفاق', 50, false)
) AS v(code, name, price, price_yearly, order_limit, custom_price, description, sort_order, highlighted)
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans p WHERE p.code = v.code);

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
  v_orders numeric;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND status = 'active'
  ) AND NOT public.is_platform_admin() THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         coalesce(sum(CASE WHEN jsonb_typeof(summary -> 'orders') = 'number' THEN (summary ->> 'orders')::numeric ELSE 0 END), 0)
  INTO v_uploads, v_orders
  FROM public.periods
  WHERE workspace_id = p_workspace_id
    AND created_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh');

  SELECT p.id, p.name, p.features, p.upload_limit, p.order_limit, s.addons INTO v_sub
  FROM public.subscriptions s
  JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.workspace_id = p_workspace_id AND s.status IN ('active','trial','overdue')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN jsonb_build_object('plan_id', null, 'plan_name', null, 'features', null, 'upload_limit', null,
      'uploads_this_month', v_uploads, 'order_limit', null, 'orders_this_month', v_orders, 'addons', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('plan_id', v_sub.id, 'plan_name', v_sub.name, 'features', v_sub.features,
    'upload_limit', v_sub.upload_limit, 'uploads_this_month', v_uploads,
    'order_limit', v_sub.order_limit, 'orders_this_month', v_orders, 'addons', coalesce(v_sub.addons, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.my_workspace_plan(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_workspace_plan(uuid) TO authenticated;
