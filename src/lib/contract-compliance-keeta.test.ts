import { describe, expect, test } from "bun:test";

import type { ContractRuleRecord } from "./contract-rulebook";
import { evaluateKeetaContractCompliance } from "./contract-compliance";
import type { StoredPeriod } from "./periods";

function commissionRule(
  scopeType: "all" | "branch",
  scopeKey: string | null,
  rate: number,
  valueKind: "percentage" | "amount" = "percentage",
): ContractRuleRecord {
  return {
    id: scopeKey ?? "all",
    contractId: "contract-1",
    versionId: "version-1",
    ruleKey: "commission_rate",
    ruleType: "commission_rate",
    valueKind,
    numericValue: rate,
    textValue: null,
    currency: valueKind === "amount" ? "SAR" : null,
    fundingSource: null,
    scopeType,
    scopeKey,
    notes: null,
    createdAt: "2026-09-23T00:00:00.000Z",
  };
}

function branch(input: {
  name: string;
  id: string;
  salesExVat: number;
  commissionExVat: number;
}): StoredPeriod["branches"][number] {
  return {
    branch: input.name,
    branchId: input.id,
    orders: 10,
    grossSales: input.salesExVat * 1.15,
    netSales: input.salesExVat,
    commission: input.commissionExVat,
    commissionPct:
      input.salesExVat > 0 ? input.commissionExVat / input.salesExVat : 0,
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
    totalCharges: input.commissionExVat,
    keetaSalesExVat: input.salesExVat,
    keetaCommissionExVat: input.commissionExVat,
  };
}

function period(): StoredPeriod {
  return {
    id: "period-keeta-1",
    label: "Keeta September",
    platform: "keeta",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    created_at: "2026-09-30T00:00:00.000Z",
    engine_version: "1.1.0",
    format_ids: [],
    summary: {} as StoredPeriod["summary"],
    branches: [
      branch({
        name: "Rakah",
        id: "101",
        salesExVat: 1000,
        commissionExVat: 180,
      }),
      branch({
        name: "Dammam",
        id: "102",
        salesExVat: 800,
        commissionExVat: 152,
      }),
    ],
    daily: [],
    invoice: { lines: [] },
  };
}

const VERSION = {
  id: "version-1",
  versionNumber: 1,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

describe("Keeta contract compliance", () => {
  test("compares Order Summary commission with approved rate and branch override", () => {
    const result = evaluateKeetaContractCompliance({
      period: period(),
      rules: [
        commissionRule("all", null, 18),
        commissionRule("branch", "Dammam", 19),
      ],
      version: VERSION,
    });

    expect(result.platform).toBe("keeta");
    expect(result.commission.rows).toHaveLength(2);
    expect(result.commission.totals.baseAmount).toBe(1800);
    expect(result.commission.totals.expectedAmount).toBe(332);
    expect(result.commission.totals.observedAmount).toBe(332);
    expect(result.commission.totals.varianceAmount).toBe(0);
    expect(result.commission.totals.complete).toBe(true);
  });

  test("reports a Keeta commission overcharge without mutating the stored audit", () => {
    const p = period();
    p.branches[0]!.keetaCommissionExVat = 190;

    const result = evaluateKeetaContractCompliance({
      period: p,
      rules: [
        commissionRule("all", null, 18),
        commissionRule("branch", "Dammam", 19),
      ],
      version: VERSION,
    });

    expect(result.commission.rows[0]?.expectedAmount).toBe(180);
    expect(result.commission.rows[0]?.observedAmount).toBe(190);
    expect(result.commission.rows[0]?.varianceAmount).toBe(10);
    expect(result.commission.rows[0]?.status).toBe("overcharged");
    expect(result.commission.totals.overchargedAmount).toBe(10);
    expect(p.branches[0]!.keetaCommissionExVat).toBe(190);
  });

  test("fails visibly when a Keeta branch has no applicable commission rule", () => {
    const result = evaluateKeetaContractCompliance({
      period: period(),
      rules: [commissionRule("branch", "Rakah", 18)],
      version: VERSION,
    });

    expect(result.commission.missingRuleBranches).toEqual(["Dammam"]);
    expect(result.commission.totals.complete).toBe(false);
    expect(result.commission.totals.varianceAmount).toBeNull();
  });

  test("does not interpret an amount rule as a commission percentage", () => {
    const result = evaluateKeetaContractCompliance({
      period: period(),
      rules: [commissionRule("all", null, 18, "amount")],
      version: VERSION,
    });

    expect(result.commission.unsupportedRuleBranches).toEqual([
      "Rakah",
      "Dammam",
    ]);
    expect(result.commission.totals.complete).toBe(false);
  });
});
