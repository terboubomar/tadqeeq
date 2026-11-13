import type { StoredPeriod } from "./periods";

/**
 * مُطابِق's ledger rules: each invoice line's verdict and the period's headline claim difference. Shared by
 * the invoice-check page and the MCP so both say the same thing. Reads the engine's checks; computes no fees.
 */

export const DEFAULT_TOLERANCE = 1; // ريال
/** Differences at or below this (SAR) are rounding: the ledger says the line matches and does not print the amount. */
export const LEDGER_DIFFERENCE_THRESHOLD = 10;

export type LedgerCheck = NonNullable<StoredPeriod["invoice"]["checks"]>[number];
export type LedgerTone = "good" | "bad" | "warn" | "muted";

/** Shown next to a line only when it is not an independent recalculation, so most lines stay clean. */
export const EVIDENCE_CHIP: Record<string, string | undefined> = {
  invoice_only: "من الفاتورة فقط",
  invoice_derived: "مشتق من الفاتورة",
  mixed: "فحص داخلي",
  contract: "مع العقد",
};

const MONEY_TO_RESTAURANT = new Set<string>(["collections", "settlement", "sales", "rejected_sales"]);

/** One ledger line's verdict: a short label and, only above the threshold, the difference (invoice − recalculated). */
export function ledgerVerdict(check: LedgerCheck): { label: string; tone: LedgerTone; amount?: number } {
  const evidence = check.evidence ?? "data";
  if (evidence === "invoice_only") return { label: "يحتاج مستنداً للتحقق", tone: "warn" };
  if (check.invoiced === undefined) return { label: "لم يُقرأ من الفاتورة", tone: "muted" };
  const diff = check.invoiced - check.computed;
  const tolerance = check.tolerance ?? DEFAULT_TOLERANCE;
  if (Math.abs(diff) <= Math.max(tolerance, LEDGER_DIFFERENCE_THRESHOLD)) return { label: "مطابق", tone: "good" };
  if (evidence === "mixed" || evidence === "invoice_derived") return { label: "فرق يحتاج مراجعة", tone: "warn", amount: diff };
  // On money owed to the restaurant (collections, net due, sales) a lower invoice figure is the bad side.
  if (MONEY_TO_RESTAURANT.has(check.category)) {
    return diff < 0 ? { label: "أقل من المحتسب", tone: "bad", amount: diff } : { label: "أكثر من المحتسب", tone: "good", amount: diff };
  }
  return diff > 0 ? { label: "زيادة في الفاتورة", tone: "bad", amount: diff } : { label: "أقل من المحتسب", tone: "good", amount: diff };
}

/** A line the person should look at: an independently checked line that differs, or one missing from the invoice. */
export function ledgerNeedsReview(check: LedgerCheck): boolean {
  if (check.evidence === "invoice_only" || check.evidence === "invoice_derived" || check.evidence === "mixed") return false;
  if (check.invoiced === undefined) return true;
  return Math.abs(check.invoiced - check.computed) > Math.max(check.tolerance ?? DEFAULT_TOLERANCE, LEDGER_DIFFERENCE_THRESHOLD);
}

/** The period's ledger in numbers: which controls exist, the headline claim difference and the line counts. */
export function invoiceLedgerSummary(period: StoredPeriod) {
  const checks = period.invoice?.checks ?? [];
  const hasPdfInvoice =
    period.platform === "hungerstation"
      ? Boolean(period.invoice?.lines?.length)
      : period.platform === "keeta"
        ? Boolean(
            period.invoice?.keetaBranches?.length ||
              period.invoice?.salesCommission !== undefined ||
              period.invoice?.netDue !== undefined ||
              period.invoice?.keetaTaxInvoiceExVat !== undefined,
          )
        : Boolean(period.invoice?.jahezCommissionExVat !== undefined || period.invoice?.totalIncVat !== undefined);
  const hasKeetaExcelControl =
    period.platform === "keeta" &&
    (period.invoice?.keetaExcelInvoiceAmount !== undefined || period.invoice?.keetaExcelPayable !== undefined);
  // Headline variance should only use one non-overlapping settlement control.
  const headlineLabels =
    period.platform === "hungerstation"
      ? new Set(["عمولة المبيعات", "رسوم الدفع الإلكتروني", "عمولات أخرى القابلة للتحقق من البيانات"])
      : period.platform === "keeta"
        ? new Set([
            hasPdfInvoice
              ? "صافي المستحق مقابل فاتورة كيتا"
              : hasKeetaExcelControl
                ? "صافي المستحق مقابل Invoice Details"
                : "صافي التسوية مقابل Order Summary Payable",
          ])
        : new Set(["إجمالي فاتورة جاهز شامل الضريبة"]);
  const independentlyComparable = checks.filter(
    (check) =>
      headlineLabels.has(check.label) &&
      check.invoiced !== undefined &&
      (check.evidence === "data" || check.evidence === "contract" || !check.evidence),
  );
  const totalDiff = independentlyComparable.reduce((sum, check) => {
    const diff = (check.invoiced ?? check.computed) - check.computed;
    const tolerance = Math.max(check.tolerance ?? DEFAULT_TOLERANCE, LEDGER_DIFFERENCE_THRESHOLD);
    return sum + (Math.abs(diff) <= tolerance ? 0 : diff);
  }, 0);
  const flaggedCount = checks.filter(ledgerNeedsReview).length;
  const missingCount = checks.filter((check) => check.invoiced === undefined && check.evidence !== "invoice_only").length;
  const invoiceOnlyCount = checks.filter((check) => check.evidence === "invoice_only").length;
  const flaggedPresent = checks.filter((check) => ledgerNeedsReview(check) && check.invoiced !== undefined).length;
  const matchedCount = Math.max(checks.length - flaggedPresent - missingCount - invoiceOnlyCount, 0);
  return {
    checks,
    hasPdfInvoice,
    hasKeetaExcelControl,
    hasOfficialControl: hasPdfInvoice || hasKeetaExcelControl,
    keetaExcelOnly: period.platform === "keeta" && !hasPdfInvoice && hasKeetaExcelControl,
    totalDiff,
    flaggedCount,
    /** Lines needing review that the invoice does show (flaggedCount minus the missing ones). */
    flaggedPresent,
    missingCount,
    invoiceOnlyCount,
    matchedCount,
  };
}
