import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  branchBreakdown,
  chargeLineSource,
  combinedBranchBreakdown,
  cpcBranchesFromAds,
  DOCUMENTED_CHARGE_LINE_IDS,
  pickAdsAnalysisForPeriod,
} from "./charges-sources";
import type { MarketplaceChargeLine } from "./charges-mapper";
import type { StoredPeriod } from "./periods";

const PREFIX_IDS = new Set(["hs-unmapped-invoice-extra-"]);

function mapperLineIds(): string[] {
  const source = readFileSync(new URL("./charges-mapper.ts", import.meta.url), "utf8");
  return [...source.matchAll(/id: "([a-z-]+)"/g)].map((match) => match[1]!);
}

const line = (id: string, label = "بند"): MarketplaceChargeLine => ({
  id,
  label,
  category: "unmapped",
  amount: 10,
  scope: "audit_total",
  source: "fallback",
  evidence: "data",
  fundingSource: "unknown",
  mapped: false,
});

const period = { label: "P", summary: { bankRate: 0.02, bankRateSource: "manual" }, branches: [] } as unknown as StoredPeriod;

describe("charge line sources", () => {
  test("every line id the mapper can produce has a documented source", () => {
    const missing = mapperLineIds().filter((id) => !PREFIX_IDS.has(id) && !DOCUMENTED_CHARGE_LINE_IDS.includes(id));
    expect(missing).toEqual([]);
  });

  test("documented sources name a file and say how the amount is computed", () => {
    for (const id of DOCUMENTED_CHARGE_LINE_IDS) {
      const source = chargeLineSource(line(id), period);
      expect(source.file.length).toBeGreaterThan(0);
      expect(source.formula.length).toBeGreaterThan(0);
    }
  });

  test("run-time lines get a specific explanation, not the bare fallback", () => {
    expect(chargeLineSource(line("hs-unmapped-invoice-extra-1", "Printer rental"), period).formula).toContain("Printer rental");
    expect(chargeLineSource(line("keeta-unmapped-reconciliation-residual"), period).file).not.toBe("fallback");
  });

  test("card fee formula shows the contract rate", () => {
    expect(chargeLineSource(line("hs-card-payment-fees"), period).formula).toContain("2.00%");
  });
});

describe("branch breakdown", () => {
  const branch = (name: string, extra: Record<string, unknown>) => ({ branch: name, branchId: name, totalCharges: 0, ...extra });

  test("lists every branch, zeros included, with a total", () => {
    const p = { ...period, branches: [branch("A", { commission: 70 }), branch("B", { commission: 30 }), branch("C", { commission: 0 })] } as unknown as StoredPeriod;
    const split = branchBreakdown(line("hs-commission"), p, []);
    expect(split.rows.map((r) => r.name)).toEqual(["A", "B", "C"]);
    expect(split.total).toBe(100);
  });

  test("Keeta unmapped other expenses split per branch without POS fees", () => {
    const p = {
      ...period,
      branches: [branch("A", { keetaOtherExpensesExVat: 50, keetaPosFeesExVat: 20 }), branch("B", { keetaOtherExpensesExVat: 10, keetaPosFeesExVat: 0 })],
    } as unknown as StoredPeriod;
    const split = branchBreakdown(line("keeta-unmapped-other"), p, []);
    expect(split.rows).toEqual([{ name: "A", value: 30 }, { name: "B", value: 10 }]);
  });

  test("HungerStation invoice-only charges come from the invoice branches, named by the matched order branch", () => {
    const p = {
      ...period,
      branches: [branch("فرع العليا", { invoiceBranchName: "Olaya" })],
      invoice: { branches: [{ branch: "Olaya", invoiceOnlyCharges: 120 }, { branch: "Malqa", invoiceOnlyCharges: 80 }] },
    } as unknown as StoredPeriod;
    const extras = [line("hs-unmapped-invoice-extra-1", "الطابعات"), line("hs-unmapped-invoice-extra-2", "الاشتراك الشهري")];
    const split = branchBreakdown(extras[0]!, p, extras);
    expect(split.rows).toEqual([{ name: "فرع العليا", value: 120 }, { name: "Malqa", value: 80 }]);
    expect(split.caption).toContain("مجموع");
    // A category total counts the shared invoice split once, not once per line.
    expect(combinedBranchBreakdown(extras, p, extras)?.total).toBe(200);
  });

  test("the closing difference is split only when the branch figures add up to it", () => {
    const mapped: MarketplaceChargeLine = { ...line("hs-commission"), mapped: true, category: "commission", amount: 100 };
    const residual = { ...line("hungerstation-unmapped-reconciliation-residual"), amount: 15 };
    const good = {
      ...period,
      branches: [branch("A", { commission: 60, totalCharges: 70 }), branch("B", { commission: 40, totalCharges: 45 })],
    } as unknown as StoredPeriod;
    expect(branchBreakdown(residual, good, [mapped, residual]).rows).toEqual([{ name: "A", value: 10 }, { name: "B", value: 5 }]);

    const off = { ...period, branches: [branch("A", { commission: 60, totalCharges: 60 }), branch("B", { commission: 40, totalCharges: 40 })] } as unknown as StoredPeriod;
    const split = branchBreakdown(residual, off, [mapped, residual]);
    expect(split.rows).toEqual([]);
    expect(split.unavailable).toBeTruthy();
  });

  test("lines with no branch data say so instead of showing rows", () => {
    const split = branchBreakdown(line("hs-cpc"), { ...period, branches: [branch("A", {})] } as unknown as StoredPeriod, []);
    expect(split.rows).toEqual([]);
    expect(split.unavailable).toBeTruthy();
  });
});

describe("CPC by branch from the ads report", () => {
  const p = {
    ...period,
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    branches: [
      { branch: "فرع العليا", branchId: "500000" },
      { branch: "فرع الملقا", branchId: "500007" },
      { branch: "فرع النرجس", branchId: "500009" },
    ],
  } as unknown as StoredPeriod;

  test("picks the saved analysis that covers most of the period", () => {
    const analyses = [
      { id: "aug", dateFrom: "2026-08-01", dateTo: "2026-08-31" },
      { id: "sep-half", dateFrom: "2026-09-15", dateTo: "2026-10-10" },
      { id: "sep", dateFrom: "2026-09-01", dateTo: "2026-09-30" },
    ];
    expect(pickAdsAnalysisForPeriod(analyses, p)?.id).toBe("sep");
    expect(pickAdsAnalysisForPeriod([analyses[0]!], p)).toBeNull();
  });

  test("sums spend per branch within the period, matched by HS Branch ID, every branch listed", () => {
    const split = cpcBranchesFromAds(
      {
        dateFrom: "2026-08-25",
        dateTo: "2026-09-30",
        campaigns: [
          { date: "2026-09-02", restaurantId: "500000", outletName: "Delta - Branch 1", spent: 100 },
          { date: "2026-09-03", restaurantId: "500000", outletName: "Delta - Branch 1", spent: 50 },
          { date: "2026-09-03", restaurantId: "500007", outletName: "Alpha - Branch 2", spent: 40 },
          { date: "2026-08-30", restaurantId: "500007", outletName: "Alpha - Branch 2", spent: 999 },
          { date: "2026-09-04", restaurantId: "777", outletName: "Unknown outlet", spent: 10 },
        ],
      },
      p,
      230,
    );
    expect(split.rows).toEqual([
      { name: "فرع العليا", value: 150 },
      { name: "فرع الملقا", value: 40 },
      { name: "Unknown outlet", value: 10 },
      { name: "فرع النرجس", value: 0 },
    ]);
    expect(split.total).toBe(200);
    expect(split.caption).toContain("230.00");
  });
});
