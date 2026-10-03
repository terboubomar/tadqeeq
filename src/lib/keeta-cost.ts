import { roundMoney } from "./analysis/parse";
import type { Summary } from "./analysis/types";
import { money } from "./format";

/**
 * Keeta's total deductions (excluding VAT) split into what is on Keeta's tax invoice
 * (commission invoice + promotion service fee) and what Keeta deducts from the payout
 * without invoicing it (item discounts you fund, POS installments, compensation, other).
 * Display only: every figure comes from the audit summary. Each line is rounded to halalas
 * before adding, as Keeta's invoice does, so the parts add up to the displayed total.
 */
export interface KeetaCostSplit {
  taxInvoice: number;
  outside: Array<{ label: string; amount: number }>;
}

export function keetaCostSplit(s: Summary): KeetaCostSplit | null {
  if (s.keetaCommissionInvoiceExVat === undefined) return null;
  const taxInvoice = roundMoney(roundMoney(s.keetaCommissionInvoiceExVat) + roundMoney(s.keetaMerchantAdExVat ?? 0));
  const parts = [
    { label: "خصومات أصناف", amount: roundMoney(s.keetaProductCampaignExVat ?? 0) },
    { label: "أقساط POS", amount: roundMoney(s.keetaPosFeesExVat ?? 0) },
    { label: "تعويضات", amount: roundMoney(s.keetaCompensationExVat ?? 0) },
  ];
  const known = parts.reduce((sum, part) => sum + part.amount, 0);
  const other = roundMoney(roundMoney(s.totalCharges) - taxInvoice - known);
  if (Math.abs(other) >= 0.01) parts.push({ label: "أخرى", amount: other });
  return { taxInvoice, outside: parts.filter((part) => Math.abs(part.amount) >= 0.01) };
}

/** Total deducted outside the tax invoice, and its parts: "خصومات أصناف 1,698.08 · أقساط POS 3,043.48". */
export function keetaOutsideInvoice(s: Summary): { total: number; hint: string } | null {
  const split = keetaCostSplit(s);
  if (!split) return null;
  return {
    total: roundMoney(split.outside.reduce((sum, part) => sum + part.amount, 0)),
    hint: split.outside.map((part) => `${part.label} ${money(part.amount)}`).join(" · "),
  };
}
