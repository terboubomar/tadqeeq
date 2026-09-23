import { describe, expect, test } from "bun:test";

import type { AnalystContext, AnalystFact, AnalystFactKind } from "./analyst-context";
import { selectAnalystFacts } from "./analyst-retrieval";

function fact(
  id: string,
  kind: AnalystFactKind,
  label: string,
  data: AnalystFact["data"] = {},
): AnalystFact {
  return { id, kind, label, displayValue: label, data };
}

function context(route = "/dashboard"): AnalystContext {
  return {
    platform: "hungerstation",
    currentRoute: route,
    period: { start: "2026-08-01", end: "2026-08-31" },
    hasPreviousPeriod: true,
    facts: [
      fact("F001", "period", "المبيعات الإجمالية", { value: 1000 }),
      fact("F002", "branch", "مؤشرات فرع · الروضة", {
        branch: "الروضة",
        grossSales: 500,
      }),
      fact("F003", "branch", "مؤشرات فرع · النخيل", {
        branch: "النخيل",
        grossSales: 400,
      }),
      fact("F004", "ranking", "أعلى الفروع تكلفة", {
        rows: [{ branch: "الروضة", value: 50 }],
      }),
      fact("F005", "exception", "فرق عمولة الفرع", { value: 10 }),
      fact("F006", "evidence", "دليل فرق العمولة", { source: "invoice" }),
      fact("F007", "invoice_check", "عمولة المبيعات", { computed: 90, invoiced: 100 }),
      fact("F008", "daily", "يوم · 2026-08-17", { date: "2026-08-17", grossSales: 77 }),
      fact("F009", "daily", "يوم · 2026-08-18", { date: "2026-08-18", grossSales: 88 }),
      fact("F010", "comparison", "تغير المبيعات", { delta: 100 }),
      fact("F011", "history", "فترة · يوليو", { grossSales: 900 }),
      fact("F012", "breakdown", "رسوم الدفع", { value: 20 }),
      fact("F013", "status", "Successful", { count: 10 }),
      fact("F014", "app", "صفحة الفروع", { route: "/branches", currentScreen: false }),
      fact("F015", "app", "اللوحة التنفيذية", { route: "/dashboard", currentScreen: true }),
    ],
    coverage: {
      branchCount: 2,
      openExceptionCount: 1,
      exceptionDetailsIncluded: 1,
      evidenceTrailsIncluded: 1,
      comparisonIncluded: true,
      invoiceChecksIncluded: 1,
      dailyRowsIncluded: 2,
      historyPeriodsIncluded: 1,
      historyPeriodsAvailable: 1,
      appKnowledgeItemsIncluded: 2,
    },
  };
}

describe("Ask Tadqeeq intent-aware retrieval", () => {
  test("branch question excludes unrelated daily and invoice facts", () => {
    const selected = selectAnalystFacts(context(), "أي الفروع لديها أعلى تكلفة منصة؟");
    const kinds = new Set(selected.map((item) => item.kind));

    expect(kinds.has("period")).toBe(true);
    expect(kinds.has("branch")).toBe(true);
    expect(kinds.has("ranking")).toBe(true);
    expect(kinds.has("daily")).toBe(false);
    expect(kinds.has("invoice_check")).toBe(false);
  });

  test("specific date narrows daily rows", () => {
    const selected = selectAnalystFacts(context("/daily"), "ماذا حدث يوم 2026-08-17؟");
    const daily = selected.filter((item) => item.kind === "daily");

    expect(daily).toHaveLength(1);
    expect(daily[0]?.id).toBe("F008");
  });

  test("invoice question selects invoice checks without branch noise", () => {
    const selected = selectAnalystFacts(context("/invoice-check"), "ما فروقات الفاتورة؟");

    expect(selected.some((item) => item.kind === "invoice_check")).toBe(true);
    expect(selected.some((item) => item.kind === "branch")).toBe(false);
  });

  test("comparison question includes history and comparison facts", () => {
    const selected = selectAnalystFacts(context("/history"), "قارن مع الفترة السابقة");

    expect(selected.some((item) => item.kind === "comparison")).toBe(true);
    expect(selected.some((item) => item.kind === "history")).toBe(true);
  });

  test("named branch keeps the requested branch and rankings", () => {
    const selected = selectAnalystFacts(context("/branches"), "حلل فرع الروضة");
    const branchFacts = selected.filter((item) => item.kind === "branch");

    expect(branchFacts).toHaveLength(1);
    expect(branchFacts[0]?.label).toContain("الروضة");
    expect(selected.some((item) => item.kind === "ranking")).toBe(true);
  });
});
