import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "./periods";
import { platformCostMap, previousPeriod } from "./platform-cost-map";
import { periodPlatformCharges } from "./reporting-metrics";

const base = { created_at: "2026-11-01", engine_version: "x", format_ids: [], daily: [], branches: [] };

/** HungerStation with a CPC invoice: كاشِف's total must be the dashboard's, ads included without VAT. */
function hungerStation(): StoredPeriod {
  return {
    ...base,
    id: "hs",
    label: "Mashkuk Oct",
    platform: "hungerstation",
    period_start: "2026-10-01",
    period_end: "2026-10-31",
    summary: { orders: 12295, netSales: 577556.64, commission: 94780.1, bankFeeSuccess: 14445.36, rdfCampaigns: 91534.78, compensation: 3701.75, jokerFees: 1265.06, waitingTimeFees: 0, invoiceOnlyExtras: 1132.17, totalCharges: 206859.22 },
    invoice: {
      cpc: 19875.3,
      cpcBranches: [
        { branch: "A", amountExVat: 9000, vat: 1350 },
        { branch: "B", amountExVat: 8282.87, vat: 1242.43 },
      ],
      restaurantFoodDiscount: 0,
    },
  } as unknown as StoredPeriod;
}

/** Past Keeta October: 662,463.99 deducted, of which 10,294.44 is the item subsidy the restaurant funds. */
function keeta(): StoredPeriod {
  return {
    ...base,
    id: "kt",
    label: "Past Keeta Oct",
    platform: "keeta",
    period_start: "2026-10-01",
    period_end: "2026-10-31",
    summary: {
      orders: 28483,
      commission: 271112.48,
      totalCharges: 662463.99,
      keetaTotalCostExVat: 662463.99,
      keetaSalesExVat: 1685854.56,
      keetaCommissionExVat: 271112.48,
      keetaBankFeesExVat: 46853.37,
      keetaDeliveryCampaignExVat: 296111.3,
      keetaMerchantAdExVat: 37657.62,
      keetaProductCampaignExVat: 10294.44,
      keetaPosFeesExVat: 434.78,
      keetaCompensationExVat: 0,
      keetaOtherExpensesExVat: 434.78,
    },
    invoice: {},
  } as unknown as StoredPeriod;
}

describe("كاشِف uses the shared platform cost", () => {
  test("HungerStation: the CPC invoice is inside the total, without VAT, as an advertising line", () => {
    const period = hungerStation();
    const cost = platformCostMap(period);
    expect(cost.total).toBeCloseTo(periodPlatformCharges(period)!, 2);
    expect(cost.total).toBeCloseTo(206859.22 + 17282.87, 2);
    const ads = cost.lines.find((line) => line.id === "hs-cpc")!;
    expect(ads.amount).toBeCloseTo(17282.87, 2);
    expect(ads.category).toBe("advertising");
    expect(cost.residual).toBe(0);
    expect(cost.other.map((line) => line.id)).not.toContain("hs-cpc");
  });

  test("Keeta: the item subsidy is set apart, not in the total; the lines still close", () => {
    const period = keeta();
    const cost = platformCostMap(period);
    expect(cost.total).toBeCloseTo(652169.55, 2);
    expect(cost.lines.map((line) => line.id)).not.toContain("keeta-product-campaign");
    expect(cost.merchantFunded.map((line) => line.id)).toEqual(["keeta-product-campaign"]);
    expect(cost.merchantFunded[0]!.amount).toBeCloseTo(10294.44, 2);
    expect(cost.residual).toBe(0);
    expect(cost.costPct).toBeCloseTo(652169.55 / 1685854.56, 6);
    expect(cost.costPerOrder).toBeCloseTo(652169.55 / 28483, 6);
  });

  test("lines are largest first", () => {
    const amounts = platformCostMap(keeta()).lines.map((line) => Math.abs(line.amount));
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });

  test("the previous period is the same platform's latest one before this, superseded ones skipped", () => {
    const current = keeta();
    const september = { ...keeta(), id: "sep", period_end: "2026-09-30" };
    const august = { ...keeta(), id: "aug", period_end: "2026-08-31" };
    const replaced = { ...keeta(), id: "old-sep", period_end: "2026-09-30", superseded_by: "sep" };
    const otherPlatform = { ...hungerStation(), id: "hs-sep", period_end: "2026-09-30" };
    expect(previousPeriod(current, [august, replaced, september, otherPlatform, current])?.id).toBe("sep");
    expect(previousPeriod(august, [august, september, current])).toBeNull();
  });
});
