import { describe, expect, test } from "bun:test";

import type { ContractRuleRecord } from "./contract-rulebook";
import { evaluateJahezContractCompliance } from "./contract-compliance";
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
  grossSales: number;
  commissionInclVat: number;
}): StoredPeriod["branches"][number] {
  return {
    branch: input.name,
    branchId: input.name,
    orders: 10,
    grossSales: input.grossSales,
    netSales: input.grossSales - input.commissionInclVat,
    commission: input.commissionInclVat / 1.15,
    commissionPct:
      input.grossSales > 0 ? input.commissionInclVat / input.grossSales : 0,
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
    totalCharges: input.commissionInclVat / 1.15,
    jahezCommissionInclVat: input.commissionInclVat,
  };
}

function period(): StoredPeriod {
  return {
    id: "period-jahez-1",
    label: "Jahez September",
    platform: "jahez",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    created_at: "2026-09-30T00:00:00.000Z",
    engine_version: "1.1.0",
    format_ids: [],
    summary: {} as StoredPeriod["summary"],
    branches: [
      branch({ name: "Rakah", grossSales: 1150, commissionInclVat: 207 }),
      branch({ name: "Dammam", grossSales: 920, commissionInclVat: 174.8 }),
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

describe("Jahez contract compliance", () => {
  test("uses gross order amount and commission including VAT with branch override", () => {
    const result = evaluateJahezContractCompliance({
      period: period(),
      rules: [
        commissionRule("all", null, 18),
        commissionRule("branch", "Dammam", 19),
      ],
      version: VERSION,
    });

    expect(result.platform).toBe("jahez");
    expect(result.commission.rows).toHaveLength(2);
    expect(result.commission.totals.baseAmount).toBe(2070);
    expect(result.commission.totals.expectedAmount).toBe(381.8);
    expect(result.commission.totals.observedAmount).toBe(381.8);
    expect(result.commission.totals.varianceAmount).toBe(0);
    expect(result.commission.totals.complete).toBe(true);
  });

  test("reports a Jahez commission overcharge without changing the audit", () => {
    const p = period();
    p.branches[0]!.jahezCommissionInclVat = 218.5;

    const result = evaluateJahezContractCompliance({
      period: p,
      rules: [
        commissionRule("all", null, 18),
        commissionRule("branch", "Dammam", 19),
      ],
      version: VERSION,
    });

    expect(result.commission.rows[0]?.expectedAmount).toBe(207);
    expect(result.commission.rows[0]?.observedAmount).toBe(218.5);
    expect(result.commission.rows[0]?.varianceAmount).toBe(11.5);
    expect(result.commission.rows[0]?.status).toBe("overcharged");
    expect(result.commission.totals.overchargedAmount).toBe(11.5);
    expect(p.branches[0]!.jahezCommissionInclVat).toBe(218.5);
  });

  test("marks missing observed commission evidence as incomplete", () => {
    const p = period();
    p.branches[0]!.jahezCommissionInclVat = undefined;

    const result = evaluateJahezContractCompliance({
      period: p,
      rules: [
        commissionRule("all", null, 18),
        commissionRule("branch", "Dammam", 19),
      ],
      version: VERSION,
    });

    expect(result.commission.missingEvidenceBranches).toEqual(["Rakah"]);
    expect(result.commission.totals.complete).toBe(false);
    expect(result.commission.totals.varianceAmount).toBeNull();
  });

  test("does not interpret an amount rule as a commission percentage", () => {
    const result = evaluateJahezContractCompliance({
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
