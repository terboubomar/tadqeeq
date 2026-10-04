import * as XLSX from "xlsx";

import type {
  AnalysisResult,
  BranchRow,
  CheckRow,
  DailyRow,
  HungerInvoiceBranch,
  InvoiceFigures,
  Summary,
} from "./types";
import { detectHungerStationFormat } from "./formats";
import { ParseError, parseAmount, parseDate } from "./parse";
import { findColumnIgnoringCase, objectRows, resolveSheetName, rowKeys, workbookSheetSource } from "./sheets";
import { HUNGERSTATION_TOLERANCES } from "./tolerances";
import type { ColumnProjection, SheetSource } from "./xlsx-stream";

const VAT = 1.15;

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Every column the engine reads, on any sheet (kept in step with the col()/hasColumn() calls below
 * by a test). Very large exports are read with only these columns.
 */
export const HUNGERSTATION_COLUMNS = [
  "Status",
  "Branch Name",
  "HS Branch ID",
  "Payment Type",
  "Commissionable GMV (VAT Excluded)",
  "Commission",
  "CC Amount",
  "Wallet Amount",
  "Transmitter Amount",
  "Operation Day",
  "Creation Time",
  "HS Food Discount",
  "Rewards Discount",
  "Rewards Discounts",
  "Restaurant Food discount",
  "Restaurant delivery Discount",
  "Flash Deals Fee Excluding Vat",
  "Compensation",
  "Modification Amount",
  "Refunded Amount",
  "CC Refund Amount",
  "Wallet Refund",
  "Avoidable Waiting Time Fee",
];

/**
 * Low-memory reading of a very large HungerStation export: sheets over 32 MB of XML keep only the
 * engine's columns (plus `extraHeaders`, e.g. renamed columns about to be mapped back), after the
 * first 500 rows. The audit is the same; only unread columns are skipped.
 */
export function hungerStationProjection(extraHeaders: string[] = []): ColumnProjection {
  const wanted = new Set([...HUNGERSTATION_COLUMNS, ...extraHeaders].map((name) => name.trim().toLowerCase()));
  return {
    minBytes: 32 * 1024 * 1024,
    fullRows: 500,
    columns: (_sheet, header) => {
      const keep = header.map((cell) => cell !== null && wanted.has(String(cell).trim().toLowerCase()));
      return (column) => keep[column] === true;
    },
  };
}

/** Match HungerStation sheets deterministically while allowing numeric prefixes. */
function findSheet(source: SheetSource, keyword: string): string | undefined {
  return resolveSheetName(source.names, keyword, {
    platform: "hungerstation",
  });
}

function rowsOf(source: SheetSource, keyword: string): Record<string, unknown>[] {
  const name = findSheet(source, keyword);
  if (!name) return [];
  const matrix = source.matrix(name);
  if (!matrix) return [];
  return objectRows(matrix);
}

/** Pick a column value by trying several header spellings. */
function col(row: Record<string, unknown>, ...candidates: string[]): unknown {
  for (const candidate of candidates) {
    if (candidate in row) return row[candidate];
  }
  const hit = findColumnIgnoringCase(row, candidates);
  return hit ? row[hit] : null;
}
function hasColumn(row: Record<string, unknown>, ...candidates: string[]): boolean {
  const keys = rowKeys(row).map((key) => key.toLowerCase());
  return candidates.some((candidate) => keys.includes(candidate.toLowerCase()));
}

function assertRequiredOrderColumns(row: Record<string, unknown>): void {
  const required: string[][] = [
    ["Status"],
    ["Branch Name"],
    ["HS Branch ID"],
    ["Payment Type"],
    ["Commissionable GMV (VAT Excluded)"],
    ["Commission"],
    ["CC Amount"],
    ["Operation Day", "Creation Time"],
  ];

  for (const candidates of required) {
    if (!hasColumn(row, ...candidates)) {
      throw new ParseError(
        "عمود مطلوب مفقود في ورقة Commissionable GMV بملف هنقرستيشن: " + candidates.join(" / "),
        undefined,
        {
          platform: "hungerstation",
          sheet: "Commissionable GMV",
          column: candidates.join(" / "),
        },
      );
    }
  }
}


type StatusClass =
  | "successful"
  | "failedAfterPickup"
  | "failedByVendor"
  | "rejected"
  | "failedBefore"
  | "other";

function classifyStatus(raw: string): StatusClass {
  const s = raw.toLowerCase();
  if (s.includes("successful")) return "successful";
  if (s.includes("after pick")) return "failedAfterPickup";
  if (s.includes("vendor")) return "failedByVendor";
  if (s.includes("reject")) return "rejected";
  if (s.includes("before pick")) return "failedBefore";
  if (s.includes("fail")) return "failedBefore";
  return "other";
}

function isBillableOrder(cls: StatusClass): boolean {
  return cls === "successful" || cls === "failedAfterPickup" || cls === "failedByVendor";
}

function isCollectionOrder(cls: StatusClass): boolean {
  return cls === "successful" || cls === "failedAfterPickup";
}

function isCommissionableOrder(cls: StatusClass): boolean {
  return isBillableOrder(cls) || cls === "rejected";
}

function normalizeBranchName(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMappedInvoiceBranchMatch(
  row: BranchRow,
  invoiceBranches: HungerInvoiceBranch[],
  available: Set<number>,
  branchMappings: Readonly<Record<string, string>> | undefined,
): number {
  const mappedName = row.branchId ? branchMappings?.[row.branchId] : undefined;
  const normalizedMappedName = normalizeBranchName(mappedName);
  if (!normalizedMappedName) return -1;

  const matches = [...available].filter(
    (index) =>
      normalizeBranchName(invoiceBranches[index]?.branch) === normalizedMappedName,
  );
  return matches.length === 1 ? matches[0]! : -1;
}

function findInvoiceBranchMatch(
  row: BranchRow,
  invoiceBranches: HungerInvoiceBranch[],
  available: Set<number>,
): number {
  const rowName = normalizeBranchName(row.branch);
  if (!rowName) return -1;

  const candidates = [...available]
    .map((index) => ({
      index,
      name: normalizeBranchName(invoiceBranches[index]?.branch),
    }))
    .filter((candidate) => candidate.name);

  const exact = candidates.filter((candidate) => candidate.name === rowName);
  if (exact.length === 1) return exact[0]!.index;
  if (exact.length > 1) return -1;

  const contained = candidates.filter(
    (candidate) =>
      candidate.name.includes(rowName) || rowName.includes(candidate.name),
  );
  return contained.length === 1 ? contained[0]!.index : -1;
}

function invoiceBranchHasOperationalOrders(branch: HungerInvoiceBranch): boolean {
  return (
    (branch.creditSalesOrders ?? 0) > 0 ||
    (branch.rejectedSalesOrders ?? 0) > 0
  );
}

function applyInvoiceBranchMatch(
  row: BranchRow,
  matched: HungerInvoiceBranch,
  invoiceBranchCount: number,
  matchMode: "mapping" | "name" | "singleton" | "residual",
): void {
  row.invoiceBranchName = matched.branch;
  row.invoiceCommission = matched.salesCommission;
  row.commissionVariance =
    matched.salesCommission !== undefined ? matched.salesCommission - row.commission : undefined;

  const computedCardPaymentFees = row.bankFeeSuccess + row.bankFeeRefunded;
  const matchedWalletFee = matched.walletFee ?? 0;
  const matchedCardPaymentFees =
    matched.paymentFees !== undefined ? matched.paymentFees - matchedWalletFee : undefined;

  row.invoicePaymentFees = matched.paymentFees;
  row.invoiceWalletFee = matchedWalletFee;
  row.invoiceCardPaymentFees = matchedCardPaymentFees;
  row.walletFeeBase = matched.walletFeeBase;
  row.walletFee = matchedWalletFee;
  row.totalCharges += matchedWalletFee;
  row.paymentFeeVariance =
    matchedCardPaymentFees !== undefined
      ? matchedCardPaymentFees - computedCardPaymentFees
      : undefined;

  const computedOtherCharges =
    row.rdfCampaigns + row.compensation + row.jokerFees + row.waitingTimeFees;
  const invoiceDataOther =
    matched.otherCommission !== undefined
      ? matched.otherCommission - (matched.invoiceOnlyCharges ?? 0)
      : undefined;
  row.invoiceOtherCharges = matched.otherCommission;
  row.invoiceOnlyBranchCharges = matched.invoiceOnlyCharges;
  row.otherChargesVariance =
    invoiceDataOther !== undefined ? invoiceDataOther - computedOtherCharges : undefined;

  row.invoiceCollections = matched.totalCollections;
  row.collectionsVariance =
    matched.totalCollections !== undefined
      ? matched.totalCollections - (row.totalCollections ?? 0)
      : undefined;

  row.invoiceCreditSales = matched.creditSales;
  row.creditSalesVariance =
    matched.creditSales !== undefined
      ? matched.creditSales - (row.creditSales ?? 0)
      : undefined;

  const commissionBad = Math.abs(row.commissionVariance ?? 0) > HUNGERSTATION_TOLERANCES.commission;
  const paymentBad = Math.abs(row.paymentFeeVariance ?? 0) > HUNGERSTATION_TOLERANCES.paymentFee;
  const otherBad = Math.abs(row.otherChargesVariance ?? 0) > HUNGERSTATION_TOLERANCES.otherFee;
  const collectionsBad = Math.abs(row.collectionsVariance ?? 0) > HUNGERSTATION_TOLERANCES.collections;
  const salesBad = Math.abs(row.creditSalesVariance ?? 0) > HUNGERSTATION_TOLERANCES.creditSales;
  const missingBranchSales =
    invoiceBranchCount > 1 &&
    (row.creditSales ?? 0) > 0 &&
    matched.creditSales === undefined;

  if (commissionBad || paymentBad || otherBad || collectionsBad || salesBad || missingBranchSales) {
    row.branchAuditStatus = "warning";
    row.branchAuditLabel = "يحتاج مراجعة";
    row.branchAuditNote = missingBranchSales
      ? "الفرع موجود في تفاصيل العمولة والتحصيلات لكن ملخص مبيعات الفرع مفقود من فاتورة هنقرستيشن."
      : "يوجد فرق يتجاوز هامش التقريب في واحد أو أكثر من بنود الفرع.";
    return;
  }

  const hasRounding =
    Math.abs(row.commissionVariance ?? 0) > HUNGERSTATION_TOLERANCES.rounding ||
    Math.abs(row.paymentFeeVariance ?? 0) > HUNGERSTATION_TOLERANCES.rounding ||
    Math.abs(row.otherChargesVariance ?? 0) > HUNGERSTATION_TOLERANCES.rounding ||
    Math.abs(row.collectionsVariance ?? 0) > HUNGERSTATION_TOLERANCES.rounding ||
    Math.abs(row.creditSalesVariance ?? 0) > HUNGERSTATION_TOLERANCES.rounding;

  row.branchAuditStatus = hasRounding ? "rounding" : "matched";
  row.branchAuditLabel = hasRounding ? "مطابق ضمن التقريب" : "مطابق";

  if (matchMode === "mapping") {
    row.branchAuditNote = hasRounding
      ? "تمت مطابقة الفرع عبر ربط مؤكد ومحفوظ باستخدام HS Branch ID، مع فرق تقريب بسيط؛ لم تُستخدم القيم المالية لتحديد الهوية."
      : "تمت مطابقة الفرع عبر ربط مؤكد ومحفوظ باستخدام HS Branch ID؛ لم تُستخدم القيم المالية لتحديد الهوية.";
    return;
  }

  if (matchMode === "singleton") {
    row.branchAuditNote = hasRounding
      ? "تمت مطابقة الفرع بشكل حتمي لأن ملف الطلبات والفاتورة يحتوي كل منهما على فرع تشغيلي واحد فقط، مع فرق تقريب بسيط."
      : "تمت مطابقة الفرع بشكل حتمي لأن ملف الطلبات والفاتورة يحتوي كل منهما على فرع تشغيلي واحد فقط؛ لم تُستخدم القيم المالية لتحديد هوية الفرع.";
    return;
  }

  if (matchMode === "residual") {
    row.branchAuditNote = hasRounding
      ? "تمت مطابقة الفرع المتبقي بشكل حتمي بعد مطابقة جميع الفروع الأخرى، مع فرق تقريب بسيط؛ لم تُستخدم القيم المالية لتحديد الهوية."
      : "تمت مطابقة الفرع المتبقي بشكل حتمي بعد مطابقة جميع الفروع الأخرى؛ لم تُستخدم القيم المالية لتحديد الهوية.";
    return;
  }

  row.branchAuditNote = hasRounding
    ? "مطابق ضمن فروق التقريب المعتادة."
    : "مطابق.";
}

function emptyBranch(branch: string, branchId: string): BranchRow {
  return {
    branch,
    branchId,
    orders: 0,
    grossSales: 0,
    netSales: 0,
    commission: 0,
    commissionPct: 0,
    ccSuccess: 0,
    ccRejected: 0,
    netBankCards: 0,
    walletAmount: 0,
    riderWallet: 0,
    walletFeeBase: 0,
    walletFee: 0,
    rdfCampaigns: 0,
    freeDeliveryOrders: 0,
    compensation: 0,
    jokerFees: 0,
    hsFoodDiscount: 0,
    rewardsDiscount: 0,
    restaurantFoodDiscount: 0,
    totalFoodDiscount: 0,
    netMarketingDiscount: 0,
    partialRefund: 0,
    fulfillmentMods: 0,
    approvedRefunds: 0,
    waitingTimeFees: 0,
    bankFeeSuccess: 0,
    bankFeeRefunded: 0,
    totalCharges: 0,
  };
}


export interface HungerOptions {
  /**
   * Contract bank-card fee rate as a fraction, e.g. 0.025.
   * When provided it is authoritative for the audit; the invoice-implied rate is kept only for comparison.
   */
  manualBankRate?: number;
  invoice?: InvoiceFigures;
  cpcInvoice?: InvoiceFigures;
  /**
   * User-confirmed persistent identity mapping:
   * HS Branch ID -> branch name as it appears on the HungerStation invoice.
   */
  branchMappings?: Readonly<Record<string, string>>;
  label?: string;
}

export function analyzeHungerStation(
  file: ArrayBuffer,
  options: HungerOptions = {},
): AnalysisResult {
  return analyzeHungerStationSheets(workbookSheetSource(XLSX.read(file, { type: "array" })), options);
}

/** analyzeHungerStation for sheets already read (for large exports, by the low-memory reader). */
export function analyzeHungerStationSheets(
  wb: SheetSource,
  options: HungerOptions = {},
): AnalysisResult {
  const formatId = detectHungerStationFormat(wb);

  const orders = rowsOf(wb, "commissionable gmv");
  if (orders.length === 0) {
    throw new Error("لم يتم العثور على ورقة الطلبات (Commissionable GMV) في الملف.");
  }
  assertRequiredOrderColumns(orders[0]!);

  const branches = new Map<string, BranchRow>();
  const dailyMap = new Map<string, DailyRow>();
  const statusCounts: Record<string, number> = {};
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let rejectedOrders = 0;
  let rejectedSales = 0;

  const branchOf = (name: string, id: string): BranchRow => {
    const key = name || id || "غير محدد";
    let row = branches.get(key);
    if (!row) {
      row = emptyBranch(key, id);
      branches.set(key, row);
    }
    return row;
  };

  for (const [orderIndex, order] of orders.entries()) {
    const statusRaw = text(col(order, "Status"));
    if (!statusRaw) continue;
    statusCounts[statusRaw] = (statusCounts[statusRaw] ?? 0) + 1;

    const cls = classifyStatus(statusRaw);
    const branchName = text(col(order, "Branch Name"));
    const branchId = text(col(order, "HS Branch ID"));
    const row = branchOf(branchName, branchId);

    const paymentType = text(col(order, "Payment Type")).toLowerCase();
    const isOnline = paymentType.includes("online");

    const rowNumber = orderIndex + 2;
    const gmv = parseAmount(col(order, "Commissionable GMV (VAT Excluded)"), {
      platform: "hungerstation",
      sheet: "Commissionable GMV",
      row: rowNumber,
      column: "Commissionable GMV (VAT Excluded)",
    });
    const commission = parseAmount(col(order, "Commission"), {
      platform: "hungerstation",
      sheet: "Commissionable GMV",
      row: rowNumber,
      column: "Commission",
    });
    const ccAmount = parseAmount(col(order, "CC Amount"), {
      platform: "hungerstation",
      sheet: "Commissionable GMV",
      row: rowNumber,
      column: "CC Amount",
      optional: !isOnline,
    });
    const optionalAmount = (value: unknown, column: string) =>
      parseAmount(value, {
        platform: "hungerstation",
        sheet: "Commissionable GMV",
        row: rowNumber,
        column,
        optional: true,
      });
    const date = parseDate(
      col(order, "Operation Day", "Creation Time"),
      { order: "ISO" },
      {
        platform: "hungerstation",
        sheet: "Commissionable GMV",
        row: rowNumber,
        column: "Operation Day / Creation Time",
      },
    );

    // Commission base observed on real HS invoices:
    // successful + failed after pickup + failed by vendor + rejected.
    if (isCommissionableOrder(cls)) {
      row.netSales += gmv;
      row.commission += commission;
    }

    // Billable sales/RDF/discount base:
    // successful + failed after pickup + failed by vendor.
    if (isBillableOrder(cls)) {
      row.orders += 1;
      row.creditSales = (row.creditSales ?? 0) + gmv;
      // HungerStation's Sales Summary is based on Commissionable GMV, VAT inclusive.
      // Original Amount is pre-discount and overstates invoice sales when offers exist.
      row.grossSales += gmv * VAT;
      row.rdfCampaigns += optionalAmount(col(order, "Restaurant delivery Discount"), "Restaurant delivery Discount");
      row.jokerFees += optionalAmount(col(order, "Flash Deals Fee Excluding Vat"), "Flash Deals Fee Excluding Vat");
      row.hsFoodDiscount += optionalAmount(col(order, "HS Food Discount"), "HS Food Discount");
      row.rewardsDiscount += optionalAmount(col(order, "Rewards Discounts", "Rewards Discount"), "Rewards Discounts");
      row.restaurantFoodDiscount += optionalAmount(col(order, "Restaurant Food discount"), "Restaurant Food discount");

      if (isOnline) {
        // HS charges the successful bank fee on failed-by-vendor orders too.
        row.ccSuccess += ccAmount;

        // Wallet Amount / Transmitter Amount are collection flows. They do not
        // identify HungerStation's Wallet Payments Fee base, so they must never
        // be reused as a fee base. Wallet fee evidence is taken explicitly from
        // the invoice and kept non-independent unless a separate source supports it.

        // Collections exclude failed-by-vendor payments.
        if (isCollectionOrder(cls)) {
          row.netBankCards = (row.netBankCards ?? 0) + ccAmount;
          row.walletAmount += optionalAmount(col(order, "Wallet Amount"), "Wallet Amount");
          row.riderWallet += optionalAmount(col(order, "Transmitter Amount"), "Transmitter Amount");
        }
      }

      if (date) {
        let day = dailyMap.get(date);
        if (!day) {
          day = { date, orders: 0, grossSales: 0, netSales: 0, commission: 0, ccSuccess: 0 };
          dailyMap.set(date, day);
        }
        day.orders += 1;
        day.grossSales += gmv * VAT;
        day.netSales += gmv;
        day.commission += commission;
        if (isOnline) day.ccSuccess += ccAmount;
      }
    }

    if (cls === "rejected") {
      rejectedOrders += 1;
      rejectedSales += gmv;
      row.rejectedOrders = (row.rejectedOrders ?? 0) + 1;
      row.rejectedSales = (row.rejectedSales ?? 0) + gmv;
    }

    // Refunded bank fee base: rejected + failed before pickup + failed
    if (isOnline && (cls === "rejected" || cls === "failedBefore")) {
      row.ccRejected += ccAmount;
    }

    row.partialRefund += optionalAmount(col(order, "CC Refund Amount"), "CC Refund Amount") + optionalAmount(col(order, "Wallet Refund"), "Wallet Refund");

    if (date) {
      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;
    }
  }

  // Real invoices also bill failed-by-vendor RDF rows.
  for (const fd of rowsOf(wb, "free delivery")) {
    const cls = classifyStatus(text(col(fd, "Status")));
    if (!isBillableOrder(cls)) continue;
    const row = branchOf(text(col(fd, "Branch Name")), text(col(fd, "HS Branch ID")));
    row.freeDeliveryOrders += 1;
  }

  for (const [index, comp] of rowsOf(wb, "compensated").entries()) {
    const row = branchOf(text(col(comp, "Branch Name")), text(col(comp, "HS Branch ID")));
    row.compensation += parseAmount(col(comp, "Compensation"), {
      platform: "hungerstation",
      sheet: "Compensated Orders",
      row: index + 2,
      column: "Compensation",
    });
  }

  for (const [index, mod] of rowsOf(wb, "fulfillment").entries()) {
    const row = branchOf(text(col(mod, "Branch Name")), text(col(mod, "HS Branch ID")));
    row.fulfillmentMods += parseAmount(col(mod, "Modification Amount"), {
      platform: "hungerstation",
      sheet: "Fulfillment",
      row: index + 2,
      column: "Modification Amount",
    });
  }

  for (const [index, refund] of rowsOf(wb, "disputes").entries()) {
    const row = branchOf(text(col(refund, "Branch Name")), text(col(refund, "HS Branch ID")));
    row.approvedRefunds += parseAmount(col(refund, "Refunded Amount"), {
      platform: "hungerstation",
      sheet: "Disputes",
      row: index + 2,
      column: "Refunded Amount",
    });
  }

  for (const [index, wait] of rowsOf(wb, "waiting time").entries()) {
    const row = branchOf(text(col(wait, "Branch Name")), text(col(wait, "HS Branch ID")));
    row.waitingTimeFees += parseAmount(col(wait, "Avoidable Waiting Time Fee"), {
      platform: "hungerstation",
      sheet: "Waiting Time",
      row: index + 2,
      column: "Avoidable Waiting Time Fee",
    });
  }

  const branchList = [...branches.values()];

  // VAT-exclusive conversions per the official guide
  for (const row of branchList) {
    row.rdfCampaigns = row.rdfCampaigns / VAT;
    row.compensation = row.compensation / VAT;
    row.waitingTimeFees = row.waitingTimeFees / VAT;
    row.totalFoodDiscount = row.hsFoodDiscount + row.restaurantFoodDiscount;
    row.netMarketingDiscount = row.hsFoodDiscount + row.rewardsDiscount;
    row.totalCollections =
      (row.netBankCards ?? 0) +
      row.walletAmount +
      row.riderWallet +
      (row.netMarketingDiscount ?? 0) +
      row.approvedRefunds;
    row.commissionPct = row.netSales > 0 ? row.commission / row.netSales : 0;
  }

  const totalCcSuccess = branchList.reduce((sum, r) => sum + r.ccSuccess, 0);
  const totalCcRejected = branchList.reduce((sum, r) => sum + r.ccRejected, 0);
  const totalNetBankCards = branchList.reduce((sum, r) => sum + (r.netBankCards ?? 0), 0);
  // Fixed charges truly absent from the order export remain invoice-only.
  const invoiceExtras = options.invoice?.extras ?? [];
  const legacyWalletFee = invoiceExtras
    .filter((extra) => extra.label.includes("محفظة"))
    .reduce((sum, extra) => sum + extra.amount, 0);
  const invoiceOnlyExtras = invoiceExtras
    .filter((extra) => !extra.label.includes("محفظة"))
    .reduce((sum, extra) => sum + extra.amount, 0);

  const invoiceBranchWalletFees = options.invoice?.branches ?? [];
  const branchWalletFeeTotal = invoiceBranchWalletFees.reduce(
    (sum, branch) => sum + (branch.walletFee ?? 0),
    0,
  );
  const branchWalletFeeBaseTotal = invoiceBranchWalletFees.reduce(
    (sum, branch) => sum + (branch.walletFeeBase ?? 0),
    0,
  );

  // Wallet Payments Fee is reported by HungerStation's invoice. Do not derive
  // its fee base from Wallet Amount / Transmitter Amount in the order export.
  const invoiceWalletFee =
    options.invoice?.walletFee ??
    (branchWalletFeeTotal > 0 ? branchWalletFeeTotal : undefined) ??
    legacyWalletFee;
  const invoiceWalletFeeBase =
    options.invoice?.walletFeeBase ??
    (branchWalletFeeBaseTotal > 0 ? branchWalletFeeBaseTotal : 0);

  // Card fees are independently auditable from CC Amount when a contract rate is
  // supplied. If no rate is supplied, derive only a diagnostic card rate after
  // removing the invoice-reported Wallet Payments Fee.
  const cardPaymentFeeBase = totalCcSuccess + totalCcRejected;
  const invoiceCardPaymentFees =
    options.invoice?.paymentFees !== undefined
      ? Math.max(0, options.invoice.paymentFees - invoiceWalletFee)
      : undefined;
  const invoiceImpliedBankRate =
    invoiceCardPaymentFees !== undefined &&
    invoiceCardPaymentFees > 0 &&
    cardPaymentFeeBase > 0
      ? Math.round((invoiceCardPaymentFees / cardPaymentFeeBase) / 0.0005) * 0.0005
      : 0;

  let bankRate = 0;
  let bankRateSource: "invoice" | "manual" | "none" = "none";
  if (options.manualBankRate && options.manualBankRate > 0) {
    bankRate = options.manualBankRate;
    bankRateSource = "manual";
  } else if (invoiceImpliedBankRate > 0) {
    bankRate = invoiceImpliedBankRate;
    bankRateSource = "invoice";
  }

  for (const row of branchList) {
    row.bankFeeSuccess = row.ccSuccess * bankRate;
    row.bankFeeRefunded = row.ccRejected * bankRate;
    row.walletFeeBase = undefined;
    row.walletFee = 0;
    row.totalCharges =
      row.commission +
      row.bankFeeSuccess +
      row.bankFeeRefunded +
      row.rdfCampaigns +
      row.compensation +
      row.jokerFees +
      row.waitingTimeFees;
  }

  branchList.sort((a, b) => b.netSales - a.netSales);

  const sum = (pick: (r: BranchRow) => number) => branchList.reduce((t, r) => t + pick(r), 0);

  const summary: Summary = {
    platform: "hungerstation",
    orders: sum((r) => r.orders),
    grossSales: sum((r) => r.grossSales),
    netSales: sum((r) => r.netSales),
    commission: sum((r) => r.commission),
    commissionPct: 0,
    ccSuccess: totalCcSuccess,
    ccRejected: totalCcRejected,
    netBankCards: totalNetBankCards,
    walletAmount: sum((r) => r.walletAmount),
    riderWallet: sum((r) => r.riderWallet),
    walletFeeBase: invoiceWalletFeeBase,
    walletFee: invoiceWalletFee,
    rdfCampaigns: sum((r) => r.rdfCampaigns),
    compensation: sum((r) => r.compensation),
    jokerFees: sum((r) => r.jokerFees),
    hsFoodDiscount: sum((r) => r.hsFoodDiscount),
    rewardsDiscount: sum((r) => r.rewardsDiscount),
    restaurantFoodDiscount: sum((r) => r.restaurantFoodDiscount),
    totalFoodDiscount: sum((r) => r.totalFoodDiscount),
    netMarketingDiscount: sum((r) => r.netMarketingDiscount ?? 0),
    partialRefund: sum((r) => r.partialRefund),
    fulfillmentMods: sum((r) => r.fulfillmentMods),
    approvedRefunds: sum((r) => r.approvedRefunds),
    waitingTimeFees: sum((r) => r.waitingTimeFees),
    rejectedOrders,
    rejectedSales,
    totalCollections: 0,
    bankRate,
    invoiceImpliedBankRate,
    bankRateSource,
    bankFeeSuccess: sum((r) => r.bankFeeSuccess),
    bankFeeRefunded: sum((r) => r.bankFeeRefunded),
    invoiceOnlyExtras,
    totalCharges: sum((r) => r.totalCharges) + invoiceWalletFee + invoiceOnlyExtras,
    branchCount: branchList.length,
    statusCounts,
    periodStart,
    periodEnd,
  };
  summary.commissionPct = summary.netSales > 0 ? summary.commission / summary.netSales : 0;
  summary.totalCollections = sum((row) => row.totalCollections ?? 0);

  const invoice = options.invoice ?? { lines: [] };
  if (options.cpcInvoice?.totalIncVat) invoice.cpc = options.cpcInvoice.totalIncVat;

  // Branch identity must be independent from the values being audited.
  // Match by normalized name first. When both sources contain exactly one
  // operational branch and the invoice branch has no usable identity, a
  // one-to-one cardinality match is deterministic and does not use audited
  // amounts to infer identity.
  const invoiceBranches = invoice.branches ?? [];
  const unmatchedInvoiceBranches = new Set(invoiceBranches.map((_, index) => index));
  const singletonUnnamedInvoiceIndex =
    branchList.length === 1 &&
    invoiceBranches.length === 1 &&
    !normalizeBranchName(invoiceBranches[0]?.branch)
      ? 0
      : -1;

  const unmatchedDataBranches: BranchRow[] = [];

  for (const row of branchList) {
    let matchMode: "mapping" | "name" | "singleton" = "name";
    let matchedIndex = findMappedInvoiceBranchMatch(
      row,
      invoiceBranches,
      unmatchedInvoiceBranches,
      options.branchMappings,
    );

    if (matchedIndex >= 0) {
      matchMode = "mapping";
    } else {
      matchedIndex = findInvoiceBranchMatch(
        row,
        invoiceBranches,
        unmatchedInvoiceBranches,
      );
    }

    if (
      matchedIndex < 0 &&
      singletonUnnamedInvoiceIndex >= 0 &&
      unmatchedInvoiceBranches.has(singletonUnnamedInvoiceIndex)
    ) {
      matchedIndex = singletonUnnamedInvoiceIndex;
      matchMode = "singleton";
    }

    if (matchedIndex < 0) {
      unmatchedDataBranches.push(row);
      continue;
    }

    const matched = invoiceBranches[matchedIndex]!;
    unmatchedInvoiceBranches.delete(matchedIndex);
    applyInvoiceBranchMatch(row, matched, invoiceBranches.length, matchMode);
  }

  const residualOperationalInvoiceIndices = [...unmatchedInvoiceBranches].filter((index) => {
    const branch = invoiceBranches[index];
    return branch ? invoiceBranchHasOperationalOrders(branch) : false;
  });

  if (
    unmatchedDataBranches.length === 1 &&
    residualOperationalInvoiceIndices.length === 1
  ) {
    const row = unmatchedDataBranches.pop()!;
    const matchedIndex = residualOperationalInvoiceIndices[0]!;
    const matched = invoiceBranches[matchedIndex]!;
    unmatchedInvoiceBranches.delete(matchedIndex);
    applyInvoiceBranchMatch(row, matched, invoiceBranches.length, "residual");
  }

  for (const row of unmatchedDataBranches) {
    if (!invoiceBranches.length) continue;
    row.branchAuditStatus = "unmatched";
    row.branchAuditLabel = "غير مطابق";
    row.branchAuditNote =
      "لم يتم العثور على اسم فرع مطابق بشكل موثوق في صفحات تفاصيل فاتورة هنقرستيشن.";
  }

  // Keep branches that exist only in the invoice visible in the branch report.
  for (const index of unmatchedInvoiceBranches) {
    const unmatched = invoiceBranches[index];
    if (!unmatched) continue;
    const row = emptyBranch(unmatched.branch || `فرع في الفاتورة فقط ${index + 1}`, "");
    row.invoiceBranchName = unmatched.branch;
    row.invoiceCommission = unmatched.salesCommission;
    row.invoicePaymentFees = unmatched.paymentFees;
    row.invoiceWalletFee = unmatched.walletFee ?? 0;
    row.invoiceCardPaymentFees =
      unmatched.paymentFees !== undefined
        ? unmatched.paymentFees - (unmatched.walletFee ?? 0)
        : undefined;
    row.walletFeeBase = unmatched.walletFeeBase;
    row.walletFee = unmatched.walletFee ?? 0;
    row.invoiceOtherCharges = unmatched.otherCommission;
    row.invoiceOnlyBranchCharges = unmatched.invoiceOnlyCharges;
    row.invoiceCollections = unmatched.totalCollections;
    row.invoiceCreditSales = unmatched.creditSales;
    row.orders =
      (unmatched.creditSalesOrders ?? 0) + (unmatched.rejectedSalesOrders ?? 0);
    row.branchAuditStatus = "invoice_only";
    row.branchAuditLabel = "في الفاتورة فقط";
    row.branchAuditNote =
      (unmatched.totalExVat ?? 0) === 0 && (unmatched.totalCollections ?? 0) === 0
        ? "الفرع موجود في الفاتورة فقط ولا توجد عليه حركة مالية."
        : "الفرع موجود في الفاتورة لكنه غير موجود في ملف الطلبات المرفوع.";
    branchList.push(row);
  }

  // Keep invoice-only rows at the end while preserving operational ranking.
  branchList.sort((left, right) => {
    if (left.branchAuditStatus === "invoice_only" && right.branchAuditStatus !== "invoice_only") return 1;
    if (right.branchAuditStatus === "invoice_only" && left.branchAuditStatus !== "invoice_only") return -1;
    return right.netSales - left.netSales;
  });

  // Recompute platform cost after branch-level invoice wallet fees have been
  // attached. Fixed invoice-only charges remain separate at summary level.
  summary.walletFeeBase = invoiceWalletFeeBase;
  summary.walletFee = invoiceWalletFee;
  summary.totalCharges =
    branchList
      .filter((row) => row.branchAuditStatus !== "invoice_only")
      .reduce(
        (total, row) => total + row.totalCharges - (row.walletFee ?? 0),
        0,
      ) +
    invoiceWalletFee +
    invoiceOnlyExtras;

  // Keep invoice-only charges separate from independently reconstructed charges.
  // This prevents Tadqeeq from "verifying" an invoice line with the same value read from that invoice.
  const dataOnlyOthersComputed =
    summary.rdfCampaigns +
    summary.compensation +
    summary.jokerFees +
    summary.waitingTimeFees;
  const cardPaymentFeesComputed =
    summary.bankFeeSuccess + summary.bankFeeRefunded;
  const invoicedDataOnlyOthers =
    invoice.othersCommission !== undefined
      ? Math.max(0, invoice.othersCommission - invoiceOnlyExtras)
      : undefined;
  const cardFeeEvidence =
    bankRateSource === "manual"
      ? "contract"
      : bankRateSource === "invoice"
        ? "invoice_derived"
        : "data";

  const commissionCoveredByBranches = branchList.some(
    (branch) => branch.invoiceCommission !== undefined,
  );
  const paymentCoveredByBranches = branchList.some(
    (branch) => branch.invoicePaymentFees !== undefined,
  );
  const otherFeesCoveredByBranches = branchList.some(
    (branch) => branch.invoiceOtherCharges !== undefined,
  );
  const creditSalesCoveredByBranches = branchList.some(
    (branch) =>
      branch.invoiceCreditSales !== undefined ||
      branch.branchAuditNote?.includes("ملخص مبيعات الفرع مفقود"),
  );
  const collectionsCoveredByBranches = branchList.some(
    (branch) => branch.invoiceCollections !== undefined,
  );

  const checks: CheckRow[] = [
    {
      code: "HS_SALES_COMMISSION",
      category: "commission",
      coveredByBranches: commissionCoveredByBranches,
      label: "عمولة المبيعات",
      computed: summary.commission,
      invoiced: invoice.salesCommission,
      evidence: "data",
      hint: "مجموع عمود العمولة للطلبات الناجحة والفاشلة بعد الاستلام والمرفوضة.",
    },
    {
      code: "HS_CARD_PAYMENT_FEES",
      category: "payment_fee",
      coveredByBranches: paymentCoveredByBranches,
      label: "رسوم الدفع الإلكتروني القابلة للتحقق (البطاقات)",
      computed: cardPaymentFeesComputed,
      invoiced: invoiceCardPaymentFees,
      evidence: cardFeeEvidence,
      tolerance: HUNGERSTATION_TOLERANCES.paymentFee,
      hint:
        bankRateSource === "manual"
          ? "نسبة العقد × (أساس البطاقات الناجحة + أساس البطاقات المرتجعة). Wallet Payments Fee مستبعد لأنه لا يملك أساساً مستقلاً موثوقاً في ملف الطلبات."
          : "تم استنتاج نسبة البطاقات بعد استبعاد Wallet Payments Fee الوارد في الفاتورة؛ النتيجة تشخيصية وليست تحققاً مستقلاً.",
    },
    {
      code: "HS_OTHER_COMMISSION_DATA",
      category: "other_fee",
      coveredByBranches: otherFeesCoveredByBranches,
      label: "عمولات أخرى القابلة للتحقق من البيانات",
      computed: dataOnlyOthersComputed,
      invoiced: invoicedDataOnlyOthers,
      evidence: "data",
      hint: "RDF + تعويضات العملاء + رسوم العروض + وقت الانتظار (بدون ضريبة)، بعد استبعاد البنود الموجودة في الفاتورة فقط.",
    },
    {
      code: "HS_INVOICE_TOTAL_EX_VAT",
      category: "invoice_total",
      controlOnly: true,
      label: "إجمالي الفاتورة (بدون ضريبة)",
      computed:
        summary.commission +
        cardPaymentFeesComputed +
        invoiceWalletFee +
        dataOnlyOthersComputed +
        invoiceOnlyExtras,
      invoiced: invoice.totalExVat,
      evidence: invoiceOnlyExtras > 0 ? "mixed" : cardFeeEvidence,
      hint:
        invoiceOnlyExtras > 0
          ? "إجمالي تسوية يجمع البنود المحتسبة مع بنود لا توجد إلا في الفاتورة؛ لا يُعد تحققاً مستقلاً لكل مكوّن."
          : undefined,
    },
  ];

  if (invoice.creditSales !== undefined) {
    checks.push({
      code: "HS_CREDIT_SALES",
      category: "sales",
      coveredByBranches: creditSalesCoveredByBranches,
      label: "مبيعات الائتمان (بدون ضريبة)",
      computed: summary.grossSales / VAT,
      invoiced: invoice.creditSales,
      evidence: "data",
      hint: "Commissionable GMV للطلبات القابلة للفوترة، قبل ضريبة القيمة المضافة.",
    });
  }

  if (invoice.rejectedSales !== undefined) {
    checks.push({
      code: "HS_REJECTED_SALES",
      category: "rejected_sales",
      label: "المبيعات المرفوضة (بدون ضريبة)",
      computed: summary.rejectedSales ?? 0,
      invoiced: invoice.rejectedSales,
      evidence: "data",
      hint: "Commissionable GMV للطلبات بحالة Rejected فقط.",
    });
  }

  if (invoiceWalletFee > 0) {
    const walletArithmetic =
      invoiceWalletFeeBase > 0 && bankRate > 0
        ? invoiceWalletFeeBase * bankRate
        : invoiceWalletFee;

    checks.push({
      code: "HS_WALLET_PAYMENT_FEE",
      category: "payment_fee",
      controlOnly: true,
      label: "رسوم مدفوعات المحافظ (أساس من الفاتورة)",
      computed: walletArithmetic,
      invoiced: invoiceWalletFee,
      evidence: bankRateSource === "manual" ? "mixed" : "invoice_derived",
      tolerance: HUNGERSTATION_TOLERANCES.paymentFee,
      hint:
        "أساس Wallet Payments Fee مأخوذ من تفاصيل فاتورة هنقرستيشن؛ ملف الطلبات لا يحدد بشكل موثوق أي جزء من Wallet Amount / Transmitter Amount يخضع لهذه الرسوم. لذلك هذا فحص اتساق وليس تحققاً مستقلاً من الأساس.",
    });
  }

  if (invoice.totalOnlineSales !== undefined) {
    checks.push({
      code: "HS_TOTAL_COLLECTIONS",
      category: "collections",
      coveredByBranches: collectionsCoveredByBranches,
      label: "إجمالي التحصيلات",
      computed: summary.totalCollections ?? 0,
      invoiced: Math.abs(invoice.totalOnlineSales),
      evidence: "data",
      hint:
        "صافي مدفوعات البطاقات + محافظ العملاء + محافظ المندوبين + صافي الخصومات التسويقية + الاعتراضات المعتمدة.",
    });
  }

  if (invoiceExtras.length) {
    const visibleExtras = invoiceExtras.filter((e) => !e.label.includes("محفظة"));
    for (const [extraIndex, extra] of visibleExtras.entries()) {
      checks.push({
        code: "HS_INVOICE_ONLY_EXTRA_" + String(extraIndex + 1),
        category: "unsupported_charge",
        invoiceOnly: true,
        label: `${extra.label} (فاتورة فقط)`,
        computed: 0,
        invoiced: extra.amount,
        evidence: "invoice_only",
        hint: "لا يوجد أساس مستقل لهذا البند في ملف الطلبات؛ يحتاج إلى عقد أو مستند تشغيلي للتحقق منه.",
      });
    }
  }

  if (invoice.totalIncVat !== undefined && invoice.netDue !== undefined) {
    checks.push({
      code: "HS_NET_DUE_AFTER_INVOICE",
      category: "settlement",
      label: "صافي المستحق بعد فاتورة العمولة",
      computed: (summary.totalCollections ?? 0) - invoice.totalIncVat,
      invoiced: Math.abs(invoice.netDue),
      evidence: "mixed",
      hint:
        "التحصيلات معاد احتسابها من ملف الطلبات، ثم يُخصم منها إجمالي فاتورة العمولة بعد الضريبة كما ورد في الفاتورة.",
    });
  }

  const label =
    options.label ??
    (periodStart && periodEnd
      ? `هنقرستيشن · ${periodStart} — ${periodEnd}`
      : "هنقرستيشن");

  return {
    platform: "hungerstation",
    formatIds: [formatId],
    label,
    summary,
    branches: branchList,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    invoice,
    checks,
  };
}
