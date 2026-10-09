import { describe, expect, test } from "bun:test";

import {
  operationBranchWatchlist,
  operationCostPerOrder,
  operationDataHealth,
  operationOverviewTotals,
  operationSalesShares,
} from "./overview";
import type { OperationBranchSummary, OperationPlatform, OperationPlatformMonth } from "./types";

const branch = (key: string, orderCount: number, grossSales: number, chargesTotal: number): OperationBranchSummary => ({
  key,
  branchId: key,
  branchName: "Branch " + key,
  orderCount,
  grossSales,
  chargesTotal,
  commissionAmount: 0,
  settlementAmount: 0,
  cancellationCount: 0,
  complaintCount: 0,
  refundCount: 0,
});

function month(platform: OperationPlatform, patch: Partial<OperationPlatformMonth>): OperationPlatformMonth {
  return {
    platform,
    coveredDays: 0,
    orderCount: 0,
    grossSales: 0,
    deliveryAmount: 0,
    complaintCount: 0,
    refundCount: 0,
    refundAmount: 0,
    discountAmount: 0,
    merchantFundedDiscountAmount: 0,
    merchantFundedVoucherAmount: 0,
    commissionAmount: 0,
    paymentFeeAmount: 0,
    estimatedEarningsAmount: 0,
    cancellationCount: 0,
    cancelledEarningsAmount: 0,
    chargesToDate: 0,
    settlementToDate: 0,
    forecastCharges: null,
    forecastSettlement: null,
    forecastMissingDays: [],
    days: [],
    branches: [],
    branchesComplete: true,
    ...patch,
  };
}

describe("operations overview", () => {
  test("adds payouts across platforms and forecasts only when every platform with files can be forecast", () => {
    const hs = month("hungerstation", { coveredDays: 5, grossSales: 700, chargesToDate: 200, orderCount: 50, settlementToDate: 500, forecastSettlement: 3100 });
    const keeta = month("keeta", { coveredDays: 5, grossSales: 300, chargesToDate: 90, orderCount: 30, settlementToDate: 210, forecastSettlement: 1302 });
    const jahez = month("jahez", {});
    expect(operationOverviewTotals([hs, keeta, jahez])).toEqual({
      grossSales: 1000,
      charges: 290,
      orderCount: 80,
      settlement: 710,
      forecastSettlement: 4402,
    });
    const gap = { ...keeta, forecastSettlement: null, forecastMissingDays: [3] };
    expect(operationOverviewTotals([hs, gap, jahez]).forecastSettlement).toBeNull();
    expect(operationOverviewTotals([jahez]).forecastSettlement).toBeNull();
  });

  test("shares of sales are largest first and skip platforms without sales", () => {
    const shares = operationSalesShares([
      month("hungerstation", { grossSales: 250 }),
      month("keeta", { grossSales: 750 }),
      month("jahez", {}),
    ]);
    expect(shares.map((row) => [row.platform, row.share])).toEqual([["keeta", 0.75], ["hungerstation", 0.25]]);
    expect(operationSalesShares([month("jahez", {})])).toEqual([]);
  });

  test("cost per order", () => {
    expect(operationCostPerOrder(-300, 100)).toBe(3);
    expect(operationCostPerOrder(300, 0)).toBeNull();
  });

  test("the branch watchlist ranks by cost share across platforms and ignores small branches", () => {
    const list = operationBranchWatchlist([
      month("hungerstation", { branches: [branch("1", 100, 1000, 300), branch("2", 10, 100, 90)] }),
      month("keeta", { branches: [branch("9", 40, 500, 175), branch("8", 200, 2000, 400)] }),
    ]);
    expect(list.map((row) => [row.platform, row.key, row.costRatio])).toEqual([
      ["keeta", "9", 0.35],
      ["hungerstation", "1", 0.3],
      ["keeta", "8", 0.2],
    ]);
  });

  test("data health lists gaps and incomplete files of platforms with files only", () => {
    const day = (date: string, incomplete: boolean) => ({ date, incomplete, unsettledOrderCount: 0, orderCount: 1, grossSales: 1, chargesTotal: 0, settlementAmount: 1 });
    expect(
      operationDataHealth([
        month("hungerstation", { coveredDays: 2, forecastMissingDays: [6], days: [day("2026-10-05", false), day("2026-10-07", true)] }),
        month("keeta", { coveredDays: 1, days: [day("2026-10-01", false)] }),
        month("jahez", {}),
      ]),
    ).toEqual([{ platform: "hungerstation", missingDays: [6], incompleteDays: ["2026-10-07"] }]);
  });
});
