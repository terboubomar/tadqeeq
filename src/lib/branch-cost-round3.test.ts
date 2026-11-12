import { describe, expect, test } from "bun:test";

import { buildPeriodExceptions } from "./exceptions";
import { branchPerformance, periodHeadline, periodReadout } from "./mcp/readout";
import type { StoredPeriod } from "./periods";
import {
  MERCHANT_FUNDED_DISCOUNTS,
  advertisingAllocation,
  branchCostReconciliation,
  branchPlatformCost,
  merchantFundedDiscounts,
  periodPlatformCharges,
  unallocatedPlatformCharges,
} from "./reporting-metrics";

const base = { period_start: "2026-10-01", period_end: "2026-10-31", created_at: "2026-11-08", daily: [] };

/**
 * Past - Malqa, HungerStation, October 2026 (period 7f74e706): one branch whose invoice section prints
 * «رسوم حملات التوصيل المجاني» 295.65 (170 orders × 1.74), and 6,799.97 of CPC.
 */
function pastMalqa(): StoredPeriod {
  const recomputed = 54908.6; // the branch's recomputed charges, without its invoice-only line or CPC
  return {
    ...base,
    id: "7f74e706-c81c-4661-a5cc-779caa7126b8",
    label: "Past Al malqa HS Oct",
    platform: "hungerstation",
    summary: { orders: 2948, grossSales: 200282.69, netSales: 174158.86, commission: 32011.14, commissionPct: 0.18, invoiceOnlyExtras: 295.65, totalCharges: recomputed + 295.65 },
    branches: [
      {
        branch: "Past - Malqa",
        branchId: "132263",
        invoiceBranchName: "Past - Malqa",
        orders: 2948,
        grossSales: 200282.69,
        netSales: 174158.86,
        commission: 32011.14,
        commissionPct: 0.18,
        totalCharges: recomputed,
        invoiceOnlyBranchCharges: 295.65,
      },
    ],
    invoice: {
      cpc: 7819.97,
      cpcBranches: [{ branch: "Past - Malqa", amountExVat: 6799.97, vat: 1020 }],
      branches: [{ branch: "Past - Malqa", invoiceOnlyCharges: 295.65, invoiceOnlyItems: [{ label: "رسوم حملات التوصيل المجاني", amount: 295.65 }] }],
    },
  } as unknown as StoredPeriod;
}

/** Mashkuk Bahab, October 2026: the same line printed only in the consolidated summary (platform level). */
function mashkukPlatformLevel(): StoredPeriod {
  return {
    ...base,
    id: "8bf502ac-8c67-452a-8937-4dfc682f2fde",
    label: "Mashkuk bihub Oct HS",
    platform: "hungerstation",
    summary: { orders: 12295, grossSales: 664190.14, netSales: 577556.64, commission: 94780.1, commissionPct: 0.164, invoiceOnlyExtras: 1132.17, totalCharges: 205726.84 + 1132.17 },
    branches: [
      { branch: "Mashkuk Bahab - Sudayr", branchId: "1", orders: 1, grossSales: 0, netSales: 100000, commission: 0, commissionPct: 0, totalCharges: 100000 },
      { branch: "Mashkuk Bahab Saihat   An Nur", branchId: "2", orders: 1, grossSales: 0, netSales: 100000, commission: 0, commissionPct: 0, totalCharges: 105726.84 },
    ],
    invoice: {
      cpc: 0,
      cpcBranches: [
        { branch: "Mashkuk Bahab - Sudayr", amountExVat: 799.64, vat: 0 },
        { branch: "Mashkuk Bahab Saihat - An Nur", amountExVat: 1799.67, vat: 0 },
      ],
      unallocatedCharges: [{ label: "رسوم حملات التوصيل المجاني", amount: 1132.17 }],
    },
  } as unknown as StoredPeriod;
}

describe("Issue 1: invoice-only charges printed in a branch section are on that branch", () => {
  test("Past Malqa: the 295.65 is in the branch cost and listed on the branch", () => {
    const period = pastMalqa();
    const cost = branchPlatformCost(period, period.branches[0]!)!;
    expect(cost.invoiceOnlyCharges).toBeCloseTo(295.65, 2);
    expect(cost.platformCost).toBeCloseTo(62004.22, 2);
    expect(cost.advertisingExVat).toBeCloseTo(6799.97, 2);
    expect(cost.platformCostExclAds).toBeCloseTo(55204.25, 2);

    const [branch] = branchPerformance(period);
    expect(branch).toMatchObject({ platform_cost_sar: 62004.22 });
    expect(branch!.invoice_only_charges).toEqual([
      { line: "رسوم حملات التوصيل المجاني", amount_sar: 295.65, allocation_rule: "direct_to_branch: printed in that branch's invoice section" },
    ]);
  });

  test("Past Malqa reconciles with residual 0 and no allocation exception; nothing is counted twice", () => {
    const period = pastMalqa();
    const check = branchCostReconciliation(period)!;
    expect(check.total).toBeCloseTo(62004.22, 2);
    expect(check.branches).toBeCloseTo(62004.22, 2);
    expect(check.unallocated).toBe(0);
    expect(check.residual).toBe(0);
    expect(buildPeriodExceptions(period).map((item) => item.code)).not.toContain("BRANCH_COST_ALLOCATION_GAP");
  });

  test("a single unnamed invoice section still belongs to the single branch", () => {
    const period = pastMalqa();
    period.branches[0]!.invoiceBranchName = undefined;
    (period.invoice.branches as Array<{ branch?: string }>)[0]!.branch = undefined;
    expect(branchPerformance(period)[0]!.invoice_only_charges).toHaveLength(1);
    expect(branchCostReconciliation(period)!.residual).toBe(0);
  });

  test("Mashkuk: the platform-level line stays unallocated and the period still reconciles", () => {
    const period = mashkukPlatformLevel();
    const check = branchCostReconciliation(period)!;
    expect(check.unallocated).toBeCloseTo(1132.17, 2);
    expect(check.residual).toBe(0);
    for (const branch of branchPerformance(period)) expect(branch.invoice_only_charges).toEqual([]);
  });
});

/**
 * Past Keeta, October 2026 (period 9228003b), 30 branches, here as three that add up to the period's figures:
 * everything Keeta deducted 662,463.99 = commission 271,112.48 + bank fees 46,853.37 + delivery support 296,111.30
 * + advertising 37,657.62 + item subsidy 10,294.44 + POS 434.78 (all without VAT).
 */
function pastKeeta(): StoredPeriod {
  const rows = [
    { branch: "Past Al Malqa Riyadh (🔥Free Delivery 🔥)", total: 300000, ads: 17000, item: 5000, sales: 600000 },
    { branch: "Past - Dammam Uhud (🔥Free Delivery🏍️🏍️)", total: 250000, ads: 15000, item: 4000, sales: 500000 },
    { branch: "PAST DHAHRAH LABAN (🔥Free Delivery 🔥)", total: 112463.99, ads: 5657.62, item: 1294.44, sales: 585854.56 },
  ];
  return {
    ...base,
    id: "9228003b-2de0-46d7-8f3f-732ec9ce3162",
    label: "Past Keeta Oct",
    platform: "keeta",
    summary: {
      orders: 28483,
      grossSales: 1938774.07,
      netSales: 1176940.48,
      commission: 271112.48,
      commissionPct: 0.16,
      totalCharges: 662463.99,
      keetaTotalCostExVat: 662463.99,
      keetaSalesExVat: 1685854.56,
      keetaMerchantAdExVat: 37657.62,
      keetaProductCampaignExVat: 10294.44,
      keetaPosFeesExVat: 434.78,
      keetaSourcePayable: 1176940.48,
      keetaPlatformCostPct: 662463.99 / 1685854.56,
    },
    branches: rows.map((row, index) => ({
      branch: row.branch,
      branchId: String(index),
      orders: 1,
      grossSales: row.sales * 1.15,
      netSales: 0,
      commission: 0,
      commissionPct: 0,
      totalCharges: row.total,
      keetaTotalCostExVat: row.total,
      keetaSalesExVat: row.sales,
      keetaMerchantAdExVat: row.ads,
      keetaProductCampaignExVat: row.item,
    })),
    invoice: {},
  } as unknown as StoredPeriod;
}

describe("Issue 2: Keeta advertising per branch", () => {
  test("each branch shows its own ad spend and the branches add up to the period's 37,657.62", () => {
    const period = pastKeeta();
    const branches = branchPerformance(period);
    const malqa = branches.find((b) => b.branch.startsWith("Past Al Malqa"))!;
    expect(malqa.advertising_ex_vat_sar).toBe(17000);
    expect(malqa.platform_cost_excl_ads_sar).toBe(malqa.platform_cost_sar! - 17000);
    expect(branches.reduce((sum, b) => sum + (b.advertising_ex_vat_sar ?? 0), 0)).toBeCloseTo(37657.62, 2);
    expect(advertisingAllocation(period)).toMatchObject({ unattributed: 0 });
    expect(unallocatedPlatformCharges(period)).toEqual([]);
  });

  test("advertising no branch carries is unallocated as advertising_unattributed, not spread", () => {
    const period = pastKeeta();
    period.summary.keetaMerchantAdExVat = 37657.62 + 120;
    period.summary.keetaTotalCostExVat = 662463.99 + 120;
    expect(unallocatedPlatformCharges(period)).toEqual([{ label: "إعلانات غير منسوبة إلى فرع", amount: 120, allocation: "advertising_unattributed" }]);
    expect(branchCostReconciliation(period)!.residual).toBe(0);
  });
});

describe("Issue 3: merchant-funded discounts are not platform cost", () => {
  test("Past Keeta: total platform charges 662,463.99 − item subsidy 10,294.44 = 652,169.55", () => {
    const period = pastKeeta();
    expect(periodPlatformCharges(period)).toBeCloseTo(652169.55, 2);
    const headline = periodHeadline(period);
    expect(headline.total_platform_charges_sar).toBe(652169.55);
    expect(headline.platform_cost_pct).toBeCloseTo(652169.55 / 1685854.56, 4);
    expect(headline.platform_cost_pct_of_net).toBe(headline.platform_cost_pct);
    expect(headline).toMatchObject({ merchant_funded_discounts_sar: 10294.44, merchant_funded_discounts_label: "خصومات ممولة من المطعم" });
  });

  test("POS device fees stay inside platform charges", () => {
    const period = pastKeeta();
    // 652,169.55 still contains the 434.78 of POS fees: only the item subsidy left the total.
    expect(662463.99 - (periodPlatformCharges(period) ?? 0)).toBeCloseTo(10294.44, 2);
  });

  test("each branch leaves out its own item subsidy and shows it on its own line; the period still reconciles", () => {
    const period = pastKeeta();
    const malqa = branchPerformance(period).find((b) => b.branch.startsWith("Past Al Malqa"))!;
    expect(malqa).toMatchObject({ platform_cost_sar: 295000, merchant_funded_discounts_sar: 5000 });
    const check = branchCostReconciliation(period)!;
    expect(check.total).toBeCloseTo(652169.55, 2);
    expect(check.branches).toBeCloseTo(652169.55, 2);
    expect(check.residual).toBe(0);
    expect(periodReadout(period, "https://tadqeeq.app").costliest_branches[0]).toMatchObject({ merchant_funded_discounts_sar: 5000 });
  });

  test("one classification map covers all three platforms", () => {
    expect(MERCHANT_FUNDED_DISCOUNTS.keeta.map((item) => item.field)).toEqual(["keetaProductCampaignExVat"]);
    expect(MERCHANT_FUNDED_DISCOUNTS.hungerstation.map((item) => item.field)).toEqual(["restaurantFoodDiscount"]);
    expect(MERCHANT_FUNDED_DISCOUNTS.jahez).toEqual([]);
    // HungerStation's restaurant food discount was never in its charges: shown, nothing subtracted.
    const hs = mashkukPlatformLevel();
    (hs.summary as { restaurantFoodDiscount?: number }).restaurantFoodDiscount = 74259.18;
    expect(merchantFundedDiscounts("hungerstation", hs.summary)).toBe(74259.18);
    expect(merchantFundedDiscounts("hungerstation", hs.summary, true)).toBe(0);
    expect(periodPlatformCharges(hs)).toBeCloseTo(205726.84 + 1132.17 + 799.64 + 1799.67, 2);
  });
});
