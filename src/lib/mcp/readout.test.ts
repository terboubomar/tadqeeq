import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "@/lib/periods";

import { branchPerformance, exceptionList, periodHeadline, periodReadout } from "./readout";

const period = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "أغسطس",
  platform: "jahez",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  created_at: "2026-09-01T00:00:00Z",
  summary: { orders: 100, branchCount: 2, grossSales: 10000.456, netSales: 7600, commission: 1800, commissionPct: 18, totalCharges: 2400 },
  branches: [
    { branch: "فرع العليا", branchId: "a", orders: 40, grossSales: 4000, netSales: 3100, commission: 720, commissionPct: 18, totalCharges: 900 },
    { branch: "فرع النرجس", branchId: "b", orders: 60, grossSales: 6000, netSales: 4500, commission: 1080, commissionPct: 18, totalCharges: 1500 },
  ],
  daily: [],
  invoice: {
    checks: [
      { code: "COMMISSION", category: "commission", label: "العمولة", computed: 1800, invoiced: 1850, tolerance: 1, evidence: "data" },
      { code: "ROLLUP", category: "settlement", label: "ضابط إجمالي", computed: 5, invoiced: 0, controlOnly: true },
    ],
    exceptionWorkflow: { hidden: { status: "reviewing", note: "Private internal note" } },
  },
} as unknown as StoredPeriod;

describe("MCP readouts", () => {
  test("headline rounds money to halalas and names the platform", () => {
    expect(periodHeadline(period)).toMatchObject({ platform_name: "Jahez (جاهز)", orders: 100, gross_sales_sar: 10000.46, commission_pct: 18, branches: 2 });
  });

  test("the invoice comparison skips roll-up controls and shows each line's difference", () => {
    const readout = periodReadout(period, "https://tadqeeq.app");
    expect(readout.invoice_check).toEqual([
      { line: "العمولة", recalculated_sar: 1800, invoiced_sar: 1850, difference_sar: -50, within_tolerance: false },
    ]);
    expect(readout.differences.open_count).toBeGreaterThan(0);
    expect(readout.costliest_branches[0]?.branch).toBe("فرع النرجس");
    // Workflow notes stay inside Tadqeeq.
    expect(JSON.stringify(readout)).not.toContain("Private internal note");
  });

  test("branches are ordered by platform cost", () => {
    expect(branchPerformance(period).map((b) => [b.branch, b.platform_cost_sar])).toEqual([
      ["فرع النرجس", 1500],
      ["فرع العليا", 900],
    ]);
  });

  test("differences list open items largest first", () => {
    const list = exceptionList(period, false);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.status !== "closed" && e.status !== "recovered")).toBe(true);
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.amount_to_review_sar! >= list[i]!.amount_to_review_sar!).toBe(true);
  });
});
