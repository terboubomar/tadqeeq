import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "@/lib/periods";
import { buildPeriodExceptions } from "@/lib/exceptions";

import {
  buildAnalystContext,
  resolveAnalystFacts,
} from "./analyst-context";
import { analystAiResponseSchema, type AnalystAiResponse } from "./analyst-ai";
import { buildAnalystPresentation } from "./analyst-presentation";

function period(input: {
  id: string;
  label?: string;
  start: string;
  end: string;
  grossSales: number;
  commissionPct: number;
  totalCharges: number;
  branchCost?: number;
  branchId?: string;
  check?: boolean;
}): StoredPeriod {
  const commission = input.grossSales * input.commissionPct;
  return {
    id: input.id,
    label: input.label ?? input.id,
    platform: "jahez",
    period_start: input.start,
    period_end: input.end,
    created_at: input.end + "T23:59:59Z",
    summary: {
      platform: "jahez",
      orders: 100,
      grossSales: input.grossSales,
      netSales: input.grossSales - input.totalCharges,
      commission,
      commissionPct: input.commissionPct,
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
      totalCharges: input.totalCharges,
      branchCount: 2,
      statusCounts: {},
      periodStart: input.start,
      periodEnd: input.end,
    },
    branches: [
      {
        branch: "Branch A",
        branchId: input.branchId ?? "branch-secret-id",
        orders: 60,
        grossSales: input.grossSales * 0.6,
        netSales: input.grossSales * 0.45,
        commission: commission * 0.6,
        commissionPct: input.commissionPct,
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
        totalCharges: input.branchCost ?? input.totalCharges * 0.6,
      },
      {
        branch: "Branch B",
        branchId: "branch-b-secret",
        orders: 40,
        grossSales: input.grossSales * 0.4,
        netSales: input.grossSales * 0.3,
        commission: commission * 0.4,
        commissionPct: input.commissionPct - 0.01,
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
        totalCharges: input.totalCharges * 0.4,
      },
    ],
    daily: [
      {
        date: input.start,
        orders: 40,
        grossSales: input.grossSales * 0.35,
        netSales: input.grossSales * 0.25,
        commission: commission * 0.35,
        ccSuccess: 0,
      },
      {
        date: input.end,
        orders: 60,
        grossSales: input.grossSales * 0.65,
        netSales: input.grossSales * 0.5,
        commission: commission * 0.65,
        ccSuccess: 0,
      },
    ],
    invoice: {
      lines: [],
      checks: input.check
        ? [
            {
              label: "عمولة جاهز",
              computed: 100,
              invoiced: 125,
              difference: 25,
              tolerance: 0.05,
              evidence: "data",
              status: "warning",
            },
          ]
        : [],
    },
  } as unknown as StoredPeriod;
}

describe("Ask Tadqeeq deterministic context", () => {
  test("keeps useful facts while excluding internal identifiers and workflow notes", () => {
    const current = period({
      id: "period-secret-id",
      label: "private-period-label",
      start: "2026-09-01",
      end: "2026-09-30",
      grossSales: 12000,
      commissionPct: 0.19,
      totalCharges: 3000,
      branchCost: 2000,
      branchId: "branch-secret-id",
      check: true,
    });

    const item = buildPeriodExceptions(current)[0];
    if (!item) throw new Error("expected test exception");
    current.invoice.exceptionWorkflow = {
      [item.id]: {
        status: "reviewing",
        note: "private-workflow-note",
        recoveredAmount: 0,
      },
    };

    const context = buildAnalystContext(current, [current]);
    const serialized = JSON.stringify(context);

    expect(serialized).toContain("12000");
    expect(serialized).toContain("Branch A");
    expect(serialized).toContain("عمولة جاهز");
    expect(serialized).not.toContain("period-secret-id");
    expect(serialized).not.toContain("private-period-label");
    expect(serialized).not.toContain("branch-secret-id");
    expect(serialized).not.toContain("branch-b-secret");
    expect(serialized).not.toContain("private-workflow-note");
  });

  test("precomputes rankings instead of asking the model to rank branches", () => {
    const current = period({
      id: "sep",
      start: "2026-09-01",
      end: "2026-09-30",
      grossSales: 12000,
      commissionPct: 0.19,
      totalCharges: 3000,
      branchCost: 2200,
    });

    const context = buildAnalystContext(current, [current]);
    const ranking = context.facts.find(
      (fact) => fact.label === "أعلى الفروع بتكلفة المنصة",
    );
    const rows = ranking?.data.ranking as Array<{
      rank: number;
      branch: string;
      value: number;
    }>;

    expect(rows[0]?.branch).toBe("Branch A");
    expect(rows[0]?.value).toBe(2200);
    expect(rows[0]?.rank).toBe(1);
  });

  test("precomputes period deltas and percentage-point changes", () => {
    const current = period({
      id: "sep",
      start: "2026-09-01",
      end: "2026-09-30",
      grossSales: 12000,
      commissionPct: 0.19,
      totalCharges: 3000,
    });
    const previous = period({
      id: "aug",
      start: "2026-08-01",
      end: "2026-08-31",
      grossSales: 10000,
      commissionPct: 0.18,
      totalCharges: 2400,
    });

    const context = buildAnalystContext(current, [current, previous]);
    const commissionMovement = context.facts.find(
      (fact) => fact.label === "مقارنة · نسبة العمولة",
    );

    expect(commissionMovement?.data.deltaType).toBe("percentage_points");
    expect(commissionMovement?.data.delta).toBeCloseTo(1, 8);
    expect(context.hasPreviousPeriod).toBe(true);
    expect(context.coverage.comparisonIncluded).toBe(true);
  });

  test("understands the current app screen from app knowledge facts", () => {
    const current = period({
      id: "sep",
      start: "2026-09-01",
      end: "2026-09-30",
      grossSales: 12000,
      commissionPct: 0.19,
      totalCharges: 3000,
    });

    const context = buildAnalystContext(current, [current], "/invoice-check");
    const screen = context.facts.find(
      (fact) =>
        fact.kind === "app" &&
        fact.data.currentScreen === true,
    );

    expect(context.currentRoute).toBe("/invoice-check");
    expect(screen?.data.route).toBe("/invoice-check");
    expect(screen?.label).toContain("مطابقة الفاتورة");
  });

  test("includes invoice-check rows and exact daily rows in the grounded registry", () => {
    const current = period({
      id: "sep",
      start: "2026-09-01",
      end: "2026-09-30",
      grossSales: 12000,
      commissionPct: 0.19,
      totalCharges: 3000,
      check: true,
    });

    const context = buildAnalystContext(current, [current], "/daily");
    const invoiceCheck = context.facts.find(
      (fact) => fact.kind === "invoice_check" && fact.data.label === "عمولة جاهز",
    );
    const daily = context.facts.find(
      (fact) => fact.kind === "daily" && fact.data.date === "2026-09-01",
    );

    expect(invoiceCheck?.data.computed).toBe(100);
    expect(invoiceCheck?.data.invoiced).toBe(125);
    expect(invoiceCheck?.data.difference).toBe(25);
    expect(daily?.data.orders).toBe(40);
    expect(daily?.data.grossSales).toBe(4200);
    expect(context.coverage.invoiceChecksIncluded).toBe(1);
    expect(context.coverage.dailyRowsIncluded).toBe(2);
  });

  test("includes multiple owned periods as archive facts without leaking period labels", () => {
    const current = period({
      id: "sep-secret",
      label: "September private label",
      start: "2026-09-01",
      end: "2026-09-30",
      grossSales: 12000,
      commissionPct: 0.19,
      totalCharges: 3000,
    });
    const previous = period({
      id: "aug-secret",
      label: "August private label",
      start: "2026-08-01",
      end: "2026-08-31",
      grossSales: 10000,
      commissionPct: 0.18,
      totalCharges: 2400,
    });

    const context = buildAnalystContext(current, [current, previous], "/history");
    const history = context.facts.filter((fact) => fact.kind === "history");
    const serialized = JSON.stringify(history);

    expect(history).toHaveLength(2);
    expect(context.coverage.historyPeriodsIncluded).toBe(2);
    expect(serialized).toContain("2026-08-01");
    expect(serialized).not.toContain("September private label");
    expect(serialized).not.toContain("August private label");
    expect(serialized).not.toContain("sep-secret");
    expect(serialized).not.toContain("aug-secret");
  });

  test("resolves only fact IDs that exist in the current server-built registry", () => {
    const current = period({
      id: "sep",
      start: "2026-09-01",
      end: "2026-09-30",
      grossSales: 12000,
      commissionPct: 0.19,
      totalCharges: 3000,
    });
    const context = buildAnalystContext(current, [current]);

    const facts = resolveAnalystFacts(context, ["F001", "F999"]);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.id).toBe("F001");
  });
});

describe("Ask Tadqeeq structured presentation", () => {
  test("builds a branch cost table from a deterministic ranking fact", () => {
    const current = period({
      id: "sep",
      start: "2026-09-01",
      end: "2026-09-30",
      grossSales: 12000,
      commissionPct: 0.19,
      totalCharges: 3000,
      branchCost: 2200,
    });

    const context = buildAnalystContext(current, [current]);
    const ranking = context.facts.find(
      (fact) => fact.label === "أعلى الفروع بتكلفة المنصة",
    );
    if (!ranking) throw new Error("expected cost ranking");

    const response: AnalystAiResponse = {
      answerability: "grounded",
      answer: "الفرع الأعلى تكلفة هو Branch A.",
      usedFactIds: [ranking.id],
      presentation: {
        type: "branch_table",
        title: "أعلى الفروع تكلفة",
        factIds: [ranking.id],
      },
      limitations: [],
      followUpSuggestions: [],
      confidence: "high",
    };

    const presentation = buildAnalystPresentation(context, response);

    expect(presentation?.type).toBe("table");
    expect(presentation?.rows[0]?.branch).toBe("Branch A");
    expect(presentation?.rows[0]?.platformCost).toBe("2,200.00 ر.س");
    expect(presentation?.rows[0]?.grossSales).toBe("7,200.00 ر.س");
    expect(presentation?.rows[0]?.orders).toBe("60");
    expect(presentation?.rows[1]?.branch).toBe("Branch B");
  });

  test("falls back to text when no valid table facts are supplied", () => {
    const current = period({
      id: "sep",
      start: "2026-09-01",
      end: "2026-09-30",
      grossSales: 12000,
      commissionPct: 0.19,
      totalCharges: 3000,
    });
    const context = buildAnalystContext(current, [current]);

    const response: AnalystAiResponse = {
      answerability: "grounded",
      answer: "ملخص نصي.",
      usedFactIds: ["F001"],
      presentation: {
        type: "exception_table",
        title: "الاستثناءات",
        factIds: ["F001"],
      },
      limitations: [],
      followUpSuggestions: [],
      confidence: "high",
    };

    expect(buildAnalystPresentation(context, response)).toBeNull();
  });
});

describe("Ask Tadqeeq structured response", () => {
  test("validates grounded answers with explicit fact references", () => {
    const result = analystAiResponseSchema.parse({
      answerability: "grounded",
      answer: "أعلى تكلفة منصة مسجلة في السياق الحالي تخص Branch A.",
      usedFactIds: ["F015"],
      presentation: {
        type: "text",
        title: "",
        factIds: [],
      },
      limitations: [],
      followUpSuggestions: ["اعرض تفاصيل الفرع."],
      confidence: "high",
    });

    expect(result.answerability).toBe("grounded");
    expect(result.usedFactIds).toEqual(["F015"]);
  });
});
