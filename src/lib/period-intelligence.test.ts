import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "./periods";
import {
  buildPeriodComparison,
  findPreviousComparablePeriod,
} from "./period-intelligence";

function period(input: {
  id: string;
  platform?: "hungerstation" | "keeta" | "jahez";
  start: string;
  end: string;
  created?: string;
  orders: number;
  grossSales: number;
  netSales: number;
  commission: number;
  commissionPct: number;
  totalCharges: number;
  branches?: Array<{
    branch: string;
    branchId: string;
    orders: number;
    grossSales: number;
    netSales: number;
    commissionPct: number;
    totalCharges: number;
  }>;
}): StoredPeriod {
  return {
    id: input.id,
    label: input.id,
    platform: input.platform ?? "jahez",
    period_start: input.start,
    period_end: input.end,
    created_at: input.created ?? input.end + "T23:59:59Z",
    summary: {
      platform: input.platform ?? "jahez",
      orders: input.orders,
      grossSales: input.grossSales,
      netSales: input.netSales,
      commission: input.commission,
      commissionPct: input.commissionPct,
      totalCharges: input.totalCharges,
      branchCount: input.branches?.length ?? 0,
      statusCounts: {},
      periodStart: input.start,
      periodEnd: input.end,
      ccSuccess: 0,
      ccRejected: 0,
      walletAmount: 0,
      riderWallet: 0,
      rdfCampaigns: 0,
      compensation: 0,
      jokerFees: 0,
      hsFoodDiscount: 0,
      rewardsDiscount: 0,
      restaurantFoodDiscount: 0,
      totalFoodDiscount: 0,
      partialRefund: 0,
      fulfillmentMods: 0,
      approvedRefunds: 0,
      waitingTimeFees: 0,
      bankRate: 0,
      bankRateSource: "none",
      bankFeeSuccess: 0,
      bankFeeRefunded: 0,
      invoiceOnlyExtras: 0,
    },
    branches: (input.branches ?? []).map((branch) => ({
      ...branch,
      commission: branch.grossSales * branch.commissionPct,
      ccSuccess: 0,
      ccRejected: 0,
      walletAmount: 0,
      riderWallet: 0,
      rdfCampaigns: 0,
      freeDeliveryOrders: 0,
      compensation: 0,
      jokerFees: 0,
      hsFoodDiscount: 0,
      rewardsDiscount: 0,
      restaurantFoodDiscount: 0,
      totalFoodDiscount: 0,
      partialRefund: 0,
      fulfillmentMods: 0,
      approvedRefunds: 0,
      waitingTimeFees: 0,
      bankFeeSuccess: 0,
      bankFeeRefunded: 0,
    })),
    daily: [],
    invoice: { lines: [] },
  } as unknown as StoredPeriod;
}

describe("Period Intelligence V1", () => {
  test("selects the nearest earlier period from the same platform", () => {
    const current = period({
      id: "sep",
      start: "2026-09-01",
      end: "2026-09-30",
      orders: 100,
      grossSales: 1000,
      netSales: 800,
      commission: 180,
      commissionPct: 0.18,
      totalCharges: 240,
    });
    const august = period({
      id: "aug",
      start: "2026-08-01",
      end: "2026-08-31",
      orders: 90,
      grossSales: 900,
      netSales: 700,
      commission: 160,
      commissionPct: 0.1778,
      totalCharges: 220,
    });
    const july = period({
      id: "jul",
      start: "2026-07-01",
      end: "2026-07-31",
      orders: 80,
      grossSales: 800,
      netSales: 650,
      commission: 140,
      commissionPct: 0.175,
      totalCharges: 200,
    });
    const otherPlatform = period({
      id: "keeta-aug",
      platform: "keeta",
      start: "2026-08-01",
      end: "2026-08-31",
      orders: 200,
      grossSales: 2000,
      netSales: 1500,
      commission: 300,
      commissionPct: 0.15,
      totalCharges: 400,
    });

    expect(findPreviousComparablePeriod(current, [july, otherPlatform, august, current])?.id).toBe(
      "aug",
    );
  });

  test("separates relative changes from percentage-point changes", () => {
    const current = period({
      id: "sep",
      start: "2026-09-01",
      end: "2026-09-30",
      orders: 120,
      grossSales: 12000,
      netSales: 9000,
      commission: 2280,
      commissionPct: 0.19,
      totalCharges: 3000,
      branches: [
        {
          branch: "Branch A",
          branchId: "A",
          orders: 70,
          grossSales: 7000,
          netSales: 5200,
          commissionPct: 0.19,
          totalCharges: 1900,
        },
      ],
    });
    const previous = period({
      id: "aug",
      start: "2026-08-01",
      end: "2026-08-31",
      orders: 100,
      grossSales: 10000,
      netSales: 7600,
      commission: 1800,
      commissionPct: 0.18,
      totalCharges: 2400,
      branches: [
        {
          branch: "Branch A",
          branchId: "A",
          orders: 60,
          grossSales: 6000,
          netSales: 4500,
          commissionPct: 0.18,
          totalCharges: 1500,
        },
      ],
    });

    const comparison = buildPeriodComparison(current, previous);
    const commissionRate = comparison.metrics.find((item) => item.key === "commission_rate");
    const sales = comparison.metrics.find((item) => item.key === "gross_sales");

    expect(commissionRate?.percentagePointChange).toBeCloseTo(1, 8);
    expect(commissionRate?.relativeChange).toBeCloseTo(0.0555555556, 8);
    expect(sales?.delta).toBe(2000);
    expect(sales?.relativeChange).toBeCloseTo(0.2, 8);
    expect(comparison.branchMovements[0]?.platformCostDelta).toBe(400);
    expect(comparison.comparableDuration).toBe(false);
    expect(comparison.warnings.length).toBeGreaterThan(0);
  });

  test("rejects cross-platform comparisons", () => {
    const current = period({
      id: "sep",
      platform: "jahez",
      start: "2026-09-01",
      end: "2026-09-30",
      orders: 1,
      grossSales: 10,
      netSales: 8,
      commission: 2,
      commissionPct: 0.2,
      totalCharges: 2,
    });
    const previous = period({
      id: "aug",
      platform: "keeta",
      start: "2026-08-01",
      end: "2026-08-31",
      orders: 1,
      grossSales: 10,
      netSales: 8,
      commission: 2,
      commissionPct: 0.2,
      totalCharges: 2,
    });

    expect(() => buildPeriodComparison(current, previous)).toThrow(
      "لا يمكن مقارنة فترتين من منصتين مختلفتين.",
    );
  });
});
