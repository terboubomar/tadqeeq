import * as XLSX from "xlsx";

import type {
  AnalysisResult,
  BranchRow,
  CheckRow,
  DailyRow,
  InvoiceFigures,
  Summary,
} from "./types";

const VAT_RATE = 0.15;
const VAT_FACTOR = 1 + VAT_RATE;

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
const ADS_COLUMNS = [
  "Product campaign expenses by merchant (VAT included)",
  "Merchant ad spend (including VAT)",
  "Advertising costs",
];
const COMPENSATION_COLUMNS = [
  "Total Platform Deductions from Merchant (Merchant's Liability, VAT included)",
];
const OTHER_COLUMNS = [
  "Photography Service Fee(VAT included)",
  "Monthly service fee (including VAT)",
  "Subscription fee (including VAT)",
  "Adjustment (including invoice)",
  "Delivery promotion subsidy (merchant delivery, including VAT) covered by merchant",
  "VAT withholding",
  "POS Machine Fee(VAT included)",
  "Adjustment decreases (not included in invoices)",
];

function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

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
      return `${english[3]}-${String(month).padStart(2, "0")}-${String(
        Number(english[1]),
      ).padStart(2, "0")}`;
    }
  }

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 80000) {
    const parsed = XLSX.SSF.parse_date_code(asNumber);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(
        2,
        "0",
      )}`;
    }
  }

  return raw.slice(0, 10);
}

function findOrderSheet(wb: XLSX.WorkBook): string | undefined {
  return (
    wb.SheetNames.find((name) => name.toLowerCase() === "order summary") ??
    wb.SheetNames.find((name) => name.toLowerCase().includes("order summary"))
  );
}

function rowObjects(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const headerIndex = matrix.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return (
      headers.includes("brand name") &&
      (headers.includes("store name") || headers.includes("restaurant name")) &&
      (headers.includes("payable to merchant") || headers.includes("payable to restaurant"))
    );
  });

  if (headerIndex < 0) {
    throw new Error("تعذّر تحديد صف عناوين Order Summary في ملف كيتا.");
  }

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

function sumColumns(row: Record<string, unknown>, columns: string[]): number {
  return columns.reduce((sum, column) => {
    const key = findKey(row, column);
    return sum + (key ? num(row[key]) : 0);
  }, 0);
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
    keetaCompensationExVat: 0,
    keetaOtherExpensesExVat: 0,
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
  salesRaw: number;
  commissionRaw: number;
  bankRaw: number;
  deliveryRaw: number;
  adsRaw: number;
  compensationRaw: number;
  otherRaw: number;
  payableRaw: number;
}

export interface KeetaOptions {
  invoice?: InvoiceFigures;
  label?: string;
}

export function analyzeKeeta(file: ArrayBuffer, options: KeetaOptions = {}): AnalysisResult {
  const wb = XLSX.read(file, { type: "array" });
  const sheetName = findOrderSheet(wb);

  if (!sheetName || !wb.Sheets[sheetName]) {
    throw new Error("لم يتم العثور على ورقة Order Summary في ملف كيتا.");
  }

  const rows = rowObjects(wb.Sheets[sheetName]!);
  const branches = new Map<string, RawKeetaBranch>();
  const dailyMap = new Map<string, DailyRow>();
  const statusCounts: Record<string, number> = {};
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  for (const row of rows) {
    const store =
      text(valueOf(row, "Store name", "Restaurant Name")) ||
      text(valueOf(row, "Brand Name")) ||
      "غير محدد";
    const storeId = text(valueOf(row, "Store ID", "Restaurant ID"));
    const shopCode = text(valueOf(row, "shop code"));
    const branchKey = `${storeId}|${shopCode}|${store}`;

    let branch = branches.get(branchKey);
    if (!branch) {
      branch = {
        row: emptyBranch(store, storeId || shopCode),
        salesRaw: 0,
        commissionRaw: 0,
        bankRaw: 0,
        deliveryRaw: 0,
        adsRaw: 0,
        compensationRaw: 0,
        otherRaw: 0,
        payableRaw: 0,
      };
      branches.set(branchKey, branch);
    }

    branch.row.orders += 1;
    branch.salesRaw += sumColumns(row, SALES_COLUMNS);
    branch.commissionRaw += sumColumns(row, COMMISSION_COLUMNS);
    branch.bankRaw += sumColumns(row, BANK_COLUMNS);
    branch.deliveryRaw += sumColumns(row, DELIVERY_COLUMNS);
    branch.adsRaw += sumColumns(row, ADS_COLUMNS);
    branch.compensationRaw += sumColumns(row, COMPENSATION_COLUMNS);
    branch.otherRaw += sumColumns(row, OTHER_COLUMNS);
    branch.payableRaw += num(valueOf(row, "Payable to merchant", "Payable to Restaurant"));

    const status = text(valueOf(row, "Status")) || "غير محدد";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    const date = normalizeDate(valueOf(row, "Transaction date"));
    if (date) {
      const salesRaw = sumColumns(row, SALES_COLUMNS);
      const commissionRaw = sumColumns(row, COMMISSION_COLUMNS);
      const bankRaw = sumColumns(row, BANK_COLUMNS);
      const deliveryRaw = sumColumns(row, DELIVERY_COLUMNS);
      const adsRaw = sumColumns(row, ADS_COLUMNS);
      const compensationRaw = sumColumns(row, COMPENSATION_COLUMNS);
      const otherRaw = sumColumns(row, OTHER_COLUMNS);
      const totalCostExVat =
        -(commissionRaw + bankRaw + deliveryRaw + adsRaw + compensationRaw + otherRaw) /
        VAT_FACTOR;

      let day = dailyMap.get(date);
      if (!day) {
        day = { date, orders: 0, grossSales: 0, netSales: 0, commission: 0, ccSuccess: 0 };
        dailyMap.set(date, day);
      }
      day.orders += 1;
      day.grossSales += salesRaw;
      day.netSales += salesRaw / VAT_FACTOR;
      day.commission += totalCostExVat;

      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;
    }
  }

  const branchList = [...branches.values()].map((source) => {
    const row = source.row;
    const salesExVat = source.salesRaw / VAT_FACTOR;
    const commissionExVat = -source.commissionRaw / VAT_FACTOR;
    const bankExVat = -source.bankRaw / VAT_FACTOR;
    const deliveryExVat = -source.deliveryRaw / VAT_FACTOR;
    const advertisingExVat = -source.adsRaw / VAT_FACTOR;
    const compensationExVat = -source.compensationRaw / VAT_FACTOR;
    const otherExVat = -source.otherRaw / VAT_FACTOR;
    const totalCostExVat =
      commissionExVat +
      bankExVat +
      deliveryExVat +
      advertisingExVat +
      compensationExVat +
      otherExVat;
    const inputVat = totalCostExVat * VAT_RATE;
    const totalCostInclVat = totalCostExVat + inputVat;
    const calculatedPayable = source.salesRaw - totalCostInclVat;

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
    row.keetaCompensationExVat = compensationExVat;
    row.keetaOtherExpensesExVat = otherExVat;
    row.keetaTotalCostExVat = totalCostExVat;
    row.keetaInputVat = inputVat;
    row.keetaTotalCostInclVat = totalCostInclVat;
    row.keetaSourcePayable = source.payableRaw;
    row.keetaSettlementVariance = calculatedPayable - source.payableRaw;
    row.keetaPlatformCostPct = salesExVat !== 0 ? totalCostExVat / salesExVat : 0;
    row.keetaAvgOrderValueInclVat = row.orders ? source.salesRaw / row.orders : 0;

    return row;
  });

  branchList.sort((a, b) => b.grossSales - a.grossSales);

  const sum = (pick: (row: BranchRow) => number) =>
    branchList.reduce((total, row) => total + pick(row), 0);

  const grossSales = sum((row) => row.grossSales);
  const salesExVat = sum((row) => row.keetaSalesExVat ?? 0);
  const commissionExVat = sum((row) => row.keetaCommissionExVat ?? 0);
  const totalCostExVat = sum((row) => row.keetaTotalCostExVat ?? 0);
  const calculatedPayable = sum((row) => row.netSales);
  const sourcePayable = sum((row) => row.keetaSourcePayable ?? 0);

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
    branchCount: branchList.length,
    statusCounts,
    periodStart,
    periodEnd,
    keetaSalesExVat: salesExVat,
    keetaSalesVat: grossSales - salesExVat,
    keetaCommissionExVat: commissionExVat,
    keetaBankFeesExVat: sum((row) => row.keetaBankFeesExVat ?? 0),
    keetaDeliveryCampaignExVat: sum((row) => row.keetaDeliveryCampaignExVat ?? 0),
    keetaAdvertisingExVat: sum((row) => row.keetaAdvertisingExVat ?? 0),
    keetaCompensationExVat: sum((row) => row.keetaCompensationExVat ?? 0),
    keetaOtherExpensesExVat: sum((row) => row.keetaOtherExpensesExVat ?? 0),
    keetaTotalCostExVat: totalCostExVat,
    keetaInputVat: sum((row) => row.keetaInputVat ?? 0),
    keetaTotalCostInclVat: sum((row) => row.keetaTotalCostInclVat ?? 0),
    keetaSourcePayable: sourcePayable,
    keetaSettlementVariance: calculatedPayable - sourcePayable,
    keetaPlatformCostPct: salesExVat !== 0 ? totalCostExVat / salesExVat : 0,
    keetaAvgOrderValueInclVat: summaryAverage(grossSales, sum((row) => row.orders)),
  };

  const invoice = options.invoice ?? { lines: [] };
  const checks: CheckRow[] = [
    {
      label: "صافي التسوية مقابل ملف كيتا",
      computed: calculatedPayable,
      invoiced: sourcePayable,
      evidence: "data",
      tolerance: 0.05,
      hint:
        "المبيعات شامل الضريبة ناقص جميع تكاليف المنصة شامل الضريبة، مقارنةً بعمود Payable to merchant.",
    },
  ];

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

  const label =
    options.label ??
    (periodStart && periodEnd ? `كيتا · ${periodStart} — ${periodEnd}` : "كيتا");

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
