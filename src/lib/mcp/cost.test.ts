import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "@/lib/periods";
import { platformCostMap } from "@/lib/platform-cost-map";
import { periodPlatformCharges } from "@/lib/reporting-metrics";

import { comparisonReadout, costMapReadout } from "./cost";

const base = { engine_version: "x", format_ids: [], daily: [], branches: [] };

/** HungerStation with a CPC invoice (same shape as platform-cost-map.test.ts). */
function hungerStation(id: string, start: string, end: string, scale = 1): StoredPeriod {
  return {
    ...base,
    id,
    label: id,
    created_at: end + "T23:00:00Z",
    platform: "hungerstation",
    period_start: start,
    period_end: end,
    summary: {
      orders: 12295 * scale,
      grossSales: 650000 * scale,
      netSales: 577556.64 * scale,
      commission: 94780.1 * scale,
      commissionPct: 0.1641,
      bankFeeSuccess: 14445.36 * scale,
      rdfCampaigns: 91534.78 * scale,
      compensation: 3701.75 * scale,
      jokerFees: 1265.06 * scale,
      waitingTimeFees: 0,
      invoiceOnlyExtras: 1132.17 * scale,
      totalCharges: 206859.22 * scale,
    },
    invoice: {
      cpc: 19875.3 * scale,
      cpcBranches: [
        { branch: "A", amountExVat: 9000 * scale, vat: 1350 * scale },
        { branch: "B", amountExVat: 8282.87 * scale, vat: 1242.43 * scale },
      ],
      restaurantFoodDiscount: 0,
    },
  } as unknown as StoredPeriod;
}

const october = hungerStation("oct", "2026-10-01", "2026-10-31");
const september = hungerStation("sep", "2026-09-01", "2026-09-30", 0.9);

describe("MCP platform cost", () => {
  test("the total is the dashboard's platform cost, advertising included without VAT", () => {
    const readout = costMapReadout(october, null);
    const expected = Math.round(periodPlatformCharges(october)! * 100) / 100;
    expect(readout.platform_cost_sar).toBe(expected);
    expect(readout.platform_cost_sar).toBe(Math.round(platformCostMap(october).total * 100) / 100);
    expect(readout.previous).toBeNull();
  });

  test("cost by type adds up to the lines, and the change vs the previous period is shown", () => {
    const readout = costMapReadout(october, september);
    const byType = readout.by_type.reduce((sum, row) => sum + (row.amount_sar ?? 0), 0);
    const lines = readout.lines.reduce((sum, row) => sum + (row.amount_sar ?? 0), 0);
    expect(Math.abs(byType - lines)).toBeLessThan(0.05);
    const before = Math.round(platformCostMap(september).total * 100) / 100;
    expect(readout.previous?.platform_cost_sar).toBe(before);
    expect(readout.previous?.change_sar).toBeCloseTo((readout.platform_cost_sar ?? 0) - before, 1);
  });
});

describe("MCP period comparison", () => {
  test("uses the period panel's figures, platform cost from the shared definition", () => {
    const readout = comparisonReadout(october, september);
    const cost = readout.metrics.find((m) => m.key === "platform_cost");
    expect(cost?.current).toBe(Math.round(periodPlatformCharges(october)! * 100) / 100);
    expect(cost?.previous).toBe(Math.round(periodPlatformCharges(september)! * 100) / 100);
    expect(readout.current.id).toBe("oct");
    expect(readout.previous.id).toBe("sep");
  });

  test("refuses two different platforms", () => {
    const keeta = { ...september, platform: "keeta" } as StoredPeriod;
    expect(() => comparisonReadout(october, keeta)).toThrow();
  });
});
