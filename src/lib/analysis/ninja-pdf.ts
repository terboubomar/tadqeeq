import type { NinjaInvoiceSummary } from "./types";

const MONEY = "\\(?-?[\\d,]+(?:\\.\\d{1,4})?\\)?";

function number(raw: string): number | undefined {
  const negative = raw.startsWith("(");
  const value = Number.parseFloat(raw.replace(/[(),]/g, ""));
  if (!Number.isFinite(value)) return undefined;
  return negative ? -value : value;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^$(){}|[\\]\\]/g, "\\$&");
}

/**
 * Ninja invoice-summary PDFs repeat English labels because of their bilingual layout.
 * PDF.js preserves page boundaries as newlines, while text inside each page is flattened.
 * Read the first numeric value after a label; duplicate labels are harmless because the
 * repeated label contains no number between the two copies.
 */
function amountAfter(page: string, ...labels: string[]): number | undefined {
  for (const label of labels) {
    const match = page.match(new RegExp(escaped(label) + "[^0-9(+-]{0,260}(" + MONEY + ")", "i"));
    if (match?.[1]) {
      const value = number(match[1]);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function integerAfter(page: string, ...labels: string[]): number | undefined {
  const value = amountAfter(page, ...labels);
  return value === undefined ? undefined : Math.trunc(value);
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

  const totalExVat = amountAfter(invoicePage, "Total Amount Excl. VAT");
  const vat =
    amountAfter(invoicePage, "VAT Rate Amount 15.0%", "VAT Rate Amount 15%", "Total VAT Amount 15%") ??
    amountAfter(invoicePage, "VAT Rate Amount 0.0%", "VAT Rate Amount 0%", "Total VAT Amount 0%");
  const totalIncVat = amountAfter(invoicePage, "Total Amount Incl. VAT");

  return {
    ...(invoiceNo ? { invoiceNo } : {}),
    ...(invoiceDate ? { invoiceDate } : {}),
    successfulOrders: integerAfter(restaurantSummary, "Successful Orders"),
    rejectedOrders: integerAfter(restaurantSummary, "Rejected Orders"),
    successfulOrdersValue: amountAfter(collected, "Successful Orders Value"),
    successfulCommissionableValue: amountAfter(collected, "Successful Orders Commissionable Value"),
    successfulCommission: amountAfter(collected, "Successful Orders Commission"),
    successfulOnlinePaymentFee: amountAfter(collected, "Successful Orders Online Payment Fee"),
    successfulFixedFee: amountAfter(collected, "Successful Orders Fixed Fee"),
    successfulTotalExVat: amountAfter(collected, "Successful Orders Total Amount Excl. VAT"),
    rejectedOrdersValue: amountAfter(collected, "Rejected Orders Value"),
    rejectedCommissionableValue: amountAfter(collected, "Rejected Orders Commissionable Value"),
    rejectedCommission: amountAfter(collected, "Rejected Orders Commission"),
    rejectedOnlinePaymentFee: amountAfter(collected, "Rejected Orders Online Payment Fee"),
    rejectedFixedFee: amountAfter(collected, "Rejected Orders Fixed Fee"),
    rejectedTotalExVat: amountAfter(collected, "Rejected Orders Total Amount Excl. VAT"),
    cancelledCommission: amountAfter(invoicePage, "Sales Commission Value for Cancelled Orders"),
    cancelledOnlinePaymentFee: amountAfter(invoicePage, "Bank Fees for Online Payment for Cancelled Orders"),
    missingItemCompensation: amountAfter(collected, "Item Missing Compensations", "Customer Missing Item Compensation"),
    lateDeliveryCompensation: amountAfter(collected, "Late Delivery Compensations"),
    advertisementBookings: amountAfter(collected, "Advertisement Bookings"),
    advertisementActiveDays: integerAfter(restaurantSummary, "Advertisement Bookings Active Days"),
    photoSessions: amountAfter(collected, "Photo Sessions"),
    posDevices: amountAfter(collected, "POS Devices"),
    ncrBookingFee: amountAfter(invoicePage, "NCR Booking Fee"),
    totalExVat,
    vat,
    totalIncVat,
  };
}
