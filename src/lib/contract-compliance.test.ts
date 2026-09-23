import { describe, expect, test } from "bun:test";

import type { ContractRuleRecord } from "./contract-rulebook";
import { evaluateHungerStationCommissionCompliance } from "./contract-compliance";
import type { StoredPeriod } from "./periods";

function rule(scopeType: "all" | "branch", scopeKey: string | null, rate: number): ContractRuleRecord {
  return {
    id: scopeKey ?? "all",
    contractId: "contract-1",
    versionId: "version-1",
    ruleKey: "commission_rate",
    ruleType: "commission_rate",
    valueKind: "percentage",
    numericValue: rate,
    textValue: null,
    currency: null,
    fundingSource: null,
    scopeType,
    scopeKey,
    notes: null,
    createdAt: "2026-09-23T00:00:00.000Z",
  };
}

function period(): StoredPeriod {
  return {
    id: "period-1",
    label: "HS September",
    platform: "hungerstation",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    created_at: "2026-09-30T00:00:00.000Z",
    engine_version: "1.1.0",
    format_ids: [],
    summary: {} as StoredPeriod["summary"],
    branches: [
      {
        branch: "Rakah",
        branchId: "1",
        orders: 10,
        grossSales: 1150,
        netSales: 1000,
        commission: 180,
        commissionPct: 0.18,
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
        totalCharges: 180,
      },
      {
        branch: "Dammam",
        branchId: "2",
        orders: 8,
        grossSales: 920,
        netSales: 800,
        commission: 152,
        commissionPct: 0.19,
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
        totalCharges: 152,
      },
    ],
    daily: [],
    invoice: { lines: [] },
  };
}

describe("HungerStation contract compliance", () => {
  test("uses branch overrides before the all-branch commission rate", () => {
    const result = evaluateHungerStationCommissionCompliance({
      period: period(),
      rules: [rule("all", null, 18), rule("branch", "Dammam", 19)],
      version: {
        id: "version-1",
        versionNumber: 1,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.status === "matched")).toBe(true);
    expect(result.totals.varianceAmount).toBe(0);
  });

  test("reports overcharge amount without changing the stored audit", () => {
    const p = period();
    p.branches[0]!.commission = 190;

    const result = evaluateHungerStationCommissionCompliance({
      period: p,
      rules: [rule("all", null, 18)],
      version: {
        id: "version-1",
        versionNumber: 1,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    });

    expect(result.rows[0]?.expectedAmount).toBe(180);
    expect(result.rows[0]?.observedAmount).toBe(190);
    expect(result.rows[0]?.varianceAmount).toBe(10);
    expect(result.rows[0]?.status).toBe("overcharged");
    expect(p.branches[0]!.commission).toBe(190);
  });

  test("fails visibly for branches without an applicable canonical commission rule", () => {
    const result = evaluateHungerStationCommissionCompliance({
      period: period(),
      rules: [rule("branch", "Rakah", 18)],
      version: {
        id: "version-1",
        versionNumber: 1,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    });

    expect(result.missingRuleBranches).toEqual(["Dammam"]);
    expect(result.rows).toHaveLength(1);
  });
});
