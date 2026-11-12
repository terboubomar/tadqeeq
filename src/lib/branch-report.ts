import type { BranchRow } from "./analysis/types";
import type { StoredPeriod } from "./periods";
import { branchPlatformCost, platformCostPct, salesExVat } from "./reporting-metrics";

/**
 * The branch report: one row per branch with each figure once, in two views. "summary" is what a reader needs to
 * compare branches; "detail" adds the breakdown behind each total. Invoice comparisons are folded into one column
 * that names only the differences above DIFFERENCE_THRESHOLD. Display only: every figure is the engine's own.
 */
export type BranchReportView = "summary" | "detail";

/** Differences at or below this (SAR) are rounding, not worth a reader's attention, and are not shown. */
export const DIFFERENCE_THRESHOLD = 10;

export interface BranchReportColumn {
  key: string;
  header: string;
  type?: "money" | "number" | "percent" | "text";
  /** A second line under the cell (the summary shows a branch's invoice differences under its name). */
  subKey?: string;
}

export type BranchReportRow = Record<string, string | number | undefined> & { branch: string; journalIndex: number };

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const sum = (...values: Array<number | undefined>) => values.reduce<number>((total, value) => total + (finite(value) ? value : 0), 0);

/**
 * Invoice − recalculated per check, kept only above the threshold, in words so the direction reads the same in
 * Arabic text and in Excel: "العمولة أعلى 23.10، التحصيلات أقل 5,000.00" (the invoice is higher / lower).
 */
export function significantDifferences(items: Array<[label: string, difference: number | undefined]>): string {
  const amount = (value: number) => Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shown = items.filter((item): item is [string, number] => finite(item[1]) && Math.abs(item[1]) > DIFFERENCE_THRESHOLD);
  return shown.map(([label, value]) => `${label} ${value > 0 ? "أعلى" : "أقل"} ${amount(value)}`).join("، ");
}

function differences(platform: StoredPeriod["platform"], b: BranchRow): string {
  if (platform === "hungerstation") {
    return significantDifferences([
      ["المبيعات", b.creditSalesVariance],
      ["العمولة", b.commissionVariance],
      ["رسوم الدفع", b.paymentFeeVariance],
      ["رسوم أخرى", b.otherChargesVariance],
      ["التحصيلات", b.collectionsVariance],
    ]);
  }
  if (platform === "keeta") {
    return significantDifferences([
      ["فاتورة العمولة", b.keetaPdfCommissionVariance ?? b.keetaExcelInvoiceVariance],
      ["البيع الآجل", b.keetaPdfCreditSalesVariance],
      ["صافي المستحق", b.keetaPdfNetDueVariance ?? b.keetaExcelPayableVariance ?? b.keetaSettlementVariance],
    ]);
  }
  return significantDifferences([["صافي المطعم", b.jahezSettlementVariance]]);
}

/** One branch's report row: its name as the workspace shows it, every figure once. */
export function branchReportRow(period: StoredPeriod, b: BranchRow, name: string, journalIndex: number): BranchReportRow {
  const cost = branchPlatformCost(period, b);
  const platformCost = cost?.platformCost;
  const sales = salesExVat(period.platform, b) ?? undefined;
  const common = {
    branch: name,
    journalIndex,
    orders: b.orders,
    salesExVat: sales,
    commission: b.commission,
    commissionPct: b.commissionPct,
    platformCost,
    platformCostPct: platformCostPct(platformCost, sales) ?? undefined,
    // The invoice differences above the threshold, else the branch's match status.
    differences: differences(period.platform, b) || b.branchAuditLabel || "—",
    // Only the differences, for the line under the branch name in the summary.
    flag: differences(period.platform, b),
  };
  if (period.platform === "hungerstation") {
    return {
      ...common,
      grossSales: b.grossSales,
      paymentFees: sum(b.bankFeeSuccess, b.bankFeeRefunded, b.walletFee),
      bankFeeSuccess: b.bankFeeSuccess,
      bankFeeRefunded: b.bankFeeRefunded,
      walletFee: b.walletFee,
      otherCharges: sum(b.rdfCampaigns, b.compensation, b.jokerFees, b.waitingTimeFees, cost?.invoiceOnlyCharges),
      rdfCampaigns: b.rdfCampaigns,
      compensation: b.compensation,
      jokerFees: b.jokerFees,
      waitingTimeFees: b.waitingTimeFees,
      invoiceOnly: cost?.invoiceOnlyCharges,
      advertising: cost?.advertisingExVat,
      collections: b.totalCollections,
    };
  }
  if (period.platform === "keeta") {
    return {
      ...common,
      storeId: b.branchId,
      grossSales: b.grossSales,
      bankFees: b.keetaBankFeesExVat,
      deliverySupport: b.keetaDeliveryCampaignExVat,
      advertising: cost?.advertisingExVat,
      itemDiscounts: b.keetaProductCampaignExVat,
      posFees: b.keetaPosFeesExVat,
      otherExclPos: b.keetaOtherExpensesExVat === undefined ? undefined : b.keetaOtherExpensesExVat - (b.keetaPosFeesExVat ?? 0),
      compensation: b.keetaCompensationExVat,
      payable: b.netSales,
    };
  }
  return {
    ...common,
    grossSales: b.grossSales,
    paymentFees: b.jahezPaymentFeesExVat,
    deliveryOffer: b.jahezDeliveryOfferInvoiceExVat,
    deliveryOfferDeducted: b.jahezDeliveryOfferInclVat,
    offerAmount: b.jahezOfferAmount,
    deliveryCoupon: b.jahezDeliveryCoupon,
    deliveryCharge: b.jahezDeliveryCharge,
    restaurantAmount: b.jahezReportedRestaurantAmount,
    compensationDebit: b.jahezCompensationDebit,
    compensationCredit: b.jahezCompensationCredit,
    compensationNet: b.jahezCompensationNetImpact,
    compensationDuplicate: b.jahezCompensationDuplicateAmount,
    compensationUnknown: b.jahezCompensationUnknownAmount,
  };
}

const COST_PCT: BranchReportColumn = { key: "platformCostPct", header: "تكلفة المنصة %", type: "percent" };
const DIFFERENCES: BranchReportColumn = { key: "differences", header: "المطابقة", type: "text" };

const COLUMNS: Record<StoredPeriod["platform"], Record<BranchReportView, BranchReportColumn[]>> = {
  hungerstation: {
    summary: [
      { key: "branch", header: "الفرع", type: "text" },
      { key: "orders", header: "الطلبات", type: "number" },
      { key: "salesExVat", header: "المبيعات" },
      { key: "commission", header: "العمولة" },
      { key: "paymentFees", header: "رسوم الدفع" },
      { key: "otherCharges", header: "رسوم أخرى" },
      { key: "advertising", header: "الإعلانات" },
      { key: "platformCost", header: "تكلفة المنصة" },
      COST_PCT,
      DIFFERENCES,
    ],
    detail: [
      { key: "branch", header: "الفرع", type: "text" },
      { key: "orders", header: "الطلبات", type: "number" },
      { key: "grossSales", header: "المبيعات شامل الضريبة" },
      { key: "salesExVat", header: "المبيعات" },
      { key: "commission", header: "العمولة" },
      { key: "commissionPct", header: "نسبة العمولة", type: "percent" },
      { key: "bankFeeSuccess", header: "رسوم البطاقات" },
      { key: "bankFeeRefunded", header: "رسوم بطاقات مرتجعة" },
      { key: "walletFee", header: "رسوم المحافظ" },
      { key: "rdfCampaigns", header: "حملات التوصيل المجاني" },
      { key: "compensation", header: "تعويضات العملاء" },
      { key: "jokerFees", header: "رسوم العروض" },
      { key: "waitingTimeFees", header: "وقت الانتظار" },
      { key: "invoiceOnly", header: "بنود من الفاتورة فقط" },
      { key: "advertising", header: "الإعلانات" },
      { key: "platformCost", header: "تكلفة المنصة" },
      COST_PCT,
      { key: "collections", header: "التحصيلات" },
      DIFFERENCES,
    ],
  },
  keeta: {
    summary: [
      { key: "branch", header: "المتجر", type: "text" },
      { key: "orders", header: "الطلبات", type: "number" },
      { key: "salesExVat", header: "المبيعات" },
      { key: "commission", header: "العمولة" },
      { key: "bankFees", header: "رسوم البنك" },
      { key: "deliverySupport", header: "دعم التوصيل" },
      { key: "advertising", header: "الإعلانات" },
      { key: "platformCost", header: "تكلفة المنصة" },
      COST_PCT,
      { key: "payable", header: "صافي المستحق" },
      DIFFERENCES,
    ],
    detail: [
      { key: "branch", header: "المتجر", type: "text" },
      { key: "storeId", header: "Store ID", type: "text" },
      { key: "orders", header: "الطلبات", type: "number" },
      { key: "grossSales", header: "المبيعات شامل الضريبة" },
      { key: "salesExVat", header: "المبيعات" },
      { key: "commission", header: "العمولة" },
      { key: "commissionPct", header: "نسبة العمولة", type: "percent" },
      { key: "bankFees", header: "رسوم البنك" },
      { key: "deliverySupport", header: "دعم التوصيل" },
      { key: "advertising", header: "الإعلانات" },
      { key: "itemDiscounts", header: "خصومات ممولة من المطعم" },
      { key: "posFees", header: "أقساط POS" },
      { key: "otherExclPos", header: "مصروفات أخرى" },
      { key: "compensation", header: "التعويضات" },
      { key: "platformCost", header: "تكلفة المنصة" },
      COST_PCT,
      { key: "payable", header: "صافي المستحق" },
      DIFFERENCES,
    ],
  },
  jahez: {
    summary: [
      { key: "branch", header: "الفرع", type: "text" },
      { key: "orders", header: "الطلبات", type: "number" },
      { key: "salesExVat", header: "المبيعات" },
      { key: "commission", header: "العمولة" },
      { key: "paymentFees", header: "رسوم الدفع" },
      { key: "deliveryOffer", header: "عرض التوصيل" },
      { key: "platformCost", header: "تكلفة المنصة" },
      COST_PCT,
      { key: "restaurantAmount", header: "صافي المطعم" },
      DIFFERENCES,
    ],
    detail: [
      { key: "branch", header: "الفرع", type: "text" },
      { key: "orders", header: "الطلبات", type: "number" },
      { key: "grossSales", header: "المبيعات شامل الضريبة" },
      { key: "salesExVat", header: "المبيعات" },
      { key: "commission", header: "العمولة" },
      { key: "commissionPct", header: "نسبة العمولة", type: "percent" },
      { key: "paymentFees", header: "رسوم الدفع" },
      { key: "deliveryOffer", header: "عرض التوصيل" },
      { key: "deliveryOfferDeducted", header: "عرض التوصيل المخصوم شامل الضريبة" },
      { key: "offerAmount", header: "Offer Amount" },
      { key: "deliveryCoupon", header: "Delivery Coupon" },
      { key: "deliveryCharge", header: "Delivery Charge" },
      { key: "compensationDebit", header: "تعويضات مخصومة" },
      { key: "compensationCredit", header: "تعويضات مضافة" },
      { key: "compensationNet", header: "صافي أثر التعويضات" },
      { key: "compensationDuplicate", header: "تكرار مشتبه" },
      { key: "compensationUnknown", header: "تعويضات بدون طلب" },
      { key: "platformCost", header: "تكلفة المنصة" },
      COST_PCT,
      { key: "restaurantAmount", header: "صافي المطعم" },
      DIFFERENCES,
    ],
  },
};

/**
 * The view's columns, dropping a money column that is empty for every branch (a line the platform did not bill).
 * On screen the summary shows a branch's differences under its name instead of in a column of their own, so the
 * table fits; exports keep the column.
 */
export function branchReportColumns(
  platform: StoredPeriod["platform"],
  view: BranchReportView,
  rows: BranchReportRow[],
  target: "screen" | "export" = "export",
): BranchReportColumn[] {
  const columns =
    view === "summary" && target === "screen"
      ? COLUMNS[platform][view]
          .filter((column) => column.key !== "differences")
          .map((column) => (column.key === "branch" ? { ...column, subKey: "flag" } : column))
      : COLUMNS[platform][view];
  return columns.filter((column) => {
    if (column.type === "text" || column.type === "percent" || column.type === "number") return true;
    if (column.key === "platformCost" || column.key === "salesExVat" || column.key === "commission") return true;
    return rows.some((row) => finite(row[column.key]) && Math.abs(row[column.key] as number) >= 0.005);
  });
}

/** One line under the table: what the figures are, said once instead of on every header. */
export const BRANCH_REPORT_NOTE =
  "كل المبالغ بالريال وبدون ضريبة القيمة المضافة ما لم يُذكر غير ذلك. تكلفة المنصة = كل رسوم المنصة على الفرع مع الإعلانات، ونسبتها من المبيعات بدون الضريبة. المطابقة تذكر البنود التي تزيد فيها الفاتورة أو تقل عن المحتسب بأكثر من " +
  DIFFERENCE_THRESHOLD +
  " ر.س، وإلا حالة مطابقة الفرع.";
