import type { BranchRow } from "./analysis/types";
import type { MarketplaceChargeLine } from "./charges-mapper";
import type { StoredPeriod } from "./periods";

/**
 * Where each «كاشِف» line comes from: the file, the sheet, the exact column names the engine reads, and how the
 * amount is derived. Descriptive only: it mirrors the parsers in src/lib/analysis and never changes a figure.
 * When a parser changes a column or formula, update the matching entry here (charges-sources.test.ts checks
 * that every line the mapper can produce has an entry).
 */

export interface ChargeLineSource {
  file: string;
  sheet?: string;
  /** Column headers exactly as they appear in the platform file. */
  columns: string[];
  /** How the amount is computed from those columns, in plain Arabic. */
  formula: string;
  /** Per-branch value, when the stored branch rows hold the same figure. */
  branchValue?: (branch: BranchRow) => number;
}

const VAT_NOTE = "÷ 1.15 لإزالة ضريبة القيمة المضافة";

const HS_ORDERS = "ملف طلبات هنقرستيشن (Excel من بوابة التاجر)";
const HS_INVOICE = "فاتورة هنقرستيشن (PDF)";
const KEETA_FILE = "ملف كيتا (Excel)";
const JAHEZ_FILE = "تقرير جاهز المالي (Restaurant Financial Report)";

const KEETA_SIGN = "تُعكس الإشارة لأن الملف يسجّل الخصومات بالسالب، ثم " + VAT_NOTE + ".";

const SOURCES: Record<string, (period: StoredPeriod) => ChargeLineSource> = {
  "hs-commission": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["Commission"],
    formula: "مجموع عمود Commission لكل الطلبات المحتسبة في الفترة، وهو بدون الضريبة في الملف.",
    branchValue: (b) => b.commission,
  }),
  "hs-card-payment-fees": (period) => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["CC Amount", "Payment Type", "Status"],
    formula:
      "(مبالغ CC Amount للطلبات المدفوعة إلكترونياً + مبالغها للطلبات المرفوضة أو الفاشلة قبل الاستلام) × نسبة رسوم الدفع " +
      (period.summary.bankRate > 0 ? "(" + (period.summary.bankRate * 100).toFixed(2) + "%) " : "") +
      (period.summary.bankRateSource === "manual" ? "من العقد الذي أدخلته." : "المستنتجة من الفاتورة."),
    branchValue: (b) => (b.bankFeeSuccess ?? 0) + (b.bankFeeRefunded ?? 0),
  }),
  "hs-wallet-fee": () => ({
    file: HS_INVOICE,
    columns: [],
    formula: "بند رسوم مدفوعات المحافظ كما ورد في الفاتورة. لا يُعاد بناؤه من عمود Wallet Amount لأنه مبلغ تحصيل وليس أساس الرسوم.",
    branchValue: (b) => b.walletFee ?? 0,
  }),
  "hs-rdf": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["Restaurant delivery Discount"],
    formula: "مجموع العمود للطلبات المحتسبة، " + VAT_NOTE + ".",
    branchValue: (b) => b.rdfCampaigns,
  }),
  "hs-compensation": () => ({
    file: HS_ORDERS,
    sheet: "Compensated Orders",
    columns: ["Compensation"],
    formula: "مجموع التعويضات في ورقة الطلبات المعوّضة، " + VAT_NOTE + ".",
    branchValue: (b) => b.compensation,
  }),
  "hs-flash-deals": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["Flash Deals Fee Excluding Vat"],
    formula: "مجموع العمود للطلبات المحتسبة، وهو بدون الضريبة في الملف.",
    branchValue: (b) => b.jokerFees,
  }),
  "hs-waiting-time": () => ({
    file: HS_ORDERS,
    sheet: "Waiting Time",
    columns: ["Avoidable Waiting Time Fee"],
    formula: "مجموع رسوم وقت الانتظار القابل للتجنب، " + VAT_NOTE + ".",
    branchValue: (b) => b.waitingTimeFees,
  }),
  "hs-cpc": (period) => ({
    file: "فاتورة إعلانات هنقرستيشن CPC (PDF)",
    columns: [],
    formula: period.invoice?.cpcBranches?.length
      ? "إجمالي فاتورة الإعلانات كما ورد فيها، شامل الضريبة. وتوزيعه على الفروع من سطر كل فرع في الفاتورة: المبلغ + ضريبته."
      : "إجمالي فاتورة الإعلانات كما ورد فيها، شامل الضريبة.",
  }),
  "hs-restaurant-food-discount": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["Restaurant Food discount"],
    formula: "مجموع خصم الطعام الذي يموّله المطعم للطلبات المحتسبة.",
    branchValue: (b) => b.restaurantFoodDiscount,
  }),
  "hs-platform-food-discount": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["HS Food Discount", "Rewards Discounts"],
    formula: "مجموع خصومات الطعام والمكافآت التي تموّلها هنقرستيشن.",
    branchValue: (b) => b.hsFoodDiscount + b.rewardsDiscount,
  }),
  "hs-partial-refunds": () => ({
    file: HS_ORDERS,
    sheet: "Commissionable GMV",
    columns: ["CC Refund Amount", "Wallet Refund"],
    formula: "مجموع المبالغ المستردة للعملاء بالبطاقة والمحفظة.",
    branchValue: (b) => b.partialRefund,
  }),
  "hs-unmapped-invoice-extra-residual": () => ({
    file: "نتيجة التدقيق المحفوظة",
    columns: [],
    formula: "الفرق بين إجمالي بنود «من الفاتورة فقط» المحفوظ وتفصيلها؛ نتيجة قديمة لم تحفظ كل البنود مفصلة.",
  }),

  "keeta-commission": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Subtotal of commission fee (VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaCommissionExVat ?? 0,
  }),
  "keeta-bank-fees": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Bank fee (VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaBankFeesExVat ?? 0,
  }),
  "keeta-delivery": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Delivery subsidies (Keeta delivery) covered by merchant"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaDeliveryCampaignExVat ?? 0,
  }),
  "keeta-product-campaign": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Product campaign expenses by merchant (VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaProductCampaignExVat ?? 0,
  }),
  "keeta-merchant-ads": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Merchant ad spend (including VAT)", "Advertising costs"],
    formula: "مجموع العمود الموجود منهما في الملف. " + KEETA_SIGN,
    branchValue: (b) => b.keetaMerchantAdExVat ?? 0,
  }),
  "keeta-compensation": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["Total Platform Deductions from Merchant (Merchant's Liability, VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaCompensationExVat ?? 0,
  }),
  "keeta-pos": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: ["POS Machine Fee(VAT included)"],
    formula: "مجموع العمود لكل الطلبات. " + KEETA_SIGN,
    branchValue: (b) => b.keetaPosFeesExVat ?? 0,
  }),
  "keeta-unmapped-other": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: [
      "Photography Service Fee(VAT included)",
      "Monthly service fee (including VAT)",
      "Subscription fee (including VAT)",
      "Adjustment (including invoice)",
      "Delivery promotion subsidy (merchant delivery, including VAT) covered by merchant",
      "VAT withholding",
      "Adjustment decreases (not included in invoices)",
    ],
    formula:
      "مجموع هذه الأعمدة معاً (بدون رسوم جهاز POS المعروضة وحدها). " +
      KEETA_SIGN +
      " النتيجة المحفوظة تجمعها في رقم واحد، لذلك لا يُفترض نوعها.",
    branchValue: (b) => (b.keetaOtherExpensesExVat ?? 0) - (b.keetaPosFeesExVat ?? 0),
  }),
  "keeta-input-vat": () => ({
    file: KEETA_FILE,
    sheet: "Order Summary",
    columns: [],
    formula: "إجمالي تكلفة المنصة شامل الضريبة − نفس التكلفة بدون الضريبة.",
    branchValue: (b) => b.keetaInputVat ?? 0,
  }),

  "jahez-commission": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Jahez Commision"],
    formula: "مجموع عمولة جاهز لكل الطلبات (شامل الضريبة في الملف)، " + VAT_NOTE + ".",
    branchValue: (b) => (b.jahezCommissionInclVat ?? 0) / 1.15,
  }),
  "jahez-payment-fees": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Payment Fees"],
    formula: "مجموع رسوم المدفوعات لكل الطلبات، وهي بدون الضريبة في الملف.",
    branchValue: (b) => b.jahezPaymentFeesExVat ?? 0,
  }),
  "jahez-delivery-offer": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Delivery Offer"],
    formula: "كل قيمة عرض توصيل تُحوَّل إلى مبلغها في الفاتورة بدون الضريبة حسب فئة العرض، ثم تُجمع.",
    branchValue: (b) => b.jahezDeliveryOfferInvoiceExVat ?? 0,
  }),
  "jahez-offer-amount": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Offer Amount"],
    formula: "مجموع العمود لكل الطلبات.",
    branchValue: (b) => b.jahezOfferAmount ?? 0,
  }),
  "jahez-delivery-coupon": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Delivery Coupon"],
    formula: "مجموع العمود لكل الطلبات.",
    branchValue: (b) => b.jahezDeliveryCoupon ?? 0,
  }),
  "jahez-tax": () => ({
    file: JAHEZ_FILE,
    sheet: "Jahez Order Details",
    columns: ["Jahez Commision", "Payment Fees Vat", "Delivery Offer"],
    formula:
      "ضريبة العمولة (العمولة شامل الضريبة − بدونها) + مجموع Payment Fees Vat + ضريبة عروض التوصيل (المخصوم − مبلغ الفاتورة بدون الضريبة).",
    branchValue: (b) =>
      (b.jahezCommissionInclVat ?? 0) -
      (b.jahezCommissionInclVat ?? 0) / 1.15 +
      (b.jahezPaymentFeesVat ?? 0) +
      ((b.jahezDeliveryOfferInclVat ?? 0) - (b.jahezDeliveryOfferInvoiceExVat ?? 0)),
  }),
  "jahez-compensation-net": () => ({
    file: "تقرير تعويضات جاهز",
    sheet: "Jahez Compensation Details",
    columns: ["Restaurant_Total_Debit_Amount", "Restaurant_Total_Credit_Amount"],
    formula: "مجموع الخصومات (Debit) − مجموع الإضافات (Credit) على المطعم في الفترة.",
    branchValue: (b) => b.jahezCompensationNetImpact ?? 0,
  }),
};

/** Source of one «كاشِف» line; falls back to the line's own short source for lines built at run time. */
export function chargeLineSource(line: MarketplaceChargeLine, period: StoredPeriod): ChargeLineSource {
  const known = SOURCES[line.id];
  if (known) return known(period);
  if (line.id.startsWith("hs-unmapped-invoice-extra-")) {
    return {
      file: HS_INVOICE,
      columns: [],
      formula: "بند ورد في الفاتورة باسمه «" + line.label + "» ولا يقابله عمود في ملف الطلبات، لذلك يبقى غير مصنف.",
    };
  }
  if (line.id.endsWith("-unmapped-reconciliation-residual")) {
    return {
      file: "مقارنة داخلية في تدقيق",
      columns: [],
      formula: "إجمالي رسوم التدقيق المحفوظ − مجموع كل البنود المصنفة أعلاه. أي فرق يظهر هنا بدلاً من أن يختفي.",
    };
  }
  return { file: line.source, columns: [], formula: "" };
}

/** Ids `chargeLineSource` documents explicitly; used by the coverage test. */
export const DOCUMENTED_CHARGE_LINE_IDS = Object.keys(SOURCES);

export interface BranchBreakdown {
  /** Every branch of the period, largest amount first; zeros included so no branch is hidden. */
  rows: { name: string; value: number }[];
  total: number;
  /** Shown above the rows, e.g. when the split comes from the invoice and covers a group of lines. */
  caption?: string;
  /** Shown instead of rows when the files hold no per-branch figure for this line. */
  unavailable?: string;
  /** Lines that share one split (HungerStation invoice-only charges) carry the same key so a total counts it once. */
  groupKey?: string;
}

const SPLIT_TOLERANCE = 0.05;

function sortedRows(rows: { name: string; value: number }[]): BranchBreakdown["rows"] {
  return rows.map((row) => ({ name: row.name, value: Math.round(row.value * 100) / 100 })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

function rowsTotal(rows: { value: number }[]): number {
  return Math.round(rows.reduce((sum, row) => sum + row.value, 0) * 100) / 100;
}

/**
 * Which branch each amount belongs to. Uses the stored branch rows, the HungerStation invoice's own per-branch
 * figures for invoice-only charges, or (for the closing difference) each branch's total minus its classified lines,
 * and only when those per-branch values add up to the line's amount. Otherwise it says the split is not available
 * rather than guessing.
 */
export function branchBreakdown(
  line: MarketplaceChargeLine,
  period: StoredPeriod,
  allLines: MarketplaceChargeLine[],
): BranchBreakdown {
  const source = chargeLineSource(line, period);
  if (source.branchValue && period.branches.length) {
    const rows = sortedRows(period.branches.map((branch) => ({ name: branch.branch, value: source.branchValue!(branch) })));
    const total = rowsTotal(rows);
    if (Math.abs(total) > SPLIT_TOLERANCE || Math.abs(line.amount) <= SPLIT_TOLERANCE) return { rows, total };
  }

  if (line.id === "hs-cpc" && period.invoice?.cpcBranches?.length) {
    // Each line of the CPC invoice names its branch; match it to the order branch by name.
    const key = (name: string | undefined) => (name ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const byName = new Map<string, string>();
    for (const b of period.branches) {
      byName.set(key(b.branch), b.branch);
      if (b.invoiceBranchName) byName.set(key(b.invoiceBranchName), b.branch);
    }
    const values = new Map(period.branches.map((b) => [b.branch, 0]));
    for (const charge of period.invoice.cpcBranches) {
      const name = byName.get(key(charge.branch)) ?? charge.branch;
      values.set(name, (values.get(name) ?? 0) + charge.amountExVat + charge.vat);
    }
    const rows = sortedRows([...values.entries()].map(([name, value]) => ({ name, value })));
    const total = rowsTotal(rows);
    const rounding = Math.round((line.amount - total) * 100) / 100;
    return {
      rows,
      total,
      caption:
        "من فاتورة CPC: سطر كل فرع كما ورد فيها، المبلغ + ضريبته." +
        (Math.abs(rounding) >= 0.01
          ? ` مجموع السطور ${total.toFixed(2)} مقابل إجمالي الفاتورة ${line.amount.toFixed(2)} ر.س؛ الفرق ${Math.abs(rounding).toFixed(2)} تقريب لأن الفاتورة تقرّب ضريبة كل سطر على حدة.`
          : ""),
    };
  }

  if (line.id.startsWith("hs-unmapped-invoice-extra-")) {
    // Invoices read since the parser keeps each branch's rows apart: split this line by its own item.
    const itemized = (period.invoice?.branches ?? []).some((branch) => branch.invoiceOnlyItems !== undefined);
    if (itemized && line.label) {
      const byInvoiceName = new Map(period.branches.filter((b) => b.invoiceBranchName).map((b) => [b.invoiceBranchName!, b.branch]));
      const values = new Map(period.branches.map((b) => [b.branch, 0]));
      for (const branch of period.invoice?.branches ?? []) {
        for (const item of branch.invoiceOnlyItems ?? []) {
          if (item.label !== line.label) continue;
          const name = byInvoiceName.get(branch.branch ?? "") ?? branch.branch ?? "فرع في الفاتورة";
          values.set(name, (values.get(name) ?? 0) + item.amount);
        }
      }
      const unallocated = period.invoice?.unallocatedCharges?.find((item) => item.label === line.label)?.amount ?? 0;
      const rows = sortedRows([...values.entries()].map(([name, value]) => ({ name, value })));
      const total = rowsTotal(rows);
      if (Math.abs(total) <= SPLIT_TOLERANCE && unallocated > SPLIT_TOLERANCE) {
        return {
          rows: [],
          total: 0,
          unavailable: "يظهر هذا البند في ملخص الفاتورة فقط ولا يرد في قسم أي فرع، لذلك يبقى غير موزّع على الفروع.",
        };
      }
      return {
        rows,
        total,
        caption:
          unallocated > SPLIT_TOLERANCE
            ? `من أقسام الفروع في فاتورة هنقرستيشن. ${unallocated.toFixed(2)} ر.س منه في ملخص الفاتورة فقط وغير موزّعة على الفروع.`
            : "من أقسام الفروع في فاتورة هنقرستيشن: كل فرع بما يذكره قسمه في الفاتورة.",
      };
    }

    const invoiceBranches = (period.invoice?.branches ?? []).filter((branch) => Math.abs(branch.invoiceOnlyCharges ?? 0) > 0.005);
    if (invoiceBranches.length) {
      const byInvoiceName = new Map(period.branches.filter((b) => b.invoiceBranchName).map((b) => [b.invoiceBranchName!, b.branch]));
      // Start from every order branch at zero so branches without invoice-only charges still show.
      const values = new Map(period.branches.map((b) => [b.branch, 0]));
      for (const branch of invoiceBranches) {
        const name = byInvoiceName.get(branch.branch ?? "") ?? branch.branch ?? "فرع في الفاتورة";
        values.set(name, (values.get(name) ?? 0) + (branch.invoiceOnlyCharges ?? 0));
      }
      const rows = sortedRows([...values.entries()].map(([name, value]) => ({ name, value })));
      const extrasCount = allLines.filter((other) => other.id.startsWith("hs-unmapped-invoice-extra-")).length;
      return {
        rows,
        total: rowsTotal(rows),
        groupKey: "hs-invoice-only",
        caption:
          extrasCount > 1
            ? "من فاتورة هنقرستيشن: مجموع بنود «من الفاتورة فقط» لكل فرع (الفاتورة لا تفصلها حسب البند لكل فرع)."
            : "من فاتورة هنقرستيشن: بنود «من الفاتورة فقط» لكل فرع.",
      };
    }
    return { rows: [], total: 0, unavailable: "الفاتورة تذكر هذا البند على مستوى الحساب كاملاً ولا تفصله حسب الفرع." };
  }

  if (line.id.endsWith("-unmapped-reconciliation-residual") && period.branches.length) {
    const classified = allLines.filter((other) => other.scope === "audit_total" && other.mapped);
    const sources = classified.map((other) => chargeLineSource(other, period).branchValue);
    if (sources.every(Boolean)) {
      const rows = sortedRows(
        period.branches.map((branch) => ({
          name: branch.branch,
          value: (branch.totalCharges ?? 0) - sources.reduce((sum, value) => sum + value!(branch), 0),
        })),
      );
      const total = rowsTotal(rows);
      if (Math.abs(total - line.amount) <= SPLIT_TOLERANCE * Math.max(1, period.branches.length)) {
        return { rows, total, caption: "إجمالي رسوم كل فرع − بنوده المصنفة." };
      }
    }
    return { rows: [], total: 0, unavailable: "هذا الفرق يظهر على مستوى إجمالي الفترة فقط، ولا تكفي أرقام الفروع المحفوظة لتوزيعه بدقة." };
  }

  return { rows: [], total: 0, unavailable: "لا يوجد لهذا البند تفصيل حسب الفرع في ملفات المنصة؛ يرد على مستوى الحساب كاملاً." };
}

/**
 * Per-branch total for several lines (a category). Returns null when any line has no split, so a partial total is
 * never shown as if it were the whole category.
 */
export function combinedBranchBreakdown(
  lines: MarketplaceChargeLine[],
  period: StoredPeriod,
  allLines: MarketplaceChargeLine[],
): BranchBreakdown | null {
  const totals = new Map<string, number>();
  const seenGroups = new Set<string>();
  for (const line of lines) {
    const split = branchBreakdown(line, period, allLines);
    if (!split.rows.length) return null;
    if (split.groupKey) {
      if (seenGroups.has(split.groupKey)) continue;
      seenGroups.add(split.groupKey);
    }
    for (const row of split.rows) totals.set(row.name, (totals.get(row.name) ?? 0) + row.value);
  }
  const rows = sortedRows([...totals.entries()].map(([name, value]) => ({ name, value })));
  return { rows, total: rowsTotal(rows) };
}

/** The part of a saved «عائد» ads analysis this split needs. */
export interface AdsSpendSource {
  dateFrom: string;
  dateTo: string;
  campaigns: { date: string; restaurantId: string; outletName: string; spent: number }[];
}

/** Picks the saved ads analysis that covers the most days of the period, or null when none overlaps. */
export function pickAdsAnalysisForPeriod<T extends { dateFrom: string; dateTo: string }>(
  analyses: T[],
  period: Pick<StoredPeriod, "period_start" | "period_end">,
): T | null {
  if (!period.period_start || !period.period_end) return null;
  const start = period.period_start;
  const end = period.period_end;
  let best: { item: T; days: number } | null = null;
  for (const item of analyses) {
    const from = item.dateFrom > start ? item.dateFrom : start;
    const to = item.dateTo < end ? item.dateTo : end;
    if (from > to) continue;
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
    if (!best || days > best.days) best = { item, days };
  }
  return best?.item ?? null;
}

/**
 * CPC ad spend per branch, from the HungerStation ads report saved in «عائد»: spend within the period's dates,
 * matched to order branches by HS Branch ID (the report's Restaurant ID), every branch listed. Used only when the
 * CPC invoice has no per-branch lines; the caption gives both totals rather than scaling one to the other.
 */
export function cpcBranchesFromAds(source: AdsSpendSource, period: StoredPeriod, invoiceAmount: number): BranchBreakdown {
  const start = period.period_start ?? source.dateFrom;
  const end = period.period_end ?? source.dateTo;
  const nameById = new Map(period.branches.map((b) => [b.branchId, b.branch]));
  const values = new Map(period.branches.map((b) => [b.branch, 0]));
  for (const campaign of source.campaigns) {
    if (campaign.date < start || campaign.date > end) continue;
    const name = nameById.get(campaign.restaurantId) ?? campaign.outletName ?? campaign.restaurantId;
    values.set(name, (values.get(name) ?? 0) + campaign.spent);
  }
  const rows = sortedRows([...values.entries()].map(([name, value]) => ({ name, value })));
  const total = rowsTotal(rows);
  return {
    rows,
    total,
    caption:
      "من تقرير الإعلانات المحفوظ في «عائد» (" +
      (start > source.dateFrom ? start : source.dateFrom) +
      " إلى " +
      (end < source.dateTo ? end : source.dateTo) +
      "): الصرف كما في عمود Spent Budget لكل فرع. مجموع التقرير " +
      total.toFixed(2) +
      " مقابل فاتورة CPC " +
      invoiceAmount.toFixed(2) +
      " ر.س شامل الضريبة.",
  };
}
