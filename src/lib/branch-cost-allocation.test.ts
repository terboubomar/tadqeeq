import { describe, expect, test } from "bun:test";

import { buildPeriodExceptions } from "./exceptions";
import { branchPerformance, periodReadout } from "./mcp/readout";
import type { StoredPeriod } from "./periods";
import {
  branchCostReconciliation,
  branchNameKey,
  branchPlatformCost,
  cpcLineAllocation,
  unallocatedPlatformCharges,
} from "./reporting-metrics";

/**
 * Mashkuk Bahab, October 2026 (commission invoice HS-2026/10-4958727, CPC invoice HS-ADS-2026/10-4906108).
 * Branch names as the orders export spells them, each branch's commission-invoice charges without VAT, and the
 * CPC line for it as the CPC invoice spells the name.
 */
const MASHKUK: Array<[exportName: string, charges: number, cpcName: string, cpc: number]> = [
  ["Mashkuk Bahab - Sudayr", 46834.19, "Mashkuk Bahab - Sudayr", 799.64],
  ["Mashkuk Bahab - Jalmudah", 42703.19, "Mashkuk Bahab - Jalmudah", 2399.13],
  ["Mashkuk Bahab - Az Zuhur", 27092.5, "Mashkuk Bahab - Az Zuhur", 3249.02],
  ["Mashkuk Bahab - Ash Shulah (Fakhriyah)", 19230.5, "Mashkuk Bahab - Ash Shulah (Fakhriyah)", 1249.6],
  ["Mashkuk Bahab - An Nur", 17462.3, "Mashkuk Bahab - An Nur", 2243.41],
  ["Mashkuk Bahab   As Safa", 17154.8, "Mashkuk Bahab As Safa", 1249.77],
  ["Mashkuk Bahab - al mazrua", 12929.14, "Mashkuk Bahab - al mazrua", 2243.4],
  ["Mashkuk Bahab Saihat   An Nur", 11357.53, "Mashkuk Bahab Saihat - An Nur", 1799.67],
  ["Mashkuk Bahab   Al Khubar Ash Shamaliyah", 10962.69, "Mashkuk Bahab - Al Khubar Ash shamaliyah", 2049.23],
];
const FREE_DELIVERY = 1132.17;
const TOTAL = 224141.88;

function mashkuk(cpcBranches = MASHKUK.map(([, , branch, amountExVat]) => ({ branch, amountExVat, vat: 0 }))): StoredPeriod {
  const branchCharges = MASHKUK.reduce((sum, [, charges]) => sum + charges, 0);
  return {
    id: "8bf502ac-8c67-452a-8937-4dfc682f2fde",
    label: "Mashkuk bihub Oct HS",
    platform: "hungerstation",
    period_start: "2026-10-01",
    period_end: "2026-10-31",
    created_at: "2026-11-01",
    summary: { orders: 12295, grossSales: 664190.14, netSales: 577556.64, commission: 94780.1, commissionPct: 0.164, totalCharges: branchCharges + FREE_DELIVERY },
    branches: MASHKUK.map(([branch, totalCharges], index) => ({
      branch,
      branchId: String(100 + index),
      orders: 100,
      grossSales: 0,
      netSales: totalCharges * 2.5,
      commission: 0,
      commissionPct: 0,
      totalCharges,
    })),
    daily: [],
    invoice: {
      cpc: 0,
      cpcBranches,
      unallocatedCharges: [{ label: "رسوم حملات التوصيل المجاني", amount: FREE_DELIVERY }],
    },
  } as unknown as StoredPeriod;
}

describe("branch name matching across the orders file and the CPC invoice", () => {
  test("separators, case and spacing do not change the key", () => {
    expect(branchNameKey("Mashkuk Bahab Saihat - An Nur")).toBe(branchNameKey("Mashkuk Bahab Saihat   An Nur"));
    expect(branchNameKey("Mashkuk Bahab - Al Khubar Ash shamaliyah")).toBe(branchNameKey("Mashkuk Bahab   Al Khubar Ash Shamaliyah"));
    expect(branchNameKey("Mashkuk Bahab As Safa")).toBe(branchNameKey("Mashkuk Bahab   As Safa"));
    expect(branchNameKey("Ash Shulah (Fakhriyah)")).toBe(branchNameKey("ash_shulah – fakhriyah"));
    expect(branchNameKey("فرع الأحساء")).toBe(branchNameKey("فرع  الاحساء"));
  });

  test("different branches keep different keys", () => {
    expect(branchNameKey("Mashkuk Bahab - An Nur")).not.toBe(branchNameKey("Mashkuk Bahab Saihat - An Nur"));
  });

  test("every Mashkuk CPC line finds its branch", () => {
    const allocation = cpcLineAllocation(mashkuk());
    expect(allocation.every((item) => item.branch !== null)).toBe(true);
    expect(allocation.find((item) => item.line.branch === "Mashkuk Bahab Saihat - An Nur")?.branch?.branch).toBe("Mashkuk Bahab Saihat   An Nur");
  });

  test("a CPC line also matches the commission-invoice name tied to the branch", () => {
    const period = mashkuk([{ branch: "مشكوك - سيهات", amountExVat: 100, vat: 15 }]);
    period.branches[7]!.invoiceBranchName = "مشكوك سيهات";
    expect(cpcLineAllocation(period)[0]?.branch?.branch).toBe("Mashkuk Bahab Saihat   An Nur");
  });
});

describe("branch platform cost has one definition", () => {
  test("commission-invoice charges + CPC, with both views exposed", () => {
    const period = mashkuk();
    const saihat = branchPlatformCost(period, period.branches[7]!)!;
    expect(saihat.platformCostExclAds).toBeCloseTo(11357.53, 2);
    expect(saihat.advertisingExVat).toBeCloseTo(1799.67, 2);
    expect(saihat.platformCost).toBeCloseTo(13157.2, 2);
    expect(branchPlatformCost(period, period.branches[8]!)!.platformCost).toBeCloseTo(13011.92, 2);
  });

  test("costliest_branches and get_branch_performance give the same numbers", () => {
    const period = mashkuk();
    const performance = branchPerformance(period);
    const readout = periodReadout(period, "https://tadqeeq.app");
    for (const top of readout.costliest_branches) {
      const row = performance.find((branch) => branch.branch === top.branch)!;
      expect(top.platform_cost_sar).toBe(row.platform_cost_sar);
      expect(top.advertising_ex_vat_sar).toBe(row.advertising_ex_vat_sar);
      expect(top.platform_cost_excl_ads_sar).toBe(row.platform_cost_excl_ads_sar);
      expect(top.platform_cost_pct).toBe(row.platform_cost_pct);
    }
    expect(readout.costliest_branches[0]).toMatchObject({ branch: "Mashkuk Bahab - Sudayr", platform_cost_sar: 47633.83, advertising_ex_vat_sar: 799.64, platform_cost_excl_ads_sar: 46834.19 });
    // charges ÷ sales without VAT, advertising included: the platform-level formula.
    const sudayr = performance[0]!;
    expect(sudayr.platform_cost_pct).toBeCloseTo(47633.83 / (46834.19 * 2.5), 4);
  });
});

describe("branch cost reconciliation", () => {
  test("Mashkuk: branches + unallocated = total platform charges", () => {
    const period = mashkuk();
    const check = branchCostReconciliation(period)!;
    expect(check.total).toBeCloseTo(TOTAL, 2);
    expect(check.branches + check.unallocated).toBeCloseTo(TOTAL, 2);
    expect(check.unallocated).toBeCloseTo(FREE_DELIVERY, 2);
    expect(check.reconciled).toBe(true);
    expect(periodReadout(period, "https://tadqeeq.app").branch_cost_reconciliation).toMatchObject({ residual_sar: 0, reconciled: true });
    expect(buildPeriodExceptions(period).map((item) => item.code)).not.toContain("BRANCH_COST_ALLOCATION_GAP");
    expect(buildPeriodExceptions(period).map((item) => item.code)).not.toContain("HS_CPC_UNMATCHED_BRANCH");
  });

  test("an unknown CPC branch is unallocated with its raw name and raises an exception; nothing is dropped", () => {
    const lines = MASHKUK.map(([, , branch, amountExVat]) => ({ branch, amountExVat, vat: 0 }));
    lines[7] = { branch: "Mashkuk Bahab - Dammam Corniche", amountExVat: 1799.67, vat: 0 };
    const period = mashkuk(lines);

    expect(branchPlatformCost(period, period.branches[7]!)!.advertisingExVat).toBe(0);
    expect(unallocatedPlatformCharges(period)).toContainEqual({
      label: "إعلانات CPC · Mashkuk Bahab - Dammam Corniche",
      amount: 1799.67,
      allocation: "unmatched_branch",
      rawBranchName: "Mashkuk Bahab - Dammam Corniche",
    });
    expect(periodReadout(period, "https://tadqeeq.app").unallocated_charges).toContainEqual(
      expect.objectContaining({ allocation: "unmatched_branch", raw_branch_name: "Mashkuk Bahab - Dammam Corniche", amount_sar: 1799.67 }),
    );
    // Still reconciles: the line moved from a branch to unallocated.
    expect(branchCostReconciliation(period)!.reconciled).toBe(true);

    const exception = buildPeriodExceptions(period).find((item) => item.code === "HS_CPC_UNMATCHED_BRANCH")!;
    expect(exception.reviewAmount).toBeCloseTo(1799.67, 2);
    expect(exception.hint).toContain("Mashkuk Bahab - Dammam Corniche");
  });

  test("a charge in the total but on no branch raises «فرق توزيع التكاليف على الفروع» with the residual", () => {
    const period = mashkuk();
    period.summary.totalCharges += 250;
    const check = branchCostReconciliation(period)!;
    expect(check.residual).toBeCloseTo(250, 2);
    expect(check.reconciled).toBe(false);
    const exception = buildPeriodExceptions(period).find((item) => item.code === "BRANCH_COST_ALLOCATION_GAP")!;
    expect(exception.label).toBe("فرق توزيع التكاليف على الفروع");
    expect(exception.reviewAmount).toBeCloseTo(250, 2);
  });

  test("a gap inside the tolerance is not raised", () => {
    const period = mashkuk();
    period.summary.totalCharges += 0.04;
    expect(branchCostReconciliation(period)!.reconciled).toBe(true);
  });
});
