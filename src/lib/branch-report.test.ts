import { describe, expect, test } from "bun:test";

import { DIFFERENCE_THRESHOLD, branchReportColumns, branchReportRow, significantDifferences } from "./branch-report";
import type { StoredPeriod } from "./periods";

const hsPeriod = {
  id: "p",
  label: "Mashkuk Oct",
  platform: "hungerstation",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  created_at: "2026-11-01",
  summary: {},
  daily: [],
  branches: [
    {
      branch: "Mashkuk Bahab Saihat   An Nur",
      branchId: "2",
      branchAuditLabel: "مطابق",
      orders: 900,
      grossSales: 50000,
      netSales: 40000,
      commission: 6000,
      commissionPct: 0.15,
      bankFeeSuccess: 800,
      bankFeeRefunded: 20,
      walletFee: 30,
      rdfCampaigns: 4000,
      compensation: 100,
      jokerFees: 0,
      waitingTimeFees: 0,
      totalCharges: 10950,
      totalCollections: 45000,
      commissionVariance: 4.5,
      collectionsVariance: 520,
      paymentFeeVariance: -12.25,
    },
  ],
  invoice: { cpcBranches: [{ branch: "Mashkuk Bahab Saihat - An Nur", amountExVat: 1799.67, vat: 269.95 }] },
} as unknown as StoredPeriod;

describe("branch report", () => {
  test("each figure once: payment fees and other charges add up their parts, CPC is the branch's own", () => {
    const row = branchReportRow(hsPeriod, hsPeriod.branches[0]!, "Saihat An Nur", 0);
    expect(row.paymentFees).toBeCloseTo(850, 2);
    expect(row.otherCharges).toBeCloseTo(4100, 2);
    expect(row.advertising).toBeCloseTo(1799.67, 2);
    expect(row.platformCost).toBeCloseTo(10950 + 1799.67, 2);
    expect(row.platformCostPct).toBeCloseTo((10950 + 1799.67) / 40000, 6);
  });

  test("only differences above 10 SAR are named, with the invoice higher or lower than recalculated", () => {
    expect(DIFFERENCE_THRESHOLD).toBe(10);
    const row = branchReportRow(hsPeriod, hsPeriod.branches[0]!, "Saihat An Nur", 0);
    expect(row.differences).toBe("رسوم الدفع أقل 12.25، التحصيلات أعلى 520.00");
    expect(significantDifferences([["العمولة", 9.99], ["المبيعات", -10]])).toBe("");
    // Without differences above the threshold the column shows the branch's match status.
    const clean = { ...hsPeriod.branches[0]!, collectionsVariance: 2, paymentFeeVariance: 0 };
    expect(branchReportRow(hsPeriod, clean, "Saihat An Nur", 0).differences).toBe("مطابق");
  });

  test("the summary has no duplicate or invoice-copy columns; the detail adds the breakdown", () => {
    const rows = [branchReportRow(hsPeriod, hsPeriod.branches[0]!, "Saihat An Nur", 0)];
    const summary = branchReportColumns("hungerstation", "summary", rows).map((column) => column.key);
    expect(summary).toEqual(["branch", "orders", "salesExVat", "commission", "paymentFees", "otherCharges", "advertising", "platformCost", "platformCostPct", "differences"]);
    const detail = branchReportColumns("hungerstation", "detail", rows).map((column) => column.key);
    expect(detail).toContain("rdfCampaigns");
    expect(detail).toContain("collections");
    // Lines no branch was charged for are left out (no flash deals, no waiting time, no invoice-only items here).
    expect(detail).not.toContain("jokerFees");
    expect(detail).not.toContain("waitingTimeFees");
    expect(detail).not.toContain("invoiceOnly");
    expect(new Set(detail).size).toBe(detail.length);
  });

  test("every platform's views keep the same headline columns", () => {
    for (const platform of ["hungerstation", "keeta", "jahez"] as const) {
      for (const view of ["summary", "detail"] as const) {
        const keys = branchReportColumns(platform, view, []).map((column) => column.key);
        expect(keys).toContain("platformCost");
        expect(keys).toContain("platformCostPct");
        expect(keys.at(-1)).toBe("differences");
      }
    }
  });
});
