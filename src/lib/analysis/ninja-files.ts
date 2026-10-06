import type { NinjaInvoiceSummary } from "./types";

export interface NinjaPdfDocument {
  fileName: string;
  summary: NinjaInvoiceSummary;
}

export interface NinjaInvoicePair {
  invoiceNo: string;
  invoiceFileName?: string;
  summaryFileName?: string;
  summary?: NinjaInvoiceSummary;
}

export interface NinjaBranchAggregate {
  branch: string;
  invoices: number;
  successfulOrders: number;
  rejectedOrders: number;
  successfulOrdersValue: number;
  successfulCommissionableValue: number;
  successfulCommission: number;
  successfulOnlinePaymentFee: number;
  successfulFixedFee: number;
  rejectedOrdersValue: number;
  rejectedCommission: number;
  rejectedOnlinePaymentFee: number;
  rejectedFixedFee: number;
  cancelledCommission: number;
  cancelledOnlinePaymentFee: number;
  missingItemCompensation: number;
  lateDeliveryCompensation: number;
  advertisementBookings: number;
  ncrBookingFee: number;
  totalExVat: number;
  vat: number;
  totalIncVat: number;
}

export interface NinjaPeriodAggregate {
  invoicePairs: NinjaInvoicePair[];
  unmatchedInvoices: string[];
  unmatchedSummaries: string[];
  duplicateInvoiceNumbers: string[];
  branches: NinjaBranchAggregate[];
  periodStart: string | null;
  periodEnd: string | null;
}

export function ninjaInvoiceNumber(value: string): string | undefined {
  return value.match(/SINV\d{12,}/i)?.[0]?.toUpperCase();
}

function add(target: NinjaBranchAggregate, key: keyof NinjaBranchAggregate, value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  (target[key] as number) += value;
}

function emptyBranch(branch: string): NinjaBranchAggregate {
  return {
    branch,
    invoices: 0,
    successfulOrders: 0,
    rejectedOrders: 0,
    successfulOrdersValue: 0,
    successfulCommissionableValue: 0,
    successfulCommission: 0,
    successfulOnlinePaymentFee: 0,
    successfulFixedFee: 0,
    rejectedOrdersValue: 0,
    rejectedCommission: 0,
    rejectedOnlinePaymentFee: 0,
    rejectedFixedFee: 0,
    cancelledCommission: 0,
    cancelledOnlinePaymentFee: 0,
    missingItemCompensation: 0,
    lateDeliveryCompensation: 0,
    advertisementBookings: 0,
    ncrBookingFee: 0,
    totalExVat: 0,
    vat: 0,
    totalIncVat: 0,
  };
}

/**
 * Matches Ninja invoice PDFs and summary PDFs by the immutable SINV invoice number.
 * Folder names and ZIP paths are intentionally irrelevant: production uploads are ordinary files.
 */
export function aggregateNinjaPdfFiles(
  invoiceFileNames: string[],
  summaries: NinjaPdfDocument[],
): NinjaPeriodAggregate {
  const invoices = new Map<string, string>();
  const duplicateInvoiceNumbers = new Set<string>();

  for (const fileName of invoiceFileNames) {
    const invoiceNo = ninjaInvoiceNumber(fileName);
    if (!invoiceNo) continue;
    if (invoices.has(invoiceNo)) duplicateInvoiceNumbers.add(invoiceNo);
    else invoices.set(invoiceNo, fileName);
  }

  const summaryByInvoice = new Map<string, NinjaPdfDocument>();
  for (const document of summaries) {
    const invoiceNo = document.summary.invoiceNo ?? ninjaInvoiceNumber(document.fileName);
    if (!invoiceNo) continue;
    const normalized = invoiceNo.toUpperCase();
    if (summaryByInvoice.has(normalized)) duplicateInvoiceNumbers.add(normalized);
    else summaryByInvoice.set(normalized, document);
  }

  const allInvoiceNumbers = [...new Set([...invoices.keys(), ...summaryByInvoice.keys()])].sort();
  const pairs = allInvoiceNumbers.map((invoiceNo) => ({
    invoiceNo,
    ...(invoices.get(invoiceNo) ? { invoiceFileName: invoices.get(invoiceNo) } : {}),
    ...(summaryByInvoice.get(invoiceNo)
      ? {
          summaryFileName: summaryByInvoice.get(invoiceNo)!.fileName,
          summary: summaryByInvoice.get(invoiceNo)!.summary,
        }
      : {}),
  }));

  const unmatchedInvoices = pairs.filter((pair) => !pair.summary).map((pair) => pair.invoiceNo);
  const unmatchedSummaries = pairs.filter((pair) => !pair.invoiceFileName).map((pair) => pair.invoiceNo);

  const branches = new Map<string, NinjaBranchAggregate>();
  const dates: string[] = [];

  for (const document of summaryByInvoice.values()) {
    const summary = document.summary;
    const branch = summary.branch?.trim() || "فرع غير محدد";
    const row = branches.get(branch) ?? emptyBranch(branch);
    if (!branches.has(branch)) branches.set(branch, row);

    row.invoices += 1;
    add(row, "successfulOrders", summary.successfulOrders);
    add(row, "rejectedOrders", summary.rejectedOrders);
    add(row, "successfulOrdersValue", summary.successfulOrdersValue);
    add(row, "successfulCommissionableValue", summary.successfulCommissionableValue);
    add(row, "successfulCommission", summary.successfulCommission);
    add(row, "successfulOnlinePaymentFee", summary.successfulOnlinePaymentFee);
    add(row, "successfulFixedFee", summary.successfulFixedFee);
    add(row, "rejectedOrdersValue", summary.rejectedOrdersValue);
    add(row, "rejectedCommission", summary.rejectedCommission);
    add(row, "rejectedOnlinePaymentFee", summary.rejectedOnlinePaymentFee);
    add(row, "rejectedFixedFee", summary.rejectedFixedFee);
    add(row, "cancelledCommission", summary.cancelledCommission);
    add(row, "cancelledOnlinePaymentFee", summary.cancelledOnlinePaymentFee);
    add(row, "missingItemCompensation", summary.missingItemCompensation);
    add(row, "lateDeliveryCompensation", summary.lateDeliveryCompensation);
    add(row, "advertisementBookings", summary.advertisementBookings);
    add(row, "ncrBookingFee", summary.ncrBookingFee);
    add(row, "totalExVat", summary.totalExVat);
    add(row, "vat", summary.vat);
    add(row, "totalIncVat", summary.totalIncVat);

    if (summary.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(summary.invoiceDate)) {
      dates.push(summary.invoiceDate);
    }
  }

  dates.sort();

  return {
    invoicePairs: pairs,
    unmatchedInvoices,
    unmatchedSummaries,
    duplicateInvoiceNumbers: [...duplicateInvoiceNumbers].sort(),
    branches: [...branches.values()].sort((a, b) => a.branch.localeCompare(b.branch)),
    periodStart: dates[0] ?? null,
    periodEnd: dates.at(-1) ?? null,
  };
}
