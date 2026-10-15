import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "@/lib/periods";

import {
  advertisingExVat,
  branchPlatformCharges,
  displayBranchName,
  PLATFORM_COST_FORMULA,
  periodPlatformCharges,
  periodPlatformChargesExclAds,
  platformCostPct,
  totalPlatformCharges,
  vatBreakdown,
} from "./reporting-metrics";

/** Figures from the HungerStation (HS-2026/9-4871148) and Keeta September 2026 audits. */
const HS_SUMMARY = { totalCharges: 318103.3101630429, grossSales: 1327130.543999998 };
const KEETA_SUMMARY = { totalCharges: 587849.582608695, keetaTotalCostExVat: 587849.582608695, grossSales: 1860493.8399999999 };

const period = (platform: StoredPeriod["platform"], summary: object, invoice: object | null) =>
  ({ platform, summary, invoice }) as unknown as StoredPeriod;

describe("platform cost %", () => {
  test("is total platform charges ÷ gross sales on every platform", () => {
    expect(PLATFORM_COST_FORMULA).toBe("total_platform_charges / gross_sales");
    const hs = platformCostPct(totalPlatformCharges("hungerstation", HS_SUMMARY as never), HS_SUMMARY.grossSales);
    const keeta = platformCostPct(totalPlatformCharges("keeta", KEETA_SUMMARY as never), KEETA_SUMMARY.grossSales);
    expect(Number(hs!.toFixed(4))).toBe(0.2397);
    expect(Number(keeta!.toFixed(4))).toBe(0.316);
  });

  test("is null rather than a guess when sales are missing or zero", () => {
    expect(platformCostPct(100, 0)).toBeNull();
    expect(platformCostPct(undefined, 100)).toBeNull();
    expect(totalPlatformCharges("hungerstation", null)).toBeNull();
  });
});

describe("platform cost % includes advertising on every platform", () => {
  const KEETA_WITH_ADS = { ...KEETA_SUMMARY, keetaMerchantAdExVat: 31229.18 };

  test("HungerStation adds its CPC advertising invoice without VAT", () => {
    const hs = period("hungerstation", HS_SUMMARY, { cpc: 70624.35 });
    expect(advertisingExVat(hs)).toBeCloseTo(61412.48, 2);
    expect(periodPlatformCharges(hs)).toBeCloseTo(379515.79, 2);
    expect(Number(platformCostPct(periodPlatformCharges(hs), HS_SUMMARY.grossSales)!.toFixed(4))).toBe(0.286);
    expect(Number(platformCostPct(periodPlatformChargesExclAds(hs), HS_SUMMARY.grossSales)!.toFixed(4))).toBe(0.2397);
  });

  test("HungerStation uses the CPC invoice's branch lines without VAT when they were read", () => {
    const hs = period("hungerstation", HS_SUMMARY, {
      cpc: 1150,
      cpcBranches: [
        { branch: "PAST - Uhud", amountExVat: 600, vat: 90 },
        { branch: "Motto - Uhud", amountExVat: 400, vat: 60 },
      ],
    });
    expect(advertisingExVat(hs)).toBe(1000);
    const uhud = { branch: "PAST - Uhud", totalCharges: 35868.06 };
    expect(branchPlatformCharges(hs, uhud as never)).toBeCloseTo(36468.06, 2);
    expect(branchPlatformCharges(hs, { branch: "Other", totalCharges: 10 } as never)).toBe(10);
  });

  test("without a CPC invoice HungerStation has no advertising to add", () => {
    const hs = period("hungerstation", HS_SUMMARY, null);
    expect(advertisingExVat(hs)).toBe(0);
    expect(periodPlatformCharges(hs)).toBe(HS_SUMMARY.totalCharges);
  });

  test("Keeta's advertising is already in its charges; the excl-ads view removes it", () => {
    const keeta = period("keeta", KEETA_WITH_ADS, null);
    expect(periodPlatformCharges(keeta)).toBe(KEETA_SUMMARY.keetaTotalCostExVat);
    expect(advertisingExVat(keeta)).toBe(31229.18);
    expect(Number(platformCostPct(periodPlatformChargesExclAds(keeta), KEETA_SUMMARY.grossSales)!.toFixed(4))).toBe(0.2992);
  });
});

describe("VAT shown separately", () => {
  test("uses the invoice's own figures when it printed them", () => {
    const breakdown = vatBreakdown(period("hungerstation", HS_SUMMARY, { totalExVat: 318103.4, vat: 47715.51, totalIncVat: 365818.91 }));
    expect(breakdown).toEqual({ totalChargesExVat: 318103.4, vat15Pct: 47715.51, totalChargesIncVat: 365818.91, source: "invoice" });
  });

  test("computes 15% and says so when there is no invoice", () => {
    const breakdown = vatBreakdown(period("keeta", { totalCharges: 1000, keetaTotalCostExVat: 1000 }, null));
    expect(breakdown).toEqual({ totalChargesExVat: 1000, vat15Pct: 150, totalChargesIncVat: 1150, source: "computed" });
  });
});

describe("branch display names", () => {
  test("drops emoji and promotional text in parentheses", () => {
    expect(displayBranchName("Past Al Malqa Riyadh (🔥Free Delivery 🔥)")).toBe("Past Al Malqa Riyadh");
    expect(displayBranchName("PAST DHAHRAH LABAN (🔥Free Delivery 🔥)")).toBe("PAST DHAHRAH LABAN");
    expect(displayBranchName("مطعم الروضة (خصم 20%)")).toBe("مطعم الروضة");
  });

  test("keeps ordinary parentheses and plain names as they are", () => {
    expect(displayBranchName("Past (Olaya)")).toBe("Past (Olaya)");
    expect(displayBranchName("PAST - Al Nasim")).toBe("PAST - Al Nasim");
  });

  test("drops punctuation the PDF text left at the end", () => {
    expect(displayBranchName("Motto - Uhud ' - ' /")).toBe("Motto - Uhud");
  });

  test("never empties a name", () => {
    expect(displayBranchName("🔥")).toBe("🔥");
    expect(displayBranchName("")).toBe("");
  });
});
