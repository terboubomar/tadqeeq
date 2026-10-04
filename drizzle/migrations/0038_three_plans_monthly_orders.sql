-- Three plans, and orders counted per month of data.
--
-- Plans: البداية up to 15,000 orders (299 / 2,990), النمو up to 45,000 (499 / 4,990) and الشاملة with
-- unlimited orders and the compensation center + Tadqeeq AI included (799 / 7,990). The other plans
-- from 0037 (التوسع, المجموعات, المؤسسات) are hidden, not deleted, so existing subscriptions keep them.
--
-- my_workspace_plan now counts a company's monthly orders from the latest month its uploaded data
-- covers (all platforms added together), and ignores periods replaced by a re-upload or re-analysis.
-- It returns monthly_orders and orders_month; orders_this_month stays as the same number for the
-- app version deployed before this one.
--
-- Re-runnable. Apply to production before deploying the code that reads the new fields.

UPDATE public.subscription_plans
SET name = 'البداية', price = 299, price_yearly = 2990, order_limit = 15000, custom_price = false,
    description = 'لمطعم أو مجموعة صغيرة حتى 15,000 طلب شهرياً', sort_order = 10, highlighted = false, active = true
WHERE code = 'start';

UPDATE public.subscription_plans
SET name = 'النمو', price = 499, price_yearly = 4990, order_limit = 45000, custom_price = false,
    description = 'لمطاعم بعدة فروع حتى 45,000 طلب شهرياً', sort_order = 20, highlighted = false, active = true
WHERE code = 'growth';

UPDATE public.subscription_plans SET active = false, highlighted = false WHERE code IN ('scale', 'groups', 'enterprise');

INSERT INTO public.subscription_plans
  (code, name, pricing, price, price_yearly, cycle, active, features, upload_limit, order_limit, custom_price, description, sort_order, highlighted)
SELECT 'unlimited', 'الشاملة', 'fixed', 799, 7990, 'monthly', true,
       '["invoice_audit","exceptions","contracts","compensation","ai"]'::jsonb, NULL, NULL, false,
       'طلبات بلا حدود، ومعها Tadqeeq AI ومركز التعويضات مع بوت Telegram', 30, true
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE code = 'unlimited');

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
  v_month date;
  v_orders numeric;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND status = 'active'
  ) AND NOT public.is_platform_admin() THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_uploads
  FROM public.periods
  WHERE workspace_id = p_workspace_id
    AND created_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh');

  -- The month each current period's data belongs to (its start; the upload date when it has none).
  WITH current_periods AS (
    SELECT date_trunc('month', coalesce(period_start, (created_at AT TIME ZONE 'Asia/Riyadh')::date))::date AS month,
           CASE WHEN jsonb_typeof(summary -> 'orders') = 'number' THEN (summary ->> 'orders')::numeric ELSE 0 END AS orders
    FROM public.periods
    WHERE workspace_id = p_workspace_id AND superseded_at IS NULL
  )
  SELECT month, sum(orders) INTO v_month, v_orders
  FROM current_periods
  WHERE month = (SELECT max(month) FROM current_periods)
  GROUP BY month;
  v_orders := coalesce(v_orders, 0);

  SELECT p.id, p.name, p.features, p.upload_limit, p.order_limit, s.addons INTO v_sub
  FROM public.subscriptions s
  JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.workspace_id = p_workspace_id AND s.status IN ('active','trial','overdue')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_sub.id IS NULL THEN
    RETURN jsonb_build_object('plan_id', null, 'plan_name', null, 'features', null, 'upload_limit', null,
      'uploads_this_month', v_uploads, 'order_limit', null, 'monthly_orders', v_orders, 'orders_month', v_month,
      'orders_this_month', v_orders, 'addons', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('plan_id', v_sub.id, 'plan_name', v_sub.name, 'features', v_sub.features,
    'upload_limit', v_sub.upload_limit, 'uploads_this_month', v_uploads,
    'order_limit', v_sub.order_limit, 'monthly_orders', v_orders, 'orders_month', v_month,
    'orders_this_month', v_orders, 'addons', coalesce(v_sub.addons, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.my_workspace_plan(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_workspace_plan(uuid) TO authenticated;
