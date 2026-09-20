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
      ],
      exceptionWorkflow: workflow,
    },
  } as StoredPeriod;
}

describe("Exception Center", () => {
  test("deduplicates summary commission when the discrepancy is localized to a branch", () => {
    const exceptions = buildPeriodExceptions(hungerPeriod());

    expect(exceptions.filter((item) => item.category === "commission")).toHaveLength(1);
    expect(exceptions.find((item) => item.category === "commission")?.sourceLevel).toBe("branch");

    const summary = summarizeExceptions(exceptions);
    expect(summary.openCount).toBe(3);
    expect(summary.underReview).toBeCloseTo(520, 6);
    expect(summary.potentialRecovery).toBeCloseTo(20, 6);
    expect(
      exceptions.find((item) => item.category === "unsupported_charge")?.potentialRecovery,
    ).toBe(0);
  });



  test("does not surface the legacy Keeta 1.00 tax-header parser artifact", () => {
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
        ],
      },
    } as StoredPeriod;

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions).toHaveLength(0);
    expect(summarizeExceptions(exceptions).openCount).toBe(0);
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
    expect(summary.openCount).toBe(2);
    expect(summary.underReview).toBeCloseTo(510, 6);
    expect(summary.potentialRecovery).toBeCloseTo(10, 6);
    expect(summary.recovered).toBeCloseTo(8, 6);
  });
});
