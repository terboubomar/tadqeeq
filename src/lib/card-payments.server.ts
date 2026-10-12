import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { cardPrice, mapProviderStatus, planForPriceId, resolvePlanChange, type CardCycle } from "./card-plans";
import { log, syncAccessWithSubscription, type OpsActor } from "./ops.server";
import { getPaddleClient, resolvePriceId, type PaddleEnv } from "./paddle.server";
import { requireServerUserAnyStatus } from "./server-auth.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped admin client, same as the other server modules
const db = () => supabaseAdmin as any;
type Row = Record<string, unknown>;

/** Changes made by card payments are logged in ops under this name. */
const SYSTEM_ACTOR = { userId: null, email: "card-payments", role: "owner", mfa: "ok" } as unknown as OpsActor;

async function planByCode(code: string) {
  const { data } = await db().from("subscription_plans").select("id,price,price_yearly").eq("code", code).maybeSingle();
  return data as Row | null;
}

async function requireBillingManager() {
  const ctx = await requireServerUserAnyStatus();
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("مالك الحساب أو المدير فقط يستطيع الدفع وتغيير الباقة.");
  return ctx;
}

async function currentCardSubscription(workspaceId: string, env: PaddleEnv) {
  const { data } = await db()
    .from("subscriptions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("environment", env)
    .not("provider_subscription_id", "is", null)
    .in("status", ["active", "overdue", "trial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Row | null;
}

export async function prepareCardCheckoutOnServer(input: { planCode: string; cycle: CardCycle; env: PaddleEnv }) {
  const ctx = await requireBillingManager();
  const price = cardPrice(input.planCode, input.cycle);
  if (!price) throw new Error("هذه الباقة لا تُدفع بالبطاقة.");
  if (await currentCardSubscription(ctx.workspaceId, input.env)) throw new Error("لديك اشتراك بالبطاقة. غيّر الباقة من صفحة باقتك.");
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(ctx.actorUserId);
  return { paddlePriceId: await resolvePriceId(input.env, price.priceId), workspaceId: ctx.workspaceId, userId: ctx.actorUserId, email: user?.user?.email ?? null };
}

export async function getMyCardSubscriptionOnServer(env: PaddleEnv) {
  const ctx = await requireServerUserAnyStatus();
  const sub = await currentCardSubscription(ctx.workspaceId, env);
  if (!sub) return null;
  return {
    priceId: (sub["provider_price_id"] as string) ?? null,
    pendingPriceId: (sub["pending_price_id"] as string) ?? null,
    currentPeriodEnd: (sub["current_period_end"] as string) ?? null,
    cancelAtPeriodEnd: sub["cancel_at_period_end"] === true,
    status: String(sub["status"]),
  };
}

/** Switches plan from the next billing date: no charge now, the new price is billed at renewal. */
export async function changeCardPlanOnServer(input: { planCode: string; cycle: CardCycle; env: PaddleEnv }) {
  const ctx = await requireBillingManager();
  const price = cardPrice(input.planCode, input.cycle);
  if (!price) throw new Error("هذه الباقة لا تُدفع بالبطاقة.");
  const sub = await currentCardSubscription(ctx.workspaceId, input.env);
  if (!sub) throw new Error("لا يوجد اشتراك بالبطاقة.");
  if (sub["provider_price_id"] === price.priceId) throw new Error("هذه باقتك الحالية.");
  const paddlePriceId = await resolvePriceId(input.env, price.priceId);
  await getPaddleClient(input.env).subscriptions.update(String(sub["provider_subscription_id"]), {
    items: [{ priceId: paddlePriceId, quantity: 1 }],
    prorationBillingMode: "do_not_bill",
  });
  await db().from("subscriptions").update({ pending_price_id: price.priceId, updated_at: new Date().toISOString() }).eq("id", sub["id"]);
}

export async function getCardPortalUrlOnServer(env: PaddleEnv) {
  const ctx = await requireBillingManager();
  const sub = await currentCardSubscription(ctx.workspaceId, env);
  if (!sub?.["provider_customer_id"]) throw new Error("لا يوجد اشتراك بالبطاقة.");
  const session = await getPaddleClient(env).customerPortalSessions.create(String(sub["provider_customer_id"]), [String(sub["provider_subscription_id"])]);
  return session.urls.general.overview;
}

// ---------------- Webhook ----------------

interface ProviderSubscription {
  id: string;
  customerId: string;
  status: string;
  items: Array<{ price: { importMeta?: { externalId?: string } | null } }>;
  currentBillingPeriod?: { startsAt: string; endsAt: string } | null;
  scheduledChange?: { action: string } | null;
  customData?: Record<string, unknown> | null;
}

export async function syncProviderSubscription(data: ProviderSubscription, env: PaddleEnv) {
  const incomingPriceId = data.items[0]?.price.importMeta?.externalId;
  if (!incomingPriceId) {
    console.warn("card subscription skipped: missing importMeta.externalId", { id: data.id });
    return;
  }
  const { data: existing } = await db().from("subscriptions").select("*").eq("provider_subscription_id", data.id).maybeSingle();
  const workspaceId = (existing?.["workspace_id"] as string | undefined) ?? (typeof data.customData?.["workspaceId"] === "string" ? (data.customData["workspaceId"] as string) : null);
  if (!workspaceId) {
    console.error("card subscription skipped: no workspaceId", { id: data.id });
    return;
  }
  const { priceId, pendingPriceId } = resolvePlanChange({
    storedPriceId: (existing?.["provider_price_id"] as string) ?? null,
    storedPeriodStart: (existing?.["current_period_start"] as string) ?? null,
    incomingPriceId,
    incomingPeriodStart: data.currentBillingPeriod?.startsAt ?? null,
  });
  const plan = planForPriceId(priceId);
  const planRow = plan ? await planByCode(plan.code) : null;
  const status = mapProviderStatus(data.status);
  const usd = plan ? cardPrice(plan.code, plan.cycle)?.usd ?? 0 : 0;
  const sar = planRow ? Number(plan?.cycle === "yearly" && planRow["price_yearly"] != null ? planRow["price_yearly"] : planRow["price"]) : 0;
  const now = new Date().toISOString();
  const row = {
    workspace_id: workspaceId,
    plan_id: planRow ? String(planRow["id"]) : null,
    price: sar,
    cycle: plan?.cycle ?? "monthly",
    status,
    starts_on: (existing?.["starts_on"] as string) ?? now.slice(0, 10),
    ends_on: data.currentBillingPeriod?.endsAt?.slice(0, 10) ?? null,
    notes: `دفع بالبطاقة ($${usd})`,
    provider_subscription_id: data.id,
    provider_customer_id: data.customerId,
    provider_price_id: priceId,
    pending_price_id: pendingPriceId,
    environment: env,
    current_period_start: data.currentBillingPeriod?.startsAt ?? null,
    current_period_end: data.currentBillingPeriod?.endsAt ?? null,
    cancel_at_period_end: data.scheduledChange?.action === "cancel",
    updated_at: now,
  };
  const { data: saved, error } = existing
    ? await db().from("subscriptions").update(row).eq("id", existing["id"]).select("id").single()
    : await db().from("subscriptions").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  await syncAccessWithSubscription(SYSTEM_ACTOR, workspaceId, String(saved.id), status);
  const changed = !existing || existing["status"] !== status || existing["provider_price_id"] !== priceId;
  if (changed) {
    await log(SYSTEM_ACTOR, existing ? "subscription.update" : "subscription.create", "subscription", String(saved.id), workspaceId, {
      status,
      price: sar,
      cycle: row.cycle,
      source: "card",
      environment: env,
    });
  }
}
