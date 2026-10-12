/**
 * Plans that can be paid online by card. Prices are charged in US dollars (round amounts);
 * the site keeps showing the riyal prices from subscription_plans.
 */
export type CardCycle = "monthly" | "yearly";

export const CARD_PRICES: Record<string, Record<CardCycle, { priceId: string; usd: number }>> = {
  start: { monthly: { priceId: "start_monthly", usd: 79 }, yearly: { priceId: "start_yearly", usd: 797 } },
  growth: { monthly: { priceId: "growth_monthly", usd: 133 }, yearly: { priceId: "growth_yearly", usd: 1330 } },
  unlimited: { monthly: { priceId: "unlimited_monthly", usd: 213 }, yearly: { priceId: "unlimited_yearly", usd: 2130 } },
};

export function cardPrice(planCode: string | null, cycle: CardCycle) {
  return planCode ? CARD_PRICES[planCode]?.[cycle] ?? null : null;
}

/** Which plan code and cycle a provider price id belongs to. */
export function planForPriceId(priceId: string): { code: string; cycle: CardCycle } | null {
  for (const [code, cycles] of Object.entries(CARD_PRICES)) {
    for (const cycle of ["monthly", "yearly"] as const) if (cycles[cycle].priceId === priceId) return { code, cycle };
  }
  return null;
}

/** Provider subscription status → Tadqeeq subscription status. */
export function mapProviderStatus(status: string): "active" | "overdue" | "cancelled" | "suspended" | "trial" {
  if (status === "active") return "active";
  if (status === "trialing") return "trial";
  if (status === "past_due") return "overdue";
  if (status === "paused") return "suspended";
  return "cancelled";
}

/**
 * A plan change takes effect at the next billing date: while the billing period is the same one,
 * the new price waits as pending; once a new period starts, it becomes the plan.
 */
export function resolvePlanChange(input: { storedPriceId: string | null; storedPeriodStart: string | null; incomingPriceId: string; incomingPeriodStart: string | null }):
  { priceId: string; pendingPriceId: string | null } {
  const { storedPriceId, storedPeriodStart, incomingPriceId, incomingPeriodStart } = input;
  if (!storedPriceId || storedPriceId === incomingPriceId) return { priceId: incomingPriceId, pendingPriceId: null };
  const samePeriod = !!storedPeriodStart && !!incomingPeriodStart && new Date(storedPeriodStart).getTime() === new Date(incomingPeriodStart).getTime();
  return samePeriod ? { priceId: storedPriceId, pendingPriceId: incomingPriceId } : { priceId: incomingPriceId, pendingPriceId: null };
}
