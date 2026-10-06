import { describe, expect, test } from "bun:test";

import { parseNinjaInvoiceSummary } from "./ninja-pdf";

describe("Ninja invoice summary parser", () => {
  test("parses normal order commission, payment and fixed fees", () => {
    const parsed = parseNinjaInvoiceSummary(
      "Invoice summary Invoice summary Invoice Num. SINV260000000373113 Invoice Date 2026-09-07 " +
        "Total Sales Commission Value Total Sales Commission Value 91.47 0.13 15.0 1.784 11.8911 " +
        "Total Bank Fees for Online Payment Total Bank Fees for Online Payment 105.2 0.025 15.0 0.395 2.63 " +
        "Fixed Fees Per Order Fixed Fees Per Order 2.0 10.0 15.0 3.0 20.0 " +
        "Total Amount Excl. VAT Total Amount Excl. VAT 34.52 " +
        "VAT Rate Amount 15.0% VAT Rate Amount 15.0% 5.18 " +
        "Total Amount Incl. VAT Total Amount Incl. VAT 39.7" +
        "\nRestaurant Summary Restaurant Summary Successful Orders Successful Orders 2 2 Rejected Orders Rejected Orders 0 0 Total Total 2 2" +
        "\nRestaurant Collected Amounts Restaurant Collected Amounts Successful Orders Successful Orders " +
        "Successful Orders Value Successful Orders Value 105.20 105.20 " +
        "Successful Orders Commissionable Value Successful Orders Commissionable Value 91.47 91.47 " +
        "Successful Orders Commission Successful Orders Commission 11.89 11.89 " +
        "Successful Orders Online Payment Fee Successful Orders Online Payment Fee 2.63 2.63 " +
        "Successful Orders Fixed Fee Successful Orders Fixed Fee 20.00 20.00 " +
        "Successful Orders Total Amount Excl. VAT Successful Orders Total Amount Excl. VAT 34.52 34.52 " +
        "Rejected Orders Rejected Orders Rejected Orders Value Rejected Orders Value 0.00 0.00 " +
        "Rejected Orders Commissionable Value Rejected Orders Commissionable Value 0.00 0.00 " +
        "Rejected Orders Commission Rejected Orders Commission 0.00 0.00 " +
        "Rejected Orders Online Payment Fee Rejected Orders Online Payment Fee 0.00 0.00 " +
        "Rejected Orders Fixed Fee Rejected Orders Fixed Fee 0.00 0.00 " +
        "Rejected Orders Total Amount Excl. VAT Rejected Orders Total Amount Excl. VAT 0.00 0.00",
    );

    expect(parsed).toMatchObject({
      invoiceNo: "SINV260000000373113",
      invoiceDate: "2026-09-07",
      successfulOrders: 2,
      rejectedOrders: 0,
      successfulOrdersValue: 105.2,
      successfulCommissionableValue: 91.47,
      successfulCommission: 11.89,
      successfulOnlinePaymentFee: 2.63,
      successfulFixedFee: 20,
      successfulTotalExVat: 34.52,
      rejectedOrdersValue: 0,
      rejectedCommissionableValue: 0,
      rejectedCommission: 0,
      rejectedOnlinePaymentFee: 0,
      rejectedFixedFee: 0,
      rejectedTotalExVat: 0,
      totalExVat: 34.52,
      vat: 5.18,
      totalIncVat: 39.7,
    });
  });

  test("keeps cancelled-order fees explicit", () => {
    const parsed = parseNinjaInvoiceSummary(
      "Invoice summary SINV260000000343068 Invoice Date 2026-08-21 " +
        "Fixed Fees Per Order 9.0 10.0 15.0 13.5 90.0 " +
        "Sales Commission Value for Cancelled Orders 29.52 0.13 15.0 0.576 3.8376 " +
        "Bank Fees for Online Payment for Cancelled Orders 33.95 0.025 15.0 0.127 0.84875 " +
        "Total Amount Excl. VAT 176.22 VAT Rate Amount 15.0% 26.43 Total Amount Incl. VAT 202.65",
    );

    expect(parsed.cancelledCommission).toBeCloseTo(29.52, 6);
    expect(parsed.cancelledOnlinePaymentFee).toBeCloseTo(33.95, 6);
    expect(parsed.totalExVat).toBeCloseTo(176.22, 6);
  });

  test("parses compensation, advertising and NCR service rows without folding them into other fees", () => {
    const parsed = parseNinjaInvoiceSummary(
      "Invoice summary SINV260000000359860 Invoice Date 2026-08-31 " +
        "Customer Missing Item Compensation 1.0 220.62 0.0 0.0 220.62 " +
        "NCR Booking Fee 31.0 400.0 15.0 1860.0 12400.0 " +
        "Total Amount Excl. VAT 12620.62 VAT Rate Amount 15.0% 1860.0 Total Amount Incl. VAT 14480.62" +
        "\nRestaurant Summary Late Delivery Compensations 2 Item Missing Compensations 1 Pos Devices 0 " +
        "Advertisement Bookings 1 Advertisement Bookings Active Days 31 Photo Sessions 0 Total 35" +
        "\nRestaurant Collected Amounts Late Delivery Compensations 75.00 Item Missing Compensations 220.62 " +
        "POS Devices 0.00 Advertisement Bookings 400.00 Photo Sessions 0.00 Total Amount Excl. VAT 12620.62",
    );

    expect(parsed.missingItemCompensation).toBeCloseTo(220.62, 6);
    expect(parsed.lateDeliveryCompensation).toBeCloseTo(75, 6);
    expect(parsed.advertisementBookings).toBeCloseTo(400, 6);
    expect(parsed.advertisementActiveDays).toBe(31);
    expect(parsed.posDevices).toBe(0);
    expect(parsed.photoSessions).toBe(0);
    expect(parsed.ncrBookingFee).toBeCloseTo(31, 6);
    expect(parsed.totalExVat).toBeCloseTo(12620.62, 6);
  });
});
