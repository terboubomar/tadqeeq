import { describe, expect, test } from "bun:test";

import {
  buildPeriodExceptions,
  summarizeExceptions,
  type ExceptionWorkflowEntry,
} from "./exceptions";
import type { StoredPeriod } from "./periods";

function hungerPeriod(workflow?: Record<string, ExceptionWorkflowEntry>): StoredPeriod {
  return {
    id: "period-1",
    label: "HS Test Company, Aug",
    platform: "hungerstation",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    created_at: "2026-09-01T00:00:00Z",
    summary: {} as StoredPeriod["summary"],
    daily: [],
    branches: [
      {
        branch: "Branch A",
        branchId: "100",
        orders: 10,
        grossSales: 1000,
        netSales: 900,
        commission: 100,
        commissionPct: 0.1,
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
        totalCharges: 100,
        invoiceCommission: 110,
      },
    ],
    invoice: {
      lines: [],
      checks: [
        {
          label: "عمولة المبيعات",
          computed: 100,
          invoiced: 110,
          evidence: "data",
          tolerance: 0.05,
        },
        {
          label: "رسوم الدفع الإلكتروني",
          computed: 200,
          invoiced: 210,
          evidence: "contract",
          tolerance: 0.1,
        },
        {
          label: "الطابعات (فاتورة فقط)",
          computed: 0,
          invoiced: 500,
          evidence: "invoice_only",
        },
        {
          label: "إجمالي الفاتورة (بدون ضريبة)",
          computed: 810,
          invoiced: 1310,
          evidence: "mixed",
        },
      ],
      exceptionWorkflow: workflow,
    },
  } as StoredPeriod;
}

describe("Exception Center", () => {
  test("shows only actionable leaf discrepancies and prefers branch evidence", () => {
    const exceptions = buildPeriodExceptions(hungerPeriod());

    expect(exceptions).toHaveLength(2);
    expect(exceptions.filter((item) => item.category === "commission")).toHaveLength(1);
    expect(exceptions.find((item) => item.category === "commission")?.sourceLevel).toBe("branch");
    expect(exceptions.some((item) => item.label.includes("فاتورة فقط"))).toBe(false);
    expect(exceptions.some((item) => item.label.includes("إجمالي الفاتورة"))).toBe(false);

    const summary = summarizeExceptions(exceptions);
    expect(summary.openCount).toBe(2);
    expect(summary.underReview).toBeCloseTo(20, 6);
    expect(summary.potentialRecovery).toBeCloseTo(20, 6);
  });

  test("never turns aggregate Keeta tax controls into an exception", () => {
    const period = {
      id: "keeta-old",
      label: "Keeta Aug",
      platform: "keeta",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {} as StoredPeriod["summary"],
      daily: [],
      branches: [],
      invoice: {
        lines: [],
        checks: [
          {
            label: "صافي الفاتورة الضريبية شامل الضريبة",
            computed: 643142.06,
            invoiced: 1,
            evidence: "data",
            tolerance: 0.05,
          },
          {
            label: "صافي الفاتورة الضريبية بدون الضريبة",
            computed: 559253.96,
            invoiced: 0,
            evidence: "data",
            tolerance: 0.05,
          },
        ],
      },
    } as StoredPeriod;

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions).toHaveLength(0);
    expect(summarizeExceptions(exceptions).openCount).toBe(0);
  });

  test("uses strict default tolerance instead of silently ignoring differences below SAR 1", () => {
    const period = {
      id: "strict-tolerance",
      label: "HS strict tolerance",
      platform: "hungerstation",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {} as StoredPeriod["summary"],
      daily: [],
      branches: [],
      invoice: {
        lines: [],
        checks: [
          {
            label: "عمولة المبيعات",
            computed: 100,
            invoiced: 100.2,
            evidence: "data",
          },
        ],
      },
    } as StoredPeriod;

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.reviewAmount).toBeCloseTo(0.2, 6);
  });

  test("a clean Keeta branch report stays clean even if a stale aggregate control is corrupted", () => {
    const period = {
      id: "keeta-clean",
      label: "Keeta Aug",
      platform: "keeta",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {} as StoredPeriod["summary"],
      daily: [],
      branches: [
        {
          branch: "Branch A",
          branchId: "1001",
          orders: 5,
          grossSales: 1000,
          netSales: 700,
          commission: 100,
          commissionPct: 0.1,
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
          totalCharges: 300,
          branchAuditStatus: "matched",
          keetaCommissionExVat: 100,
          keetaBankFeesExVat: 20,
          keetaDeliveryCampaignExVat: 30,
          keetaCreditSales: 900,
          keetaPdfOrderCommissionInclVat: 115,
          keetaPdfOrderCommissionVariance: 0,
          keetaPdfBankCommissionInclVat: 23,
          keetaPdfBankCommissionVariance: 0,
          keetaPdfDeliveryCommissionInclVat: 34.5,
          keetaPdfDeliveryCommissionVariance: 0,
          keetaPdfCreditSales: 900,
          keetaPdfCreditSalesVariance: 0,
          keetaPdfNetDue: 700,
          keetaPdfNetDueVariance: 0,
        },
      ],
      invoice: {
        lines: [],
        checks: [
          {
            label: "عمولة الطلب",
            computed: 100,
            invoiced: 100,
            evidence: "data",
            tolerance: 0.05,
          },
          {
            label: "صافي الفاتورة الضريبية شامل الضريبة",
            computed: 643142.06,
            invoiced: 1,
            evidence: "data",
            tolerance: 0.05,
          },
        ],
      },
    } as StoredPeriod;

    expect(buildPeriodExceptions(period)).toHaveLength(0);
  });

  test("applies persisted workflow without changing audit evidence", () => {
    const initial = buildPeriodExceptions(hungerPeriod());
    const commission = initial.find((item) => item.category === "commission");
    expect(commission).toBeDefined();

    const workflow: Record<string, ExceptionWorkflowEntry> = {
      [commission!.id]: {
        status: "recovered",
        recoveredAmount: 8,
        note: "تم استرداد جزء من الفرق",
      },
    };

    const exceptions = buildPeriodExceptions(hungerPeriod(workflow));
    const updated = exceptions.find((item) => item.id === commission!.id);
    expect(updated?.status).toBe("recovered");
    expect(updated?.recoveredAmount).toBe(8);
    expect(updated?.computed).toBe(100);
    expect(updated?.invoiced).toBe(110);

    const summary = summarizeExceptions(exceptions);
    expect(summary.openCount).toBe(1);
    expect(summary.underReview).toBeCloseTo(10, 6);
    expect(summary.potentialRecovery).toBeCloseTo(10, 6);
    expect(summary.recovered).toBeCloseTo(8, 6);
  });
});
