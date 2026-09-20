import { describe, expect, test } from "bun:test";

import { analyzeJahez } from "./jahez";
import { parseJahezInvoice } from "./pdf";

function buffer(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

function buildJahezCsv(): ArrayBuffer {
  return buffer(`Restaurant,Date,Orders Amount,Jahez Commision,Restaurant Amount,Payment Fees,Payment Fees Vat,Offer Amount,Delivery Offer,Delivery Coupon
Past - باست,01/08/2026 12:00:00 AM - 31/08/2026 11:59:59 PM,150.00,27.00000,105.85,2.750,0.400,0.0,14.00,0.0

#,Branch Name,Order #,Date,Order Amount,Jahez Commision,Delivery Charge,Restaurant Amount,Payment Fees,Payment Fees Vat,Offer Amount,Delivery Offer,Offer Type,Delivery Coupon
1,  Branch A  ,10001,31/08/2026 11:59:17 PM,100.00,18.00,0,70.28,1.500,0.220,0.0,10.0,-,0.0
2,Branch B,10002,31/08/2026 11:49:12 PM,50.00,9.00,0,35.57,1.250,0.180,0.0,4.0,-,0.0
`);
}

describe("Jahez CSV audit engine", () => {
  test("reconstructs settlement and invoice lines from the merchant report", () => {
    const result = analyzeJahez(buildJahezCsv());

    expect(result.platform).toBe("jahez");
    expect(result.summary.orders).toBe(2);
    expect(result.summary.branchCount).toBe(2);
    expect(result.summary.grossSales).toBeCloseTo(150, 6);
    expect(result.summary.netSales).toBeCloseTo(105.85, 6);
    expect(result.summary.jahezSettlementVariance).toBeCloseTo(0, 6);

    expect(result.summary.jahezCommissionInvoiceExVat).toBeCloseTo(23.48, 6);
    expect(result.summary.jahezDeliveryOfferInvoiceExVat).toBeCloseTo(12.18, 6);
    expect(result.summary.jahezPaymentFeesExVat).toBeCloseTo(2.75, 6);
    expect(result.summary.jahezInvoiceExVatComputed).toBeCloseTo(38.41, 6);
    expect(result.summary.jahezInvoiceVatComputed).toBeCloseTo(5.76, 6);
    expect(result.summary.jahezInvoiceInclVatComputed).toBeCloseTo(44.17, 6);
    expect(result.summary.jahezDeliveryOfferTiers).toEqual({ "10.00": 1, "4.00": 1 });

    expect(result.branches[0]?.branch.includes("  ")).toBe(false);
    expect(result.branches.every((row) => row.branchAuditStatus === "matched")).toBe(true);
    expect(result.daily[0]?.orders).toBe(2);
  });

  test("compares reconstructed invoice totals to the official Jahez PDF", () => {
    const invoice = parseJahezInvoice(
      "Commission 23.48 1 23.48 0.00 15 % 27.00 " +
        "Delivery Offer 8.70 1 8.70 0.00 15 % 10.01 " +
        "Delivery Offer 3.48 1 3.48 0.00 15 % 4.00 " +
        "Payment Fees 2.75 1 2.75 0.00 15 % 3.16 " +
        "38.41 Total (Excluding VAT) 5.76 Total VAT 44.17 Total Due Amount",
    );

    const result = analyzeJahez(buildJahezCsv(), { invoice });
    for (const label of [
      "عمولة جاهز",
      "عروض التوصيل",
      "رسوم مدفوعات جاهز",
      "إجمالي فاتورة جاهز بدون الضريبة",
      "ضريبة فاتورة جاهز",
      "إجمالي فاتورة جاهز شامل الضريبة",
    ]) {
      const check = result.checks.find((item) => item.label === label);
      expect(check).toBeDefined();
      expect(Math.abs((check?.computed ?? 0) - (check?.invoiced ?? 0))).toBeLessThanOrEqual(0.01);
    }
  });
});

describe("Jahez PDF parser", () => {
  test("parses the August 2026 Jahez invoice including both delivery tiers", () => {
    const invoice = parseJahezInvoice(
      "Commission 83513.45 1 83513.45 0.00 15 % 96040.46 " +
        "Delivery Offer 8.70 7129 62022.30 0.00 15 % 71325.65 " +
        "Delivery Offer 3.48 548 1907.04 0.00 15 % 2193.10 " +
        "Payment Fees 9751.11 1 9751.11 0.00 15 % 11213.78 " +
        "157193.90 Total (Excluding VAT) 23579.08 Total VAT 180772.98 Total Due Amount",
    );

    expect(invoice.jahezCommissionExVat).toBeCloseTo(83513.45, 6);
    expect(invoice.jahezDeliveryOfferExVat).toBeCloseTo(63929.34, 6);
    expect(invoice.jahezPaymentFeesExVat).toBeCloseTo(9751.11, 6);
    expect(invoice.jahezDeliveryOfferRows).toEqual([
      { unitExVat: 8.7, quantity: 7129, amountExVat: 62022.3 },
      { unitExVat: 3.48, quantity: 548, amountExVat: 1907.04 },
    ]);
    expect(invoice.totalExVat).toBeCloseTo(157193.9, 6);
    expect(invoice.vat).toBeCloseTo(23579.08, 6);
    expect(invoice.totalIncVat).toBeCloseTo(180772.98, 6);
  });

  test("parses the July 2026 single delivery tier invoice", () => {
    const invoice = parseJahezInvoice(
      "Commission 78469.55 1 78469.55 0.00 15 % 90239.98 " +
        "Delivery Offer 8.70 7093 61709.10 0.00 15 % 70965.47 " +
        "Payment Fees 9002.74 1 9002.74 0.00 15 % 10353.15 " +
        "149181.39 Total (Excluding VAT) 22377.21 Total VAT 171558.60 Total Due Amount",
    );

    expect(invoice.jahezCommissionExVat).toBeCloseTo(78469.55, 6);
    expect(invoice.jahezDeliveryOfferExVat).toBeCloseTo(61709.1, 6);
    expect(invoice.jahezPaymentFeesExVat).toBeCloseTo(9002.74, 6);
    expect(invoice.totalExVat).toBeCloseTo(149181.39, 6);
    expect(invoice.vat).toBeCloseTo(22377.21, 6);
    expect(invoice.totalIncVat).toBeCloseTo(171558.6, 6);
  });
});
