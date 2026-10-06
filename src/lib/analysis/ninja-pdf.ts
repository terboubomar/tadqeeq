import type { NinjaInvoiceSummary } from "./types";

const MONEY_SOURCE = "\\(?-?[\\d,]+(?:\\.\\d{1,5})?\\)?";
const MONEY_RE = new RegExp(MONEY_SOURCE, "g");

function number(raw: string): number | undefined {
  const negative = raw.startsWith("(");
  const value = Number.parseFloat(raw.replace(/[(),]/g, ""));
  if (!Number.isFinite(value)) return undefined;
  return negative ? -value : value;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
}

/** Last occurrence avoids the table-column heading sharing the same text as the totals block. */
function amountAfterLast(page: string, ...labels: string[]): number | undefined {
  for (const label of labels) {
    const re = new RegExp(escaped(label) + "[^0-9(+-]{0,260}(" + MONEY_SOURCE + ")", "gi");
    const matches = [...page.matchAll(re)];
    const raw = matches.at(-1)?.[1];
    if (raw) {
      const value = number(raw);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function integerAfterLast(page: string, ...labels: string[]): number | undefined {
  const value = amountAfterLast(page, ...labels);
  return value === undefined ? undefined : Math.trunc(value);
}

/**
 * Ninja tax-invoice rows are printed as:
 * quantity/base, unit price/rate, VAT rate, VAT amount, total excluding VAT.
 * Bilingual extraction often duplicates every value, so collapse adjacent equal numbers.
 */
function invoiceRowExVat(page: string, ...labels: string[]): number | undefined {
  for (const label of labels) {
    const index = page.toLowerCase().lastIndexOf(label.toLowerCase());
    if (index < 0) continue;
    const tail = page.slice(index + label.length, index + label.length + 420);
    const rawNumbers = tail.match(MONEY_RE) ?? [];
    const values: number[] = [];
    for (const raw of rawNumbers) {
      const value = number(raw);
      if (value === undefined) continue;
      if (values.length === 0 || values[values.length - 1] !== value) values.push(value);
      if (values.length >= 5) break;
    }
    if (values.length >= 5) return values[4];
  }
  return undefined;
}

function vatAmount(page: string): number | undefined {
  for (const label of ["VAT Rate Amount", "Total VAT Amount"]) {
    const index = page.toLowerCase().lastIndexOf(label.toLowerCase());
    if (index < 0) continue;
    const tail = page.slice(index + label.length, index + label.length + 100);
    const values = (tail.match(MONEY_RE) ?? []).map(number).filter((value): value is number => value !== undefined);
    if (values.length >= 2) return values[1];
    if (values.length === 1) return values[0];
  }
  return undefined;
}

function pageWith(pages: string[], label: string): string {
  return pages.find((page) => page.toLowerCase().includes(label.toLowerCase())) ?? "";
}

/**
 * Parses one Ninja "Invoice summary" PDF.
 *
 * Source families observed in Aug/Sep 2026:
 * - order fees: sales commission, online-payment fee, fixed fee
 * - cancelled-order commission/payment fees
 * - missing-item / late-delivery compensation
 * - advertisement bookings and active days
 * - POS devices / photo sessions
 * - NCR booking fee
 *
 * This parser is source-only: it does not infer or recalculate a fee that the PDF does not print.
 */
export function parseNinjaInvoiceSummary(raw: string): NinjaInvoiceSummary {
  const pages = raw
    .split(/\n+/)
    .map((page) => page.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const invoicePage = pageWith(pages, "Invoice summary") || pages[0] || "";
  const restaurantSummary = pageWith(pages, "Restaurant Summary");
  const collected = pageWith(pages, "Restaurant Collected Amounts");

  const invoiceNo =
    invoicePage.match(/SINV\d{12,}/i)?.[0] ??
    invoicePage.match(/Invoice\s*Num\.?[^A-Za-z0-9]{0,50}([A-Za-z0-9-]+)/i)?.[1];
  const invoiceDate = invoicePage.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];

  const totalExVat = amountAfterLast(invoicePage, "Total Amount Excl. VAT");
  const vat = vatAmount(invoicePage);
  const totalIncVat = amountAfterLast(invoicePage, "Total Amount Incl. VAT");

  return {
    ...(invoiceNo ? { invoiceNo } : {}),
    ...(invoiceDate ? { invoiceDate } : {}),
    successfulOrders: integerAfterLast(restaurantSummary, "Successful Orders"),
    rejectedOrders: integerAfterLast(restaurantSummary, "Rejected Orders"),
    successfulOrdersValue: amountAfterLast(collected, "Successful Orders Value"),
    successfulCommissionableValue: amountAfterLast(collected, "Successful Orders Commissionable Value"),
    successfulCommission: amountAfterLast(collected, "Successful Orders Commission"),
    successfulOnlinePaymentFee: amountAfterLast(collected, "Successful Orders Online Payment Fee"),
    successfulFixedFee: amountAfterLast(collected, "Successful Orders Fixed Fee"),
    successfulTotalExVat: amountAfterLast(collected, "Successful Orders Total Amount Excl. VAT"),
    rejectedOrdersValue: amountAfterLast(collected, "Rejected Orders Value"),
    rejectedCommissionableValue: amountAfterLast(collected, "Rejected Orders Commissionable Value"),
    rejectedCommission: amountAfterLast(collected, "Rejected Orders Commission"),
    rejectedOnlinePaymentFee: amountAfterLast(collected, "Rejected Orders Online Payment Fee"),
    rejectedFixedFee: amountAfterLast(collected, "Rejected Orders Fixed Fee"),
    rejectedTotalExVat: amountAfterLast(collected, "Rejected Orders Total Amount Excl. VAT"),
    cancelledCommission: invoiceRowExVat(invoicePage, "Sales Commission Value for Cancelled Orders"),
    cancelledOnlinePaymentFee: invoiceRowExVat(invoicePage, "Bank Fees for Online Payment for Cancelled Orders"),
    missingItemCompensation:
      amountAfterLast(collected, "Item Missing Compensations") ??
      invoiceRowExVat(invoicePage, "Customer Missing Item Compensation"),
    lateDeliveryCompensation: amountAfterLast(collected, "Late Delivery Compensations"),
    advertisementBookings: amountAfterLast(collected, "Advertisement Bookings"),
    advertisementActiveDays: integerAfterLast(restaurantSummary, "Advertisement Bookings Active Days"),
    photoSessions: amountAfterLast(collected, "Photo Sessions"),
    posDevices: amountAfterLast(collected, "POS Devices"),
    ncrBookingFee: invoiceRowExVat(invoicePage, "NCR Booking Fee"),
    totalExVat,
    vat,
    totalIncVat,
  };
}
