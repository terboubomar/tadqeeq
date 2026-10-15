import { keetaCostSplit } from "./keeta-cost";
import type { StoredPeriod } from "./periods";
import { hungerStationAdvertisingExVat, periodPlatformCharges } from "./reporting-metrics";

/**
 * From the platform charges behind platform cost % to the platform's invoice, line by line, so a reader can see why
 * the two totals differ. Display only: every figure is one the audit already saved; nothing is recalculated.
 */
export interface ReconciliationLine {
  label: string;
  amount: number;
  /** start: the charges in the %; less/plus: a step; total: the invoice; residual: what no step explains; info: shown, not counted. */
  kind: "start" | "less" | "plus" | "total" | "residual" | "info";
  note?: string;
}

export interface CostReconciliation {
  lines: ReconciliationLine[];
  residual: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function costReconciliation(period: Pick<StoredPeriod, "platform" | "summary" | "invoice">): CostReconciliation | null {
  const s = period.summary;
  const headline = periodPlatformCharges(period);
  if (headline === null) return null;
  const start: ReconciliationLine = { label: "إجمالي رسوم المنصة (أساس نسبة التكلفة)", amount: round2(headline), kind: "start", note: "بدون الضريبة" };

  if (period.platform === "keeta") {
    const split = keetaCostSplit(s);
    if (!split || !finite(s.keetaCommissionInvoiceExVat)) return null;
    const invoice = round2(s.keetaCommissionInvoiceExVat);
    const advertising = round2(split.taxInvoice - invoice);
    const steps: ReconciliationLine[] = [
      ...(Math.abs(advertising) >= 0.01
        ? [{ label: "الإعلانات (رسوم خدمة الترويج)", amount: advertising, kind: "less" as const, note: "على فاتورة الضريبة كبند مستقل عن العمولة" }]
        : []),
      ...split.outside.map((part) => ({ label: part.label, amount: part.amount, kind: "less" as const, note: "تُخصم من المستحقات خارج فاتورة الضريبة" })),
    ];
    const residual = round2(start.amount - steps.reduce((sum, line) => sum + line.amount, 0) - invoice);
    return {
      residual,
      lines: [
        start,
        ...steps,
        ...(Math.abs(residual) >= 0.01 ? [{ label: "فرق لم يُفسَّر", amount: residual, kind: "residual" as const }] : []),
        { label: "فاتورة العمولة بدون الضريبة", amount: invoice, kind: "total" },
      ],
    };
  }

  const invoice = period.invoice as { totalExVat?: number; vat?: number; totalIncVat?: number; cpc?: number } | null | undefined;
  if (!invoice || !finite(invoice.totalExVat)) return null;
  const invoiceExVat = round2(invoice.totalExVat);
  const advertising = round2(hungerStationAdvertisingExVat(period) ?? 0);
  const residual = round2(start.amount - advertising - invoiceExVat);
  const lines: ReconciliationLine[] = [
    start,
    ...(Math.abs(advertising) >= 0.01
      ? [{ label: "إعلانات CPC بدون الضريبة", amount: advertising, kind: "less" as const, note: "فاتورة إعلانات منفصلة عن فاتورة المنصة" }]
      : []),
    ...(Math.abs(residual) >= 0.01
      ? [{ label: "فرق بين رسوم التدقيق والفاتورة", amount: residual, kind: "residual" as const, note: "تفاصيله في دفتر المطابقة" }]
      : []),
    { label: "فاتورة المنصة بدون الضريبة", amount: invoiceExVat, kind: "total" },
  ];
  if (finite(invoice.vat) && finite(invoice.totalIncVat)) {
    lines.push(
      { label: "ضريبة القيمة المضافة", amount: round2(invoice.vat), kind: "plus", note: "خارج نسبة التكلفة" },
      { label: "فاتورة المنصة شاملة الضريبة", amount: round2(invoice.totalIncVat), kind: "total" },
    );
  }
  if (period.platform === "hungerstation" && finite(invoice.cpc)) {
    lines.push({ label: "فاتورة الإعلانات CPC", amount: round2(invoice.cpc), kind: "info", note: "شاملة الضريبة · داخل نسبة التكلفة بدون ضريبتها" });
  }
  return { lines, residual };
}
