import { describe, expect, test } from "bun:test";

import { costReconciliation } from "./cost-reconciliation";
import type { StoredPeriod } from "./periods";

const period = (input: Partial<StoredPeriod>) => ({ summary: {}, invoice: {}, ...input }) as StoredPeriod;

describe("costReconciliation", () => {
  test("Keeta: the charges in the % come down to the commission invoice with nothing left over", () => {
    // September 2026 PAST figures (excluding VAT).
    const result = costReconciliation(
      period({
        platform: "keeta",
        summary: {
          totalCharges: 587_849.582608695,
          keetaCommissionInvoiceExVat: 551_878.8434782602,
          keetaMerchantAdExVat: 31_229.182608695653,
          keetaProductCampaignExVat: 1_698.0782608695654,
          keetaPosFeesExVat: 3_043.478260869565,
          keetaCompensationExVat: 0,
        } as StoredPeriod["summary"],
      }),
    )!;
    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["start", 587_849.58],
      ["less", 31_229.18],
      ["less", 1_698.08],
      ["less", 3_043.48],
      ["total", 551_878.84],
    ]);
    expect(result.residual).toBe(0);
  });

  test("HungerStation: CPC advertising without VAT inside the %, a named residual, VAT on top", () => {
    const result = costReconciliation(
      period({
        platform: "hungerstation",
        summary: { totalCharges: 1000 } as StoredPeriod["summary"],
        invoice: { totalExVat: 990, vat: 148.5, totalIncVat: 1138.5, cpc: 70_624.35 } as StoredPeriod["invoice"],
      }),
    )!;
    expect(result.residual).toBe(10);
    expect(result.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["start", 62_412.48],
      ["less", 61_412.48],
      ["residual", 10],
      ["total", 990],
      ["plus", 148.5],
      ["total", 1138.5],
      ["info", 70_624.35],
    ]);
  });

  test("nothing to reconcile without the invoice figures", () => {
    expect(costReconciliation(period({ platform: "jahez", summary: { totalCharges: 10 } as StoredPeriod["summary"] }))).toBeNull();
    expect(costReconciliation(period({ platform: "keeta", summary: { totalCharges: 10 } as StoredPeriod["summary"] }))).toBeNull();
  });
});
