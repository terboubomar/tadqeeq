import type { StoredPeriod } from "@/lib/periods";

/**
 * Reporting metrics derived from the engine's saved totals, for display and the AI/MCP readouts.
 * Nothing here recalculates the audit: each value is a ratio or a label over numbers the engine
 * already produced, so the accounting results stay exactly as stored.
 */

/** The one definition of platform cost %, the same on every platform. */
export const PLATFORM_COST_FORMULA = "total_platform_charges / gross_sales";
export const PLATFORM_COST_FORMULA_AR = "إجمالي رسوم المنصة بدون الضريبة ÷ إجمالي المبيعات";
/** What the % includes, stated wherever it is shown (reports, dashboard, weekly email, AI readouts). */
export const PLATFORM_COST_DEFINITION_AR =
  "تكلفة المنصة = إجمالي رسوم المنصة بدون الضريبة ÷ إجمالي المبيعات، بالتعريف نفسه لكل المنصات. لا تشمل الضريبة. تشمل إعلانات كيتا لأنها تُخصم من المستحقات، ولا تشمل إعلانات هنقرستيشن (CPC) لأنها فاتورة منفصلة.";
export const PLATFORM_COST_DEFINITION =
  "Platform cost % = total platform charges excluding VAT ÷ gross sales, the same on every platform. Excludes VAT. Includes Keeta advertising (deducted from the payout); excludes HungerStation CPC advertising (a separate invoice).";

const VAT_RATE = 0.15;

type Summary = StoredPeriod["summary"];

/** Total platform charges excluding VAT, as the engine reports them for the platform. */
export function totalPlatformCharges(platform: StoredPeriod["platform"], summary: Partial<Summary> | null | undefined): number | null {
  if (!summary) return null;
  const value = platform === "keeta" ? (summary.keetaTotalCostExVat ?? summary.totalCharges) : summary.totalCharges;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** total platform charges ÷ gross sales; null when either is missing or sales are zero. */
export function platformCostPct(totalCharges: number | null | undefined, grossSales: number | null | undefined): number | null {
  if (typeof totalCharges !== "number" || typeof grossSales !== "number") return null;
  if (!Number.isFinite(totalCharges) || !Number.isFinite(grossSales) || grossSales === 0) return null;
  return totalCharges / grossSales;
}

export interface VatBreakdown {
  totalChargesExVat: number;
  vat15Pct: number;
  totalChargesIncVat: number;
  /** "invoice": the three figures printed on the platform invoice; "computed": 15% of the ex-VAT charges. */
  source: "invoice" | "computed";
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Charges excluding VAT, the VAT and the total including it: the invoice's own figures when it has them. */
export function vatBreakdown(period: Pick<StoredPeriod, "platform" | "summary" | "invoice">): VatBreakdown | null {
  const invoice = period.invoice as { totalExVat?: number; vat?: number; totalIncVat?: number } | null | undefined;
  if (invoice && finite(invoice.totalExVat) && finite(invoice.vat) && finite(invoice.totalIncVat)) {
    return { totalChargesExVat: invoice.totalExVat, vat15Pct: invoice.vat, totalChargesIncVat: invoice.totalIncVat, source: "invoice" };
  }
  const exVat = totalPlatformCharges(period.platform, period.summary);
  if (exVat === null) return null;
  const vat = Math.round(exVat * VAT_RATE * 100) / 100;
  return { totalChargesExVat: exVat, vat15Pct: vat, totalChargesIncVat: exVat + vat, source: "computed" };
}

const PROMO_WORDS = /free\s*delivery|delivery|discount|offer|off\b|promo|deal|sale|new|%|عرض|عروض|خصم|توصيل|مجان|جديد/i;
// Pictographs, flag letters, and the joiners/variation selectors/keycap mark that combine with them.
const EMOJI_CLASS = "(?:\\p{Extended_Pictographic}|[\\u{1F1E6}-\\u{1F1FF}]|\\u{FE0E}|\\u{FE0F}|\\u{200D}|\\u{20E3})";
const EMOJI = new RegExp(EMOJI_CLASS, "gu");
const HAS_EMOJI = new RegExp(EMOJI_CLASS, "u");

/**
 * The branch name to show people: the platform's raw name without emoji, without promotional text
 * in parentheses, and without stray punctuation the PDF text left at the end. The raw name is kept
 * as it is for matching and the audit trail; this is for display only.
 */
export function displayBranchName(raw: string | null | undefined): string {
  const original = String(raw ?? "").trim();
  if (!original) return original;
  const withoutPromo = original.replace(/\(([^()]*)\)/g, (group, inner: string) =>
    HAS_EMOJI.test(inner) || PROMO_WORDS.test(inner.replace(EMOJI, "")) ? " " : group,
  );
  const cleaned = withoutPromo
    .replace(EMOJI, " ")
    .replace(/(\s+[^\p{L}\p{N}()]+)+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || original;
}
