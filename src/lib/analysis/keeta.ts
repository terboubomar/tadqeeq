import * as XLSX from "xlsx";

import type {
  AnalysisResult,
  BranchRow,
  CheckRow,
  DailyRow,
  InvoiceFigures,
  Summary,
} from "./types";
import { ParseError, parseAmount } from "./parse";

const VAT_RATE = 0.15;
const VAT_FACTOR = 1 + VAT_RATE;
const BRANCH_MATCH_TOLERANCE = 0.02;
const BRANCH_ROUNDING_TOLERANCE = 0.06;

const SALES_COLUMNS = [
  "Original item price (VAT included)",
  "Total Top-up to Minimum (VAT included)",
  "Total Compensation to Merchant (VAT included)",
  "Delivery fee for merchant delivery order (including VAT)",
  "Adjustment increases (not included in invoices)",
];

const COMMISSION_COLUMNS = ["Subtotal of commission fee (VAT included)"];
const BANK_COLUMNS = ["Bank fee (VAT included)"];
const DELIVERY_COLUMNS = ["Delivery subsidies (Keeta delivery) covered by merchant"];
const PRODUCT_CAMPAIGN_COLUMNS = ["Product campaign expenses by merchant (VAT included)"];
const MERCHANT_AD_COLUMNS = ["Merchant ad spend (including VAT)", "Advertising costs"];
const COMPENSATION_COLUMNS = [
  "Total Platform Deductions from Merchant (Merchant's Liability, VAT included)",
];
const INVOICE_OTHER_COLUMNS = [
  "Photography Service Fee(VAT included)",
  "Monthly service fee (including VAT)",
  "Subscription fee (including VAT)",
  "Adjustment (including invoice)",
];
const CREDIT_OTHER_COLUMNS = [
  "Delivery promotion subsidy (merchant delivery, including VAT) covered by merchant",
  "VAT withholding",
  "POS Machine Fee(VAT included)",
  "Adjustment decreases (not included in invoices)",
];

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeHeader(value: unknown): string {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const raw = text(value);
  if (!raw) return "";

  const iso = raw.match(/\d{4}[-/]\d{2}[-/]\d{2}/);
  if (iso) return iso[0].replace(/\//g, "-");

  const english = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (english) {
    const monthNames = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const month = monthNames.indexOf(english[2]!.slice(0, 3).toLowerCase()) + 1;
    if (month > 0) {
      return english[3] + "-" + String(month).padStart(2, "0") + "-" +
        String(Number(english[1])).padStart(2, "0");
    }
  }

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 80000) {
    const parsed = XLSX.SSF.parse_date_code(asNumber);
    if (parsed) {
      return (
        parsed.y +
        "-" +
        String(parsed.m).padStart(2, "0") +
        "-" +
        String(parsed.d).padStart(2, "0")
      );
    }
  }

  return raw.slice(0, 10);
}

function findSheet(wb: XLSX.WorkBook, name: string): string | undefined {
  const target = name.toLowerCase();
  return (
    wb.SheetNames.find((sheetName) => sheetName.toLowerCase() === target) ??
    wb.SheetNames.find((sheetName) => sheetName.toLowerCase().includes(target))
  );
}

function rowsFromSheet(
  sheet: XLSX.WorkSheet,
  headerMatcher: (headers: string[]) => boolean,
): Record<string, unknown>[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const headerIndex = matrix.findIndex((row) => headerMatcher(row.map(normalizeHeader)));
  if (headerIndex < 0) return [];

  const headers = matrix[headerIndex]!.map((value) => text(value));
  const rows: Record<string, unknown>[] = [];

  for (const raw of matrix.slice(headerIndex + 1)) {
    if (!raw.some((value) => value !== null && value !== "")) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) row[header] = raw[index] ?? null;
    });
    rows.push(row);
  }

  return rows;
}

function orderRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const rows = rowsFromSheet(sheet, (headers) =>
    headers.includes("brand name") &&
    (headers.includes("store name") || headers.includes("restaurant name")) &&
    (headers.includes("payable to merchant") || headers.includes("payable to restaurant")),
  );

  if (!rows.length) {
    throw new Error("تعذّر تحديد صف عناوين Order Summary في ملف كيتا.");
  }
  return rows;
}

function findKey(row: Record<string, unknown>, ...candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  const normalized = new Map(keys.map((key) => [normalizeHeader(key), key]));

  for (const candidate of candidates) {
    const exact = normalized.get(normalizeHeader(candidate));
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const target = normalizeHeader(candidate);
    const partial = keys.find((key) => normalizeHeader(key).includes(target));
    if (partial) return partial;
  }

  return undefined;
}

function valueOf(row: Record<string, unknown>, ...candidates: string[]): unknown {
  const key = findKey(row, ...candidates);
  return key ? row[key] : null;
}

function sumColumns(
  row: Record<string, unknown>,
  columns: string[],
  rowNumber?: number,
): number {
  return columns.reduce((sum, column) => {
    const key = findKey(row, column);
    return (
      sum +
      (key
        ? parseAmount(row[key], {
            platform: "keeta",
            sheet: "Order Summary",
            row: rowNumber,
            column: key,
            optional: true,
          })
        : 0)
    );
  }, 0);
}

function assertRequiredOrderColumns(row: Record<string, unknown>): void {
  const required: string[][] = [
    ["Brand Name"],
    ["Store name", "Restaurant Name"],
    ["Transaction date"],
    ["Transaction type"],
    ["Original item price (VAT included)"],
    ["Subtotal of commission fee (VAT included)"],
    ["Bank fee (VAT included)"],
    ["Payable to merchant", "Payable to Restaurant"],
  ];

  for (const candidates of required) {
    if (!findKey(row, ...candidates)) {
      throw new ParseError(
        "عمود مطلوب مفقود في ملف كيتا: " + candidates.join(" / "),
        undefined,
        {
          platform: "keeta",
          sheet: "Order Summary",
          column: candidates.join(" / "),
        },
      );
    }
  }
}

function isOrderTransaction(row: Record<string, unknown>): boolean {
  const transactionType = normalizeHeader(valueOf(row, "Transaction type"));
  return transactionType === "delivery order" || transactionType === "pickup order";
}

interface KeetaExcelBranchControl {
  restaurantId: string;
  branch: string;
  invoiceAmount: number;
  payable: number;
  days: number;
}

interface KeetaExcelControls {
  branches: Map<string, KeetaExcelBranchControl>;
  invoiceAmount?: number;
  payable?: number;
  invoiceDetailRows: number;
  billingInvoiceAmount?: number;
  billingPayable?: number;
  billingRows: number;
}

function parseExcelControls(wb: XLSX.WorkBook): KeetaExcelControls {
  const controls: KeetaExcelControls = {
    branches: new Map(),
    invoiceDetailRows: 0,
    billingRows: 0,
  };

  const invoiceSheetName = findSheet(wb, "Invoice Details");
  if (invoiceSheetName && wb.Sheets[invoiceSheetName]) {
    const rows = rowsFromSheet(wb.Sheets[invoiceSheetName]!, (headers) =>
      headers.includes("restaurant id") &&
      headers.includes("transaction date") &&
      headers.includes("invoice amount") &&
      headers.includes("payable to restaurant"),
    );

    let invoiceAmount = 0;
    let payable = 0;
    for (const row of rows) {
      const restaurantId = text(valueOf(row, "Restaurant ID"));
      if (!restaurantId) continue;
      const branchName =
        text(valueOf(row, "shop code")) ||
        text(valueOf(row, "Restaurant Name")) ||
        "Restaurant ID " + restaurantId;
      let branch = controls.branches.get(restaurantId);
      if (!branch) {
        branch = { restaurantId, branch: branchName, invoiceAmount: 0, payable: 0, days: 0 };
        controls.branches.set(restaurantId, branch);
      }
      branch.invoiceAmount += parseAmount(valueOf(row, "Invoice amount"), { platform: "keeta", sheet: "Invoice Details", column: "Invoice amount", optional: true });
      branch.payable += parseAmount(valueOf(row, "Payable to Restaurant"), { platform: "keeta", sheet: "Invoice Details", column: "Payable to Restaurant", optional: true });
      branch.days += 1;
      invoiceAmount += parseAmount(valueOf(row, "Invoice amount"), { platform: "keeta", sheet: "Invoice Details", column: "Invoice amount", optional: true });
      payable += parseAmount(valueOf(row, "Payable to Restaurant"), { platform: "keeta", sheet: "Invoice Details", column: "Payable to Restaurant", optional: true });
    }

    controls.invoiceDetailRows = rows.length;
    if (rows.length) {
      controls.invoiceAmount = invoiceAmount;
      controls.payable = payable;
    }
  }

  const billingSheetName = findSheet(wb, "Billing data summary");
  if (billingSheetName && wb.Sheets[billingSheetName]) {
    const rows = rowsFromSheet(wb.Sheets[billingSheetName]!, (headers) =>
      headers.includes("transaction date") &&
      headers.includes("total payable to restaurant") &&
      headers.includes("total commission(vat included)"),
    );

    let invoiceAmount = 0;
    let payable = 0;
    for (const row of rows) {
      invoiceAmount += -(
        parseAmount(valueOf(row, "Total Commission(VAT included)"), { platform: "keeta", sheet: "Billing data summary", column: "Total Commission(VAT included)", optional: true }) +
        parseAmount(valueOf(row, "Total Bank Fee(VAT included)"), { platform: "keeta", sheet: "Billing data summary", column: "Total Bank Fee(VAT included)", optional: true }) +
        parseAmount(valueOf(row, "Delivery subsidies (Keeta delivery) covered by merchant"), { platform: "keeta", sheet: "Billing data summary", column: "Delivery subsidies (Keeta delivery) covered by merchant", optional: true }) +
        parseAmount(valueOf(row, "Photography Service Fee(VAT included)"), { platform: "keeta", sheet: "Billing data summary", column: "Photography Service Fee(VAT included)", optional: true }) +
        parseAmount(valueOf(row, "Adjustment (including invoice)"), { platform: "keeta", sheet: "Billing data summary", column: "Adjustment (including invoice)", optional: true }) +
        parseAmount(valueOf(row, "Merchant ad spend (including VAT)"), { platform: "keeta", sheet: "Billing data summary", column: "Merchant ad spend (including VAT)", optional: true })
      );
      payable += parseAmount(valueOf(row, "Total Payable to Restaurant"), { platform: "keeta", sheet: "Billing data summary", column: "Total Payable to Restaurant", optional: true });
    }

    controls.billingRows = rows.length;
    if (rows.length) {
      controls.billingInvoiceAmount = invoiceAmount;
      controls.billingPayable = payable;
    }
  }

  return controls;
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
    walletAmount: 0,
    riderWallet: 0,
    rdfCampaigns: 0,
    freeDeliveryOrders: 0,
    compensation: 0,
    jokerFees: 0,
    hsFoodDiscount: 0,
    rewardsDiscount: 0,
    restaurantFoodDiscount: 0,
    totalFoodDiscount: 0,
    partialRefund: 0,
    fulfillmentMods: 0,
    approvedRefunds: 0,
    waitingTimeFees: 0,
    bankFeeSuccess: 0,
    bankFeeRefunded: 0,
    totalCharges: 0,
    keetaSalesExVat: 0,
    keetaSalesVat: 0,
    keetaCommissionExVat: 0,
    keetaBankFeesExVat: 0,
    keetaDeliveryCampaignExVat: 0,
    keetaAdvertisingExVat: 0,
    keetaProductCampaignExVat: 0,
    keetaMerchantAdExVat: 0,
    keetaPosFeesExVat: 0,
    keetaCompensationExVat: 0,
    keetaOtherExpensesExVat: 0,
    keetaCommissionInvoiceExVat: 0,
    keetaCommissionInvoiceInclVat: 0,
    keetaCreditSales: 0,
    keetaTotalCostExVat: 0,
    keetaInputVat: 0,
    keetaTotalCostInclVat: 0,
    keetaSourcePayable: 0,
    keetaSettlementVariance: 0,
    keetaPlatformCostPct: 0,
    keetaAvgOrderValueInclVat: 0,
  };
}

interface RawKeetaBranch {
  row: BranchRow;
  orderNumbers: Set<string>;
  salesRaw: number;
  originalItemPriceRaw: number;
  topUpRaw: number;
  compensationRevenueRaw: number;
  restaurantDeliveryRevenueRaw: number;
  merchantIncreaseRaw: number;
  commissionRaw: number;
  bankRaw: number;
  deliveryRaw: number;
  productCampaignRaw: number;
  merchantAdRaw: number;
  compensationRaw: number;
  invoiceOtherRaw: number;
  creditOtherRaw: number;
  posRaw: number;
  payableRaw: number;
}

export interface KeetaOptions {
  invoice?: InvoiceFigures;
  label?: string;
}

function absVariance(value: number | undefined): number {
  return Math.abs(value ?? 0);
}

function auditState(
  maxVariance: number,
  sourceLabel: string,
): Pick<BranchRow, "branchAuditStatus" | "branchAuditLabel" | "branchAuditNote"> {
  if (maxVariance <= BRANCH_MATCH_TOLERANCE) {
    return {
      branchAuditStatus: "matched",
      branchAuditLabel: "مطابق",
      branchAuditNote: "مطابقة كاملة مع " + sourceLabel + ".",
    };
  }
  if (maxVariance <= BRANCH_ROUNDING_TOLERANCE) {
    return {
      branchAuditStatus: "rounding",
      branchAuditLabel: "مطابق ضمن التقريب",
      branchAuditNote: "الفروق مع " + sourceLabel + " ضمن تقريب كيتا المعتاد.",
    };
  }
  return {
    branchAuditStatus: "warning",
    branchAuditLabel: "يحتاج مراجعة",
    branchAuditNote: "يوجد فرق بين Order Summary و" + sourceLabel + ".",
  };
}

export function analyzeKeeta(file: ArrayBuffer, options: KeetaOptions = {}): AnalysisResult {
  const wb = XLSX.read(file, { type: "array" });
  const sheetName = findSheet(wb, "Order Summary");

  if (!sheetName || !wb.Sheets[sheetName]) {
    throw new Error("لم يتم العثور على ورقة Order Summary في ملف كيتا.");
  }

  const rows = orderRows(wb.Sheets[sheetName]!);
  assertRequiredOrderColumns(rows[0]!);
  const excelControls = parseExcelControls(wb);
  const branches = new Map<string, RawKeetaBranch>();
  const dailyMap = new Map<string, DailyRow>();
  const dailyOrderNumbers = new Map<string, Set<string>>();
  const orderStatuses = new Map<string, string>();
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  for (const [sourceIndex, sourceRow] of rows.entries()) {
    const store =
      text(valueOf(sourceRow, "Store name", "Restaurant Name")) ||
      text(valueOf(sourceRow, "Brand Name")) ||
      "غير محدد";
    const storeId = text(valueOf(sourceRow, "Store ID", "Restaurant ID"));
    const shopCode = text(valueOf(sourceRow, "shop code"));
    const branchKey = storeId ? "id:" + storeId : "fallback:" + shopCode + "|" + store;

    let branch = branches.get(branchKey);
    if (!branch) {
      branch = {
        row: emptyBranch(store, storeId || shopCode),
        orderNumbers: new Set<string>(),
        salesRaw: 0,
        originalItemPriceRaw: 0,
        topUpRaw: 0,
        compensationRevenueRaw: 0,
        restaurantDeliveryRevenueRaw: 0,
        merchantIncreaseRaw: 0,
        commissionRaw: 0,
        bankRaw: 0,
        deliveryRaw: 0,
        productCampaignRaw: 0,
        merchantAdRaw: 0,
        compensationRaw: 0,
        invoiceOtherRaw: 0,
        creditOtherRaw: 0,
        posRaw: 0,
        payableRaw: 0,
      };
      branches.set(branchKey, branch);
    }

    const rowNumber = sourceIndex + 4;
    const amount = (value: unknown, column: string, optional = true) =>
      parseAmount(value, {
        platform: "keeta",
        sheet: "Order Summary",
        row: rowNumber,
        column,
        optional,
      });

    const originalItemPriceRaw = amount(
      valueOf(sourceRow, "Original item price (VAT included)"),
      "Original item price (VAT included)",
      false,
    );
    const topUpRaw = amount(
      valueOf(sourceRow, "Total Top-up to Minimum (VAT included)"),
      "Total Top-up to Minimum (VAT included)",
    );
    const compensationRevenueRaw = amount(
      valueOf(sourceRow, "Total Compensation to Merchant (VAT included)"),
      "Total Compensation to Merchant (VAT included)",
    );
    const restaurantDeliveryRevenueRaw = amount(
      valueOf(sourceRow, "Delivery fee for merchant delivery order (including VAT)"),
      "Delivery fee for merchant delivery order (including VAT)",
    );
    const merchantIncreaseRaw = amount(
      valueOf(sourceRow, "Adjustment increases (not included in invoices)"),
      "Adjustment increases (not included in invoices)",
    );
    const salesRaw =
      originalItemPriceRaw +
      topUpRaw +
      compensationRevenueRaw +
      restaurantDeliveryRevenueRaw +
      merchantIncreaseRaw;

    const commissionRaw = sumColumns(sourceRow, COMMISSION_COLUMNS, rowNumber);
    const bankRaw = sumColumns(sourceRow, BANK_COLUMNS, rowNumber);
    const deliveryRaw = sumColumns(sourceRow, DELIVERY_COLUMNS, rowNumber);
    const productCampaignRaw = sumColumns(sourceRow, PRODUCT_CAMPAIGN_COLUMNS, rowNumber);
    const merchantAdRaw = sumColumns(sourceRow, MERCHANT_AD_COLUMNS, rowNumber);
    const compensationRaw = sumColumns(sourceRow, COMPENSATION_COLUMNS, rowNumber);
    const invoiceOtherRaw = sumColumns(sourceRow, INVOICE_OTHER_COLUMNS, rowNumber);
    const creditOtherRaw = sumColumns(sourceRow, CREDIT_OTHER_COLUMNS, rowNumber);
    const posRaw = amount(
      valueOf(sourceRow, "POS Machine Fee(VAT included)"),
      "POS Machine Fee(VAT included)",
    );
    const payableRaw = amount(
      valueOf(sourceRow, "Payable to merchant", "Payable to Restaurant"),
      "Payable to merchant / Payable to Restaurant",
      false,
    );

    const orderNumber = text(valueOf(sourceRow, "Order Number"));
    const orderTransaction = isOrderTransaction(sourceRow);
    if (orderTransaction && orderNumber) {
      branch.orderNumbers.add(orderNumber);
      const status = text(valueOf(sourceRow, "Status")) || "غير محدد";
      orderStatuses.set(orderNumber, status);
    }

    branch.salesRaw += salesRaw;
    branch.originalItemPriceRaw += originalItemPriceRaw;
    branch.topUpRaw += topUpRaw;
    branch.compensationRevenueRaw += compensationRevenueRaw;
    branch.restaurantDeliveryRevenueRaw += restaurantDeliveryRevenueRaw;
    branch.merchantIncreaseRaw += merchantIncreaseRaw;
    branch.commissionRaw += commissionRaw;
    branch.bankRaw += bankRaw;
    branch.deliveryRaw += deliveryRaw;
    branch.productCampaignRaw += productCampaignRaw;
    branch.merchantAdRaw += merchantAdRaw;
    branch.compensationRaw += compensationRaw;
    branch.invoiceOtherRaw += invoiceOtherRaw;
    branch.creditOtherRaw += creditOtherRaw;
    branch.posRaw += posRaw;
    branch.payableRaw += payableRaw;

    const date = normalizeDate(valueOf(sourceRow, "Transaction date"));
    if (date) {
      const totalCostExVat =
        -(
          commissionRaw +
          bankRaw +
          deliveryRaw +
          productCampaignRaw +
          merchantAdRaw +
          compensationRaw +
          invoiceOtherRaw +
          creditOtherRaw
        ) / VAT_FACTOR;

      let day = dailyMap.get(date);
      if (!day) {
        day = { date, orders: 0, grossSales: 0, netSales: 0, commission: 0, ccSuccess: 0 };
        dailyMap.set(date, day);
      }
      if (orderTransaction && orderNumber) {
        let orderSet = dailyOrderNumbers.get(date);
        if (!orderSet) {
          orderSet = new Set<string>();
          dailyOrderNumbers.set(date, orderSet);
        }
        orderSet.add(orderNumber);
      }
      day.grossSales += salesRaw;
      day.netSales += salesRaw / VAT_FACTOR;
      day.commission += totalCostExVat;

      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;
    }
  }

  for (const [date, day] of dailyMap) {
    day.orders = dailyOrderNumbers.get(date)?.size ?? 0;
  }

  const statusCounts: Record<string, number> = {};
  for (const status of orderStatuses.values()) {
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  const pdfInvoice = options.invoice ?? { lines: [] };
  const excelLines =
    excelControls.invoiceAmount !== undefined || excelControls.payable !== undefined
      ? [
          ...(excelControls.invoiceAmount !== undefined
            ? [{ label: "Invoice Details · Invoice amount", amount: excelControls.invoiceAmount }]
            : []),
          ...(excelControls.payable !== undefined
            ? [{ label: "Invoice Details · Payable to Restaurant", amount: excelControls.payable }]
            : []),
          ...(excelControls.billingInvoiceAmount !== undefined
            ? [
                {
                  label: "Billing data summary · Invoice amount",
                  amount: excelControls.billingInvoiceAmount,
                },
              ]
            : []),
          ...(excelControls.billingPayable !== undefined
            ? [
                {
                  label: "Billing data summary · Payable to Restaurant",
                  amount: excelControls.billingPayable,
                },
              ]
            : []),
        ]
      : [];

  const invoice: InvoiceFigures = {
    ...pdfInvoice,
    lines: pdfInvoice.lines?.length ? pdfInvoice.lines : excelLines,
    keetaExcelInvoiceAmount: excelControls.invoiceAmount,
    keetaExcelPayable: excelControls.payable,
    keetaExcelInvoiceDetailRows: excelControls.invoiceDetailRows || undefined,
    keetaBillingInvoiceAmount: excelControls.billingInvoiceAmount,
    keetaBillingPayable: excelControls.billingPayable,
    keetaBillingRows: excelControls.billingRows || undefined,
  };

  const invoiceBranches = new Map(
    (invoice.keetaBranches ?? []).map((branch) => [branch.restaurantId, branch]),
  );
  const matchedInvoiceIds = new Set<string>();
  const matchedExcelIds = new Set<string>();

  const branchList = [...branches.values()].map((source) => {
    const row = source.row;
    const salesExVat = source.salesRaw / VAT_FACTOR;
    const commissionExVat = -source.commissionRaw / VAT_FACTOR;
    const bankExVat = -source.bankRaw / VAT_FACTOR;
    const deliveryExVat = -source.deliveryRaw / VAT_FACTOR;
    const productCampaignExVat = -source.productCampaignRaw / VAT_FACTOR;
    const merchantAdExVat = -source.merchantAdRaw / VAT_FACTOR;
    const advertisingExVat = productCampaignExVat + merchantAdExVat;
    const compensationExVat = -source.compensationRaw / VAT_FACTOR;
    const invoiceOtherExVat = -source.invoiceOtherRaw / VAT_FACTOR;
    const creditOtherExVat = -source.creditOtherRaw / VAT_FACTOR;
    const otherExVat = invoiceOtherExVat + creditOtherExVat;
    const commissionInvoiceInclVat =
      -(source.commissionRaw + source.bankRaw + source.deliveryRaw + source.invoiceOtherRaw);
    const commissionInvoiceExVat = commissionInvoiceInclVat / VAT_FACTOR;
    const excelInvoiceAmountComputed = commissionInvoiceInclVat - source.merchantAdRaw;
    const creditSales =
      source.salesRaw +
      source.productCampaignRaw +
      source.merchantAdRaw +
      source.compensationRaw +
      source.creditOtherRaw;
    const calculatedPayable = creditSales - commissionInvoiceInclVat;
    const totalCostInclVat = source.salesRaw - calculatedPayable;
    const totalCostExVat = totalCostInclVat / VAT_FACTOR;
    const inputVat = totalCostInclVat - totalCostExVat;

    row.orders = source.orderNumbers.size;
    row.grossSales = source.salesRaw;
    row.netSales = calculatedPayable;
    row.commission = commissionExVat;
    row.commissionPct = salesExVat !== 0 ? commissionExVat / salesExVat : 0;
    row.totalCharges = totalCostExVat;

    row.keetaSalesExVat = salesExVat;
    row.keetaSalesVat = source.salesRaw - salesExVat;
    row.keetaCommissionExVat = commissionExVat;
    row.keetaBankFeesExVat = bankExVat;
    row.keetaDeliveryCampaignExVat = deliveryExVat;
    row.keetaAdvertisingExVat = advertisingExVat;
    row.keetaProductCampaignExVat = productCampaignExVat;
    row.keetaMerchantAdExVat = merchantAdExVat;
    row.keetaPosFeesExVat = -source.posRaw / VAT_FACTOR;
    row.keetaCompensationExVat = compensationExVat;
    row.keetaOtherExpensesExVat = otherExVat;
    row.keetaCommissionInvoiceExVat = commissionInvoiceExVat;
    row.keetaCommissionInvoiceInclVat = commissionInvoiceInclVat;
    row.keetaCreditSales = creditSales;
    row.keetaTotalCostExVat = totalCostExVat;
    row.keetaInputVat = inputVat;
    row.keetaTotalCostInclVat = totalCostInclVat;
    row.keetaSourcePayable = source.payableRaw;
    row.keetaSettlementVariance = calculatedPayable - source.payableRaw;
    row.keetaPlatformCostPct = salesExVat !== 0 ? totalCostExVat / salesExVat : 0;
    row.keetaAvgOrderValueInclVat = row.orders ? source.salesRaw / row.orders : 0;

    const auditVariances: number[] = [];
    const auditSources: string[] = [];
    const missingSources: string[] = [];

    if (excelControls.branches.size) {
      const excelBranch = excelControls.branches.get(row.branchId);
      if (!excelBranch) {
        missingSources.push("Invoice Details");
      } else {
        matchedExcelIds.add(row.branchId);
        row.keetaExcelInvoiceAmount = excelBranch.invoiceAmount;
        row.keetaExcelInvoiceVariance = excelInvoiceAmountComputed - excelBranch.invoiceAmount;
        row.keetaExcelPayable = excelBranch.payable;
        row.keetaExcelPayableVariance = calculatedPayable - excelBranch.payable;
        auditVariances.push(
          absVariance(row.keetaExcelInvoiceVariance),
          absVariance(row.keetaExcelPayableVariance),
        );
        auditSources.push("Invoice Details في Excel");
      }
    }

    if (invoiceBranches.size) {
      const invoiceBranch = invoiceBranches.get(row.branchId);
      if (!invoiceBranch) {
        missingSources.push("صفحات PDF");
      } else {
        matchedInvoiceIds.add(row.branchId);
        row.keetaPdfOrderCommissionInclVat = invoiceBranch.orderCommissionInclVat;
        row.keetaPdfOrderCommissionVariance =
          -source.commissionRaw - (invoiceBranch.orderCommissionInclVat ?? 0);
        row.keetaPdfBankCommissionInclVat = invoiceBranch.bankCommissionInclVat;
        row.keetaPdfBankCommissionVariance =
          -source.bankRaw - (invoiceBranch.bankCommissionInclVat ?? 0);
        row.keetaPdfDeliveryCommissionInclVat = invoiceBranch.deliveryCommissionInclVat;
        row.keetaPdfDeliveryCommissionVariance =
          -source.deliveryRaw - (invoiceBranch.deliveryCommissionInclVat ?? 0);
        row.keetaPdfCommissionInvoiceInclVat = invoiceBranch.commissionTotalInclVat;
        row.keetaPdfCommissionVariance =
          commissionInvoiceInclVat - (invoiceBranch.commissionTotalInclVat ?? 0);
        row.keetaPdfCreditSales = invoiceBranch.totalCreditSales;
        row.keetaPdfCreditSalesVariance = creditSales - (invoiceBranch.totalCreditSales ?? 0);
        row.keetaPdfNetDue = invoiceBranch.netDue;
        row.keetaPdfNetDueVariance = calculatedPayable - (invoiceBranch.netDue ?? 0);
        auditVariances.push(
          absVariance(row.keetaPdfOrderCommissionVariance),
          absVariance(row.keetaPdfBankCommissionVariance),
          absVariance(row.keetaPdfDeliveryCommissionVariance),
          absVariance(row.keetaPdfCommissionVariance),
          absVariance(row.keetaPdfCreditSalesVariance),
          absVariance(row.keetaPdfNetDueVariance),
        );
        auditSources.push("صفحات PDF");
      }
    }

    if (missingSources.length) {
      row.branchAuditStatus = "unmatched";
      row.branchAuditLabel = "غير مطابق";
      row.branchAuditNote =
        "Store ID موجود في Order Summary ولم يتم العثور عليه في " + missingSources.join(" و") + ".";
    } else if (auditSources.length) {
      Object.assign(
        row,
        auditState(Math.max(0, ...auditVariances), auditSources.join(" و")),
      );
    }

    return row;
  });

  for (const excelBranch of excelControls.branches.values()) {
    if (matchedExcelIds.has(excelBranch.restaurantId)) continue;
    const row = emptyBranch(excelBranch.branch, excelBranch.restaurantId);
    row.branchAuditStatus = "invoice_only";
    row.branchAuditLabel = "في Invoice Details فقط";
    row.branchAuditNote = "الفرع موجود في Invoice Details داخل ملف كيتا وغير موجود في Order Summary.";
    row.keetaExcelInvoiceAmount = excelBranch.invoiceAmount;
    row.keetaExcelPayable = excelBranch.payable;
    branchList.push(row);
  }

  for (const invoiceBranch of invoice.keetaBranches ?? []) {
    if (matchedInvoiceIds.has(invoiceBranch.restaurantId)) continue;
    let row = branchList.find((candidate) => candidate.branchId === invoiceBranch.restaurantId);
    if (!row) {
      row = emptyBranch("Restaurant ID " + invoiceBranch.restaurantId, invoiceBranch.restaurantId);
      branchList.push(row);
    }
    row.branchAuditStatus = "invoice_only";
    row.branchAuditLabel = row.keetaExcelInvoiceAmount !== undefined ? "في المصادر الرسمية فقط" : "في PDF فقط";
    row.branchAuditNote =
      "الفرع موجود في المستندات الرسمية لكيتا وغير موجود في Order Summary.";
    row.keetaPdfOrderCommissionInclVat = invoiceBranch.orderCommissionInclVat;
    row.keetaPdfBankCommissionInclVat = invoiceBranch.bankCommissionInclVat;
    row.keetaPdfDeliveryCommissionInclVat = invoiceBranch.deliveryCommissionInclVat;
    row.keetaPdfCommissionInvoiceInclVat = invoiceBranch.commissionTotalInclVat;
    row.keetaPdfCreditSales = invoiceBranch.totalCreditSales;
    row.keetaPdfNetDue = invoiceBranch.netDue;
  }

  branchList.sort((a, b) => b.grossSales - a.grossSales);

  const operationalBranches = branchList.filter((row) => row.branchAuditStatus !== "invoice_only");
  const sum = (pick: (row: BranchRow) => number) =>
    operationalBranches.reduce((total, row) => total + pick(row), 0);

  const grossSales = sum((row) => row.grossSales);
  const salesExVat = sum((row) => row.keetaSalesExVat ?? 0);
  const commissionExVat = sum((row) => row.keetaCommissionExVat ?? 0);
  const commissionInvoiceExVat = sum((row) => row.keetaCommissionInvoiceExVat ?? 0);
  const commissionInvoiceInclVat = sum((row) => row.keetaCommissionInvoiceInclVat ?? 0);
  const creditSales = sum((row) => row.keetaCreditSales ?? 0);
  const totalCostExVat = sum((row) => row.keetaTotalCostExVat ?? 0);
  const calculatedPayable = sum((row) => row.netSales);
  const sourcePayable = sum((row) => row.keetaSourcePayable ?? 0);
  const merchantAdExVat = sum((row) => row.keetaMerchantAdExVat ?? 0);
  const excelInvoiceAmountComputed = commissionInvoiceInclVat + merchantAdExVat * VAT_FACTOR;

  const summary: Summary = {
    platform: "keeta",
    orders: sum((row) => row.orders),
    grossSales,
    netSales: calculatedPayable,
    commission: commissionExVat,
    commissionPct: salesExVat !== 0 ? commissionExVat / salesExVat : 0,
    ccSuccess: 0,
    ccRejected: 0,
    walletAmount: 0,
    riderWallet: 0,
    rdfCampaigns: 0,
    compensation: 0,
    jokerFees: 0,
    hsFoodDiscount: 0,
    rewardsDiscount: 0,
    restaurantFoodDiscount: 0,
    totalFoodDiscount: 0,
    partialRefund: 0,
    fulfillmentMods: 0,
    approvedRefunds: 0,
    waitingTimeFees: 0,
    bankRate: 0,
    bankRateSource: "none",
    bankFeeSuccess: 0,
    bankFeeRefunded: 0,
    invoiceOnlyExtras: 0,
    totalCharges: totalCostExVat,
    branchCount: operationalBranches.length,
    statusCounts,
    periodStart,
    periodEnd,
    keetaSalesExVat: salesExVat,
    keetaSalesVat: grossSales - salesExVat,
    keetaCommissionExVat: commissionExVat,
    keetaBankFeesExVat: sum((row) => row.keetaBankFeesExVat ?? 0),
    keetaDeliveryCampaignExVat: sum((row) => row.keetaDeliveryCampaignExVat ?? 0),
    keetaAdvertisingExVat: sum((row) => row.keetaAdvertisingExVat ?? 0),
    keetaProductCampaignExVat: sum((row) => row.keetaProductCampaignExVat ?? 0),
    keetaMerchantAdExVat: merchantAdExVat,
    keetaPosFeesExVat: sum((row) => row.keetaPosFeesExVat ?? 0),
    keetaCompensationExVat: sum((row) => row.keetaCompensationExVat ?? 0),
    keetaOtherExpensesExVat: sum((row) => row.keetaOtherExpensesExVat ?? 0),
    keetaCommissionInvoiceExVat: commissionInvoiceExVat,
    keetaCommissionInvoiceInclVat: commissionInvoiceInclVat,
    keetaCreditSales: creditSales,
    keetaTotalCostExVat: totalCostExVat,
    keetaInputVat: sum((row) => row.keetaInputVat ?? 0),
    keetaTotalCostInclVat: sum((row) => row.keetaTotalCostInclVat ?? 0),
    keetaSourcePayable: sourcePayable,
    keetaSettlementVariance: calculatedPayable - sourcePayable,
    keetaExcelInvoiceAmount: invoice.keetaExcelInvoiceAmount,
    keetaExcelInvoiceVariance:
      invoice.keetaExcelInvoiceAmount !== undefined
        ? excelInvoiceAmountComputed - invoice.keetaExcelInvoiceAmount
        : undefined,
    keetaExcelPayable: invoice.keetaExcelPayable,
    keetaExcelPayableVariance:
      invoice.keetaExcelPayable !== undefined
        ? calculatedPayable - invoice.keetaExcelPayable
        : undefined,
    keetaBillingInvoiceAmount: invoice.keetaBillingInvoiceAmount,
    keetaBillingInvoiceVariance:
      invoice.keetaBillingInvoiceAmount !== undefined
        ? excelInvoiceAmountComputed - invoice.keetaBillingInvoiceAmount
        : undefined,
    keetaBillingPayable: invoice.keetaBillingPayable,
    keetaBillingPayableVariance:
      invoice.keetaBillingPayable !== undefined
        ? calculatedPayable - invoice.keetaBillingPayable
        : undefined,
    keetaPlatformCostPct: salesExVat !== 0 ? totalCostExVat / salesExVat : 0,
    keetaAvgOrderValueInclVat: summaryAverage(grossSales, sum((row) => row.orders)),
  };

  const checks: CheckRow[] = [
    {
      label: "صافي التسوية مقابل Order Summary Payable",
      computed: calculatedPayable,
      invoiced: sourcePayable,
      evidence: "data",
      tolerance: 0.05,
      hint:
        "إعادة بناء التسوية من المبيعات والخصومات والرسوم، مقارنةً بعمود Payable to Restaurant داخل Order Summary.",
    },
  ];

  if (invoice.keetaExcelInvoiceAmount !== undefined) {
    checks.push({
      label: "Invoice amount مقابل Invoice Details",
      computed: excelInvoiceAmountComputed,
      invoiced: invoice.keetaExcelInvoiceAmount,
      evidence: "data",
      tolerance: 0.05,
      hint:
        "عمولة الطلب + رسوم البنك + دعم توصيل كيتا + بنود الفاتورة الإضافية + Merchant ad spend، مقارنةً بورقة Invoice Details.",
    });
  }

  if (invoice.keetaExcelPayable !== undefined) {
    checks.push({
      label: "صافي المستحق مقابل Invoice Details",
      computed: calculatedPayable,
      invoiced: invoice.keetaExcelPayable,
      evidence: "data",
      tolerance: 0.05,
      hint:
        "صافي التسوية المعاد احتسابه من Order Summary مقابل Payable to Restaurant في Invoice Details.",
    });
  }

  if (invoice.keetaBillingInvoiceAmount !== undefined) {
    checks.push({
      label: "Invoice amount مقابل Billing data summary",
      computed: excelInvoiceAmountComputed,
      invoiced: invoice.keetaBillingInvoiceAmount,
      evidence: "data",
      tolerance: 0.05,
      hint: "تحقق يومي تجميعي من ورقة Billing data summary.",
    });
  }

  if (invoice.keetaBillingPayable !== undefined) {
    checks.push({
      label: "صافي المستحق مقابل Billing data summary",
      computed: calculatedPayable,
      invoiced: invoice.keetaBillingPayable,
      evidence: "data",
      tolerance: 0.05,
      hint: "صافي التسوية مقابل Total Payable to Restaurant في Billing data summary.",
    });
  }

  if (invoice.salesCommission !== undefined) {
    checks.push({
      label: "عمولة الطلب",
      computed: summary.keetaCommissionExVat ?? 0,
      invoiced: invoice.salesCommission,
      evidence: "data",
      tolerance: 0.05,
      hint: "عمولة الطلب بدون الضريبة من Order Summary مقابل Simple invoice.",
    });
  }
  if (invoice.paymentFees !== undefined) {
    checks.push({
      label: "الرسوم المصرفية",
      computed: summary.keetaBankFeesExVat ?? 0,
      invoiced: invoice.paymentFees,
      evidence: "data",
      tolerance: 0.05,
      hint: "رسوم البنك بدون الضريبة من Order Summary مقابل Simple invoice.",
    });
  }
  if (invoice.othersCommission !== undefined) {
    checks.push({
      label: "عمولات أخرى - دعم توصيل كيتا",
      computed: summary.keetaDeliveryCampaignExVat ?? 0,
      invoiced: invoice.othersCommission,
      evidence: "data",
      tolerance: 0.05,
      hint: "Delivery promotion subsidy (Keeta delivery) بدون الضريبة.",
    });
  }
  if (invoice.totalExVat !== undefined) {
    checks.push({
      label: "إجمالي فاتورة العمولة بدون الضريبة",
      computed: commissionInvoiceExVat,
      invoiced: invoice.totalExVat,
      evidence: "data",
      tolerance: 0.05,
      hint: "العمولة + رسوم البنك + دعم توصيل كيتا + أي بنود فاتورة إضافية.",
    });
  }
  if (invoice.totalIncVat !== undefined) {
    checks.push({
      label: "إجمالي فاتورة العمولة شامل الضريبة",
      computed: commissionInvoiceInclVat,
      invoiced: invoice.totalIncVat,
      evidence: "data",
      tolerance: 0.05,
    });
  }
  if (invoice.creditSales !== undefined) {
    checks.push({
      label: "إجمالي البيع الآجل",
      computed: creditSales,
      invoiced: invoice.creditSales,
      evidence: "data",
      tolerance: 0.05,
      hint: "الإيرادات بعد دعم الأصناف والإعلانات وبقية بنود Credit Sales وقبل فاتورة العمولة.",
    });
  }
  if (invoice.netDue !== undefined) {
    checks.push({
      label: "صافي المستحق مقابل فاتورة كيتا",
      computed: calculatedPayable,
      invoiced: Math.abs(invoice.netDue),
      evidence: "data",
      tolerance: 0.05,
      hint: "صافي التسوية المعاد احتسابه من Order Summary مقابل Net Due في الفاتورة.",
    });
  }
  if (invoice.keetaMerchantSubsidyItems !== undefined) {
    checks.push({
      label: "إعانة التاجر على الأصناف",
      computed: -((summary.keetaProductCampaignExVat ?? 0) * VAT_FACTOR),
      invoiced: invoice.keetaMerchantSubsidyItems,
      evidence: "data",
      tolerance: 0.05,
    });
  }
  if (invoice.keetaAdvertisingCosts !== undefined) {
    checks.push({
      label: "تكاليف الإعلانات",
      computed: -((summary.keetaMerchantAdExVat ?? 0) * VAT_FACTOR),
      invoiced: invoice.keetaAdvertisingCosts,
      evidence: "data",
      tolerance: 0.05,
    });
  }
  if (invoice.keetaPosMachineFees !== undefined) {
    checks.push({
      label: "رسوم أجهزة POS",
      computed: -((summary.keetaPosFeesExVat ?? 0) * VAT_FACTOR),
      invoiced: invoice.keetaPosMachineFees,
      evidence: "data",
      tolerance: 0.05,
    });
  }

  if (invoice.keetaTaxInvoiceExVat !== undefined) {
    const netTaxInvoiceExVat =
      invoice.keetaTaxInvoiceExVat - (invoice.keetaTaxCreditNoteExVat ?? 0);
    checks.push({
      label: "صافي الفاتورة الضريبية بدون الضريبة",
      computed: commissionInvoiceExVat + merchantAdExVat,
      invoiced: netTaxInvoiceExVat,
      evidence: "data",
      tolerance: 0.05,
      hint:
        "فاتورة العمولة بدون الضريبة + Promotion service fee، بعد طرح أي Tax Credit Note.",
    });
  }

  if (invoice.keetaTaxInvoiceInclVat !== undefined) {
    const netTaxInvoiceInclVat =
      invoice.keetaTaxInvoiceInclVat - (invoice.keetaTaxCreditNoteInclVat ?? 0);
    checks.push({
      label: "صافي الفاتورة الضريبية شامل الضريبة",
      computed: commissionInvoiceInclVat + merchantAdExVat * VAT_FACTOR,
      invoiced: netTaxInvoiceInclVat,
      evidence: "data",
      tolerance: 0.05,
    });
  }

  const label =
    options.label ??
    (periodStart && periodEnd ? "كيتا · " + periodStart + " — " + periodEnd : "كيتا");

  return {
    platform: "keeta",
    label,
    summary,
    branches: branchList,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    invoice,
    checks,
  };
}

function summaryAverage(total: number, count: number): number {
  return count ? total / count : 0;
}
