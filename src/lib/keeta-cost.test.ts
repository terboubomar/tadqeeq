import { expect, test } from "bun:test";

import type { Summary } from "./analysis/types";
import { keetaCostSplit, keetaOutsideInvoice } from "./keeta-cost";

// September 2026 PAST figures (excluding VAT).
const summary = {
  totalCharges: 587_849.582608695,
  keetaCommissionInvoiceExVat: 551_878.8434782602,
  keetaMerchantAdExVat: 31_229.182608695653,
  keetaProductCampaignExVat: 1_698.0782608695654,
  keetaPosFeesExVat: 3_043.478260869565,
  keetaCompensationExVat: 0,
} as Summary;

test("splits Keeta's deductions into the tax invoice and what is deducted outside it", () => {
  const split = keetaCostSplit(summary)!;
  expect(split.taxInvoice).toBe(583_108.02);
  expect(split.outside.map((part) => part.label)).toEqual(["خصومات أصناف", "أقساط POS"]);
  // The shown parts add up to the shown total (587,849.58) to the halala.
  expect(Math.round((split.taxInvoice + split.outside.reduce((sum, part) => sum + part.amount, 0)) * 100)).toBe(58_784_958);
  expect(keetaOutsideInvoice(summary)).toEqual({ total: 4_741.56, hint: "خصومات أصناف 1,698.08 · أقساط POS 3,043.48" });
});

test("anything not itemised is shown as other, so the parts always add up", () => {
  const split = keetaCostSplit({ ...summary, totalCharges: summary.totalCharges + 100 })!;
  expect(split.outside.at(-1)).toEqual({ label: "أخرى", amount: 100 });
});

test("no split for periods without the Keeta decomposition", () => {
  expect(keetaCostSplit({ totalCharges: 10 } as Summary)).toBeNull();
});
