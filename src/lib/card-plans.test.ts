import { describe, expect, test } from "bun:test";

import { cardPrice, mapProviderStatus, planForPriceId, resolvePlanChange } from "./card-plans";

describe("card plans", () => {
  test("round dollar prices", () => {
    expect(cardPrice("start", "monthly")?.usd).toBe(79);
    expect(cardPrice("growth", "monthly")?.usd).toBe(133);
    expect(cardPrice("unlimited", "yearly")?.usd).toBe(2130);
  });
  test("price id maps back to plan and cycle", () => {
    expect(planForPriceId("growth_yearly")).toEqual({ code: "growth", cycle: "yearly" });
  });
  test("a cancelled subscription keeps access until the provider ends it", () => {
    expect(mapProviderStatus("active")).toBe("active");
    expect(mapProviderStatus("canceled")).toBe("cancelled");
  });
  test("plan change waits for the next billing date", () => {
    const start = "2026-10-01T00:00:00Z";
    expect(resolvePlanChange({ storedPriceId: "start_monthly", storedPeriodStart: start, incomingPriceId: "growth_monthly", incomingPeriodStart: start }))
      .toEqual({ priceId: "start_monthly", pendingPriceId: "growth_monthly" });
    expect(resolvePlanChange({ storedPriceId: "start_monthly", storedPeriodStart: start, incomingPriceId: "growth_monthly", incomingPeriodStart: "2026-11-01T00:00:00Z" }))
      .toEqual({ priceId: "growth_monthly", pendingPriceId: null });
  });
});
