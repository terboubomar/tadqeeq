import type { StoredPeriod } from "@/lib/periods";

/**
 * Reporting metrics derived from the engine's saved totals, for display and the AI/MCP readouts.
 * Nothing here recalculates the audit: each value is a ratio or a label over numbers the engine
 * already produced, so the accounting results stay exactly as stored.
 */

/** The one definition of platform cost %, the same on every platform. */
export const PLATFORM_COST_FORMULA = "total_platform_charges / sales_ex_vat";
export const PLATFORM_COST_FORMULA_AR = "إجمالي رسوم المنصة بدون الضريبة ÷ المبيعات بدون الضريبة";
/** What the % includes, stated wherever it is shown (reports, dashboard, weekly email, AI readouts). */
export const PLATFORM_COST_DEFINITION_AR =
  "تكلفة المنصة = إجمالي رسوم المنصة بدون الضريبة ÷ المبيعات بدون الضريبة، بالتعريف نفسه لكل المنصات، فهي النسبة الفعلية التي تأخذها المنصة من مبيعاتك. لا تشمل الضريبة في الطرفين. تشمل الإعلانات على كل المنصات: إعلانات كيتا المخصومة من المستحقات، وفاتورة إعلانات هنقرستيشن (CPC) المنفصلة بدون ضريبتها.";
export const PLATFORM_COST_DEFINITION =
  "Platform cost % = total platform charges excluding VAT ÷ sales excluding VAT, the same on every platform: the real share of sales the platform takes. VAT is excluded on both sides. Includes advertising on every platform: Keeta advertising (deducted from the payout) and the HungerStation CPC advertising invoice (a separate invoice, taken without its VAT).";

const VAT_RATE = 0.15;

type Summary = StoredPeriod["summary"];

/**
 * Discounts the restaurant funds itself, per platform: money it gave its customers, not a fee the platform charges.
 * The one place this is decided. The rule: a discount the platform bills on its tax invoice as a commission line is a
 * platform charge (HungerStation's restaurant delivery discount "RDF", Keeta's delivery support, Jahez's delivery
 * offer); a discount that is only netted from the payout is merchant-funded and stays out of platform cost.
 * `inEngineTotal` marks the ones the engine's "everything deducted" total contains, which platform cost subtracts;
 * the others were never in the total and are listed so they show on the same line.
 */
export const MERCHANT_FUNDED_DISCOUNTS: Record<
  StoredPeriod["platform"],
  ReadonlyArray<{ field: "keetaProductCampaignExVat" | "restaurantFoodDiscount"; label: string; inEngineTotal: boolean }>
> = {
  // "Product campaign expenses by merchant": «إعانة التاجر على الأصناف» on the Keeta credit page.
  keeta: [{ field: "keetaProductCampaignExVat", label: "إعانة التاجر على الأصناف", inEngineTotal: true }],
  hungerstation: [{ field: "restaurantFoodDiscount", label: "خصومات الأطعمة على حساب المطعم", inEngineTotal: false }],
  // Jahez's report carries no merchant-funded discount apart from the invoiced delivery offer.
  jahez: [],
};
export const MERCHANT_FUNDED_DISCOUNTS_LABEL_AR = "خصومات ممولة من المطعم";

type DiscountFigures = Partial<Record<"keetaProductCampaignExVat" | "restaurantFoodDiscount", number | null>>;

/** Merchant-funded discounts for a period or a branch; `inEngineTotalOnly` keeps those inside the engine's total. */
export function merchantFundedDiscounts(
  platform: StoredPeriod["platform"],
  figures: DiscountFigures | null | undefined,
  inEngineTotalOnly = false,
): number {
  if (!figures) return 0;
  return MERCHANT_FUNDED_DISCOUNTS[platform]
    .filter((item) => !inEngineTotalOnly || item.inEngineTotal)
    .reduce((sum, item) => {
      const value = figures[item.field];
      return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);
}

/**
 * Total platform charges excluding VAT: what the engine reports for the platform, less the merchant-funded
 * discounts its total contains (MERCHANT_FUNDED_DISCOUNTS). Works on a period summary or a branch row.
 */
export function totalPlatformCharges(platform: StoredPeriod["platform"], summary: Partial<Summary> | null | undefined): number | null {
  if (!summary) return null;
  const value = platform === "keeta" ? (summary.keetaTotalCostExVat ?? summary.totalCharges) : summary.totalCharges;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value - merchantFundedDiscounts(platform, summary, true);
}

/** What the platform-cost helpers read from a period: its totals, and the CPC invoice for HungerStation's advertising. */
type CostPeriod = {
  platform: StoredPeriod["platform"];
  summary?: Partial<Summary> | null;
  invoice?: Partial<Pick<StoredPeriod["invoice"], "cpc" | "cpcBranches">> | null;
};

const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * A branch name reduced to what identifies it, so the same branch matches across the orders file, the commission
 * invoice and the CPC invoice: lower case, Arabic letter forms unified, every dash, bracket, underscore and extra
 * space dropped, and the words compared as a set ("Saihat - An Nur" = "Saihat   An Nur").
 */
export function branchNameKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

type NamedBranch = Pick<StoredPeriod["branches"][number], "branch" | "invoiceBranchName">;

/** Whether an invoice line's branch name is this branch, as the orders file or the commission invoice spells it. */
export function sameBranchName(name: string | null | undefined, branch: NamedBranch): boolean {
  const key = branchNameKey(name);
  return key !== "" && (key === branchNameKey(branch.branch) || key === branchNameKey(branch.invoiceBranchName));
}

type CpcLine = NonNullable<StoredPeriod["invoice"]["cpcBranches"]>[number];

/**
 * Each CPC invoice line with the period branch it belongs to (the first branch its name matches), or null when no
 * branch matches. The CPC invoice prints branch names only, so the match is by name, including the commission-invoice
 * name tied to the branch through its HS Branch ID.
 */
export function cpcLineAllocation(period: {
  invoice?: Partial<Pick<StoredPeriod["invoice"], "cpcBranches">> | null;
  branches?: readonly NamedBranch[] | null;
}): Array<{ line: CpcLine; branch: NamedBranch | null }> {
  const branches = period.branches ?? [];
  return (period.invoice?.cpcBranches ?? []).map((line) => ({
    line,
    branch: branches.find((branch) => sameBranchName(line.branch, branch)) ?? null,
  }));
}

/**
 * HungerStation's CPC advertising invoice excluding VAT: the sum of its branch lines without their VAT, or, when the
 * lines were not read, the invoice total (which includes VAT) ÷ 1.15. Null when no CPC invoice was uploaded.
 */
export function hungerStationAdvertisingExVat(period: CostPeriod): number | null {
  if (period.platform !== "hungerstation") return null;
  const lines = period.invoice?.cpcBranches;
  if (lines?.length) return lines.reduce((sum, line) => sum + line.amountExVat, 0);
  const cpc = period.invoice?.cpc;
  return finiteNumber(cpc) ? cpc / (1 + VAT_RATE) : null;
}

/** Advertising inside the period's platform charges, excluding VAT: Keeta's promotion fee or HungerStation's CPC. */
export function advertisingExVat(period: CostPeriod): number {
  const keetaAds = period.summary?.keetaMerchantAdExVat;
  if (period.platform === "keeta") return finiteNumber(keetaAds) ? keetaAds : 0;
  return hungerStationAdvertisingExVat(period) ?? 0;
}

/** The period's platform charges excluding VAT, advertising included: the base of platform cost %. */
export function periodPlatformCharges(period: CostPeriod): number | null {
  const charges = totalPlatformCharges(period.platform, period.summary);
  if (charges === null) return null;
  return charges + (hungerStationAdvertisingExVat(period) ?? 0);
}

/** The period's platform charges excluding VAT and excluding advertising, for a like-for-like view without it. */
export function periodPlatformChargesExclAds(period: CostPeriod): number | null {
  const charges = periodPlatformCharges(period);
  return charges === null ? null : charges - advertisingExVat(period);
}

type BranchCharges = Pick<StoredPeriod["branches"][number], "branch" | "invoiceBranchName" | "totalCharges"> & {
  keetaTotalCostExVat?: number;
  keetaMerchantAdExVat?: number;
  keetaProductCampaignExVat?: number;
  restaurantFoodDiscount?: number;
  invoiceOnlyBranchCharges?: number;
};
type InvoiceBranchItems = NonNullable<StoredPeriod["invoice"]["branches"]>[number];
type BranchCostPeriod = Omit<CostPeriod, "invoice"> & {
  invoice?: (Partial<Pick<StoredPeriod["invoice"], "cpc" | "cpcBranches">> & { branches?: InvoiceBranchItems[] }) | null;
  branches?: readonly NamedBranch[] | null;
};

/**
 * The invoice-only charges a HungerStation branch's invoice section prints (direct to that branch): its items when
 * the invoice kept them apart, else one line with their total. A single unnamed invoice section belongs to the
 * period's single branch. Empty on other platforms.
 */
export function branchInvoiceOnlyItems(period: BranchCostPeriod, branch: BranchCharges): Array<{ label: string; amount: number }> {
  if (period.platform !== "hungerstation") return [];
  const sections = period.invoice?.branches ?? [];
  const section =
    (branch.invoiceBranchName ? sections.find((item) => item.branch === branch.invoiceBranchName) : undefined) ??
    (sections.length === 1 && (period.branches?.length ?? 1) === 1 ? sections[0] : undefined);
  if (section?.invoiceOnlyItems?.length) return section.invoiceOnlyItems.map((item) => ({ label: item.label, amount: item.amount }));
  const total = finiteNumber(branch.invoiceOnlyBranchCharges) ? branch.invoiceOnlyBranchCharges : (section?.invoiceOnlyCharges ?? 0);
  return Math.abs(total) > 0.005 ? [{ label: "بنود الفاتورة فقط", amount: total }] : [];
}

export interface BranchPlatformCost {
  /** Platform charges excluding VAT, advertising included, merchant-funded discounts excluded. */
  platformCost: number;
  /** HungerStation: the branch's CPC invoice lines without VAT. Keeta: its ad spend from its billing rows. */
  advertisingExVat: number;
  platformCostExclAds: number;
  /** HungerStation: charges its invoice section prints that the order data cannot recompute; inside platformCost. */
  invoiceOnlyCharges: number;
  /** Discounts the restaurant funded itself (MERCHANT_FUNDED_DISCOUNTS); not part of platformCost. */
  merchantFundedDiscounts: number;
}

/**
 * The one definition of a branch's platform cost, excluding VAT: the charges the engine recomputed for it, the
 * invoice-only charges its invoice section prints, and its advertising; without the discounts it funded itself.
 * Every screen, export and readout takes the branch cost from here.
 */
export function branchPlatformCost(period: BranchCostPeriod, branch: BranchCharges): BranchPlatformCost | null {
  const base = totalPlatformCharges(period.platform, branch as never);
  if (base === null) return null;
  const discounts = merchantFundedDiscounts(period.platform, branch);
  if (period.platform === "keeta") {
    // Keeta's total already contains the branch's ad spend; it is only split out here.
    const ads = finiteNumber(branch.keetaMerchantAdExVat) ? branch.keetaMerchantAdExVat : 0;
    return { platformCost: base, advertisingExVat: ads, platformCostExclAds: base - ads, invoiceOnlyCharges: 0, merchantFundedDiscounts: discounts };
  }
  if (period.platform !== "hungerstation") {
    return { platformCost: base, advertisingExVat: 0, platformCostExclAds: base, invoiceOnlyCharges: 0, merchantFundedDiscounts: discounts };
  }
  // The engine keeps the branch's invoice-only charges apart from its recomputed charges; the period total has both.
  const invoiceOnlyCharges = branchInvoiceOnlyItems(period, branch).reduce((sum, item) => sum + item.amount, 0);
  const charges = base + invoiceOnlyCharges;
  // With the period's branches at hand a CPC line goes to one branch only; without them, to the branch it names.
  const lines = period.branches
    ? cpcLineAllocation(period)
        .filter((item) => item.branch !== null && item.branch.branch === branch.branch && (item.branch.invoiceBranchName ?? null) === (branch.invoiceBranchName ?? null))
        .map((item) => item.line)
    : (period.invoice?.cpcBranches ?? []).filter((line) => sameBranchName(line.branch, branch));
  const advertisingExVat = lines.reduce((sum, line) => sum + line.amountExVat, 0);
  return { platformCost: charges + advertisingExVat, advertisingExVat, platformCostExclAds: charges, invoiceOnlyCharges, merchantFundedDiscounts: discounts };
}

/** One branch's platform charges excluding VAT, advertising included (branchPlatformCost().platformCost). */
export function branchPlatformCharges(period: BranchCostPeriod, branch: BranchCharges): number | null {
  return branchPlatformCost(period, branch)?.platformCost ?? null;
}

export interface UnallocatedCharge {
  label: string;
  amount: number;
  /**
   * "platform_level": printed only in the invoice summary. "unmatched_branch": names a branch not in the period.
   * "advertising_unattributed": advertising known for the period that no branch carries.
   */
  allocation: "platform_level" | "unmatched_branch" | "advertising_unattributed";
  /** The branch name as the invoice prints it, for unmatched lines. */
  rawBranchName?: string;
}

type ReconciliationPeriod = Omit<CostPeriod, "invoice"> & {
  invoice?: (Partial<Pick<StoredPeriod["invoice"], "cpc" | "cpcBranches" | "unallocatedCharges">> & { branches?: InvoiceBranchItems[] }) | null;
  branches?: ReadonlyArray<BranchCharges> | null;
};

/** Advertising excluding VAT on the branches against the period's advertising; the remainder is on no branch. */
export function advertisingAllocation(period: ReconciliationPeriod): { branches: number; total: number; unattributed: number } {
  const total = advertisingExVat(period);
  const branches = (period.branches ?? []).reduce((sum, row) => sum + (branchPlatformCost(period, row)?.advertisingExVat ?? 0), 0);
  const unmatched =
    period.platform === "hungerstation"
      ? cpcLineAllocation(period)
          .filter((item) => item.branch === null)
          .reduce((sum, item) => sum + item.line.amountExVat, 0)
      : 0;
  const unattributed = Math.round((total - branches - unmatched) * 100) / 100 + 0;
  return { branches, total, unattributed };
}

/**
 * Charges excluding VAT that no branch carries: invoice-summary-only items, CPC lines whose branch is not in the
 * period, and advertising known only as a period total. Nothing is spread across branches.
 */
export function unallocatedPlatformCharges(period: ReconciliationPeriod): UnallocatedCharge[] {
  const result = (period.invoice?.unallocatedCharges ?? []).map(
    (item): UnallocatedCharge => ({ label: item.label, amount: item.amount, allocation: "platform_level" }),
  );
  if (period.platform === "hungerstation") {
    for (const item of cpcLineAllocation(period)) {
      if (item.branch !== null) continue;
      result.push({ label: "إعلانات CPC · " + item.line.branch, amount: item.line.amountExVat, allocation: "unmatched_branch", rawBranchName: item.line.branch });
    }
  }
  const { unattributed } = advertisingAllocation(period);
  if (Math.abs(unattributed) > BRANCH_COST_RECONCILIATION_TOLERANCE) {
    result.push({ label: "إعلانات غير منسوبة إلى فرع", amount: unattributed, allocation: "advertising_unattributed" });
  }
  return result;
}

/** Allowed gap between the branch costs plus unallocated charges and the period's platform charges, in SAR. */
export const BRANCH_COST_RECONCILIATION_TOLERANCE = 0.05;

/**
 * Branch platform costs + unallocated charges against the period's total platform charges (all excluding VAT,
 * advertising included). Null when the period has no branches or no total. A residual above the tolerance means
 * some charge sits in the total but on no branch and in no unallocated line.
 */
export function branchCostReconciliation(period: ReconciliationPeriod): {
  branches: number;
  unallocated: number;
  total: number;
  residual: number;
  reconciled: boolean;
} | null {
  const total = periodPlatformCharges(period);
  const rows = period.branches ?? [];
  if (total === null || rows.length === 0) return null;
  const branches = rows.reduce((sum, row) => sum + (branchPlatformCost(period, row)?.platformCost ?? 0), 0);
  const unallocated = unallocatedPlatformCharges(period).reduce((sum, item) => sum + item.amount, 0);
  // "+ 0" turns a rounded -0 into 0.
  const residual = Math.round((total - branches - unallocated) * 100) / 100 + 0;
  return { branches, unallocated, total, residual, reconciled: Math.abs(residual) <= BRANCH_COST_RECONCILIATION_TOLERANCE };
}

type SalesFigures = { grossSales?: number | null; netSales?: number | null; keetaSalesExVat?: number | null };

/**
 * Sales excluding VAT, the base of platform cost %: HungerStation's commissionable sales (netSales, already without
 * VAT), Keeta's sales without VAT, and Jahez's order amount (which includes VAT) ÷ 1.15. Null when unknown.
 */
export function salesExVat(platform: StoredPeriod["platform"], figures: SalesFigures | null | undefined): number | null {
  if (!figures) return null;
  if (platform === "hungerstation") return finiteNumber(figures.netSales) ? figures.netSales : null;
  if (platform === "keeta" && finiteNumber(figures.keetaSalesExVat) && figures.keetaSalesExVat > 0) return figures.keetaSalesExVat;
  return finiteNumber(figures.grossSales) ? figures.grossSales / (1 + VAT_RATE) : null;
}

/** total platform charges (without VAT) ÷ sales without VAT; null when either is missing or sales are zero. */
export function platformCostPct(totalCharges: number | null | undefined, sales: number | null | undefined): number | null {
  if (typeof totalCharges !== "number" || typeof sales !== "number") return null;
  if (!Number.isFinite(totalCharges) || !Number.isFinite(sales) || sales === 0) return null;
  return totalCharges / sales;
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
