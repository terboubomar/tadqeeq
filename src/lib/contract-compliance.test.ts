import { describe, expect, test } from "bun:test";

import type {
  ContractRuleRecord,
  ContractRuleType,
} from "./contract-rulebook";
import { evaluateHungerStationContractCompliance } from "./contract-compliance";
import type { StoredPeriod } from "./periods";

function rule(input: {
  id?: string;
  ruleType: ContractRuleType;
  ruleKey?: string;
  scopeType?: "all" | "branch";
  scopeKey?: string | null;
  rate: number;
  valueKind?: "percentage" | "amount";
}): ContractRuleRecord {
  return {
    id: input.id ?? `${input.ruleType}-${input.scopeKey ?? "all"}`,
    contractId: "contract-1",
    versionId: "version-1",
    ruleKey: input.ruleKey ?? input.ruleType,
    ruleType: input.ruleType,
    valueKind: input.valueKind ?? "percentage",
    numericValue: input.rate,
    textValue: null,
    currency: input.valueKind === "amount" ? "SAR" : null,
    fundingSource: null,
    scopeType: input.scopeType ?? "all",
    scopeKey: input.scopeKey ?? null,
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
        ccSuccess: 1000,
        ccRejected: 0,
        walletAmount: 0,
        riderWallet: 0,
        walletFeeBase: 100,
        invoiceWalletFee: 3,
        invoiceCardPaymentFees: 20,
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
        totalCharges: 203,
      },
      {
        branch: "Dammam",
        branchId: "2",
        orders: 8,
        grossSales: 920,
        netSales: 800,
        commission: 152,
        commissionPct: 0.19,
        ccSuccess: 700,
        ccRejected: 100,
        walletAmount: 0,
        riderWallet: 0,
        invoiceCardPaymentFees: 16,
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
        totalCharges: 168,
      },
    ],
    daily: [],
    invoice: {
      lines: [],
      paymentFees: 39,
      walletFeeBase: 100,
      walletFee: 3,
    },
  };
}

const VERSION = {
  id: "version-1",
  versionNumber: 1,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

describe("HungerStation contract compliance", () => {
  test("keeps commission compliance and branch overrides deterministic", () => {
    const result = evaluateHungerStationContractCompliance({
      period: period(),
      rules: [
        rule({ ruleType: "commission_rate", rate: 18 }),
        rule({
          ruleType: "commission_rate",
          scopeType: "branch",
          scopeKey: "Dammam",
          rate: 19,
        }),
      ],
      version: VERSION,
    });

    expect(result.commission.rows).toHaveLength(2);
    expect(
      result.commission.rows.every((row) => row.status === "matched"),
    ).toBe(true);
    expect(result.commission.totals.varianceAmount).toBe(0);
  });

  test("checks card payment fees from order-data base against invoice fees", () => {
    const result = evaluateHungerStationContractCompliance({
      period: period(),
      rules: [
        rule({ ruleType: "commission_rate", rate: 18 }),
        rule({ ruleType: "payment_fee", rate: 2 }),
        rule({ ruleType: "wallet_fee", rate: 3 }),
      ],
      version: VERSION,
    });

    expect(result.paymentFee.rows.map((row) => row.expectedAmount)).toEqual([
      20,
      16,
    ]);
    expect(result.paymentFee.totals.expectedAmount).toBe(36);
    expect(result.paymentFee.totals.observedAmount).toBe(36);
    expect(result.paymentFee.totals.varianceAmount).toBe(0);
    expect(result.paymentFee.totals.complete).toBe(true);
  });

  test("uses branch-specific payment fee rules before the default", () => {
    const p = period();
    p.branches[1]!.invoiceCardPaymentFees = 20;
    p.invoice.paymentFees = 43;

    const result = evaluateHungerStationContractCompliance({
      period: p,
      rules: [
        rule({ ruleType: "commission_rate", rate: 18 }),
        rule({ ruleType: "payment_fee", rate: 2 }),
        rule({
          ruleType: "payment_fee",
          scopeType: "branch",
          scopeKey: "Dammam",
          rate: 2.5,
        }),
        rule({ ruleType: "wallet_fee", rate: 3 }),
      ],
      version: VERSION,
    });

    expect(result.paymentFee.rows[1]?.contractRatePct).toBe(2.5);
    expect(result.paymentFee.rows[1]?.expectedAmount).toBe(20);
    expect(result.paymentFee.totals.expectedAmount).toBe(40);
    expect(result.paymentFee.totals.observedAmount).toBe(40);
  });

  test("labels wallet compliance as invoice-derived-base evidence", () => {
    const result = evaluateHungerStationContractCompliance({
      period: period(),
      rules: [
        rule({ ruleType: "commission_rate", rate: 18 }),
        rule({ ruleType: "payment_fee", rate: 2 }),
        rule({ ruleType: "wallet_fee", rate: 3 }),
      ],
      version: VERSION,
    });

    expect(result.walletFee.evidence).toBe(
      "contract_plus_invoice_derived_base",
    );
    expect(result.walletFee.rows[0]?.baseAmount).toBe(100);
    expect(result.walletFee.rows[0]?.expectedAmount).toBe(3);
    expect(result.walletFee.totals.observedAmount).toBe(3);
    expect(result.walletFee.totals.varianceAmount).toBe(0);
  });

  test("refuses to treat amount rules as percentage fee rules", () => {
    const result = evaluateHungerStationContractCompliance({
      period: period(),
      rules: [
        rule({ ruleType: "commission_rate", rate: 18 }),
        rule({
          ruleType: "payment_fee",
          rate: 2,
          valueKind: "amount",
        }),
      ],
      version: VERSION,
    });

    expect(result.paymentFee.unsupportedRuleBranches).toEqual([
      "Rakah",
      "Dammam",
    ]);
    expect(result.paymentFee.totals.complete).toBe(false);
    expect(result.paymentFee.totals.varianceAmount).toBeNull();
  });

  test("does not invent a total wallet rate when branch overrides exist but branch bases are absent", () => {
    const p = period();
    p.branches[0]!.walletFeeBase = undefined;
    p.branches[0]!.invoiceWalletFee = undefined;

    const result = evaluateHungerStationContractCompliance({
      period: p,
      rules: [
        rule({ ruleType: "commission_rate", rate: 18 }),
        rule({ ruleType: "wallet_fee", rate: 3 }),
        rule({
          ruleType: "wallet_fee",
          scopeType: "branch",
          scopeKey: "Rakah",
          rate: 4,
        }),
      ],
      version: VERSION,
    });

    expect(result.walletFee.rows).toHaveLength(0);
    expect(result.walletFee.missingEvidenceBranches).toContain(
      "تفاصيل توزيع أساس رسوم المحافظ على الفروع",
    );
    expect(result.walletFee.totals.complete).toBe(false);
  });
});
