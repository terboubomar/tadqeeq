import { describe, expect, test } from "bun:test";

import { analyzeNinjaPdfDocuments } from "./ninja";

describe("Ninja multi-PDF audit engine", () => {
  test("aggregates matched invoice/summary PDFs into branch and period totals", () => {
    const result = analyzeNinjaPdfDocuments(
      [
        "2026-9-1_SINV260000000373113.pdf",
        "2026-9-2_SINV260000000390306.pdf",
      ],
      [
        {
          fileName: "2026-9-1_SINV260000000373113_summary.pdf",
          summary: {
            invoiceNo: "SINV260000000373113",
            invoiceDate: "2026-09-07",
            branch: "Branch A",
            successfulOrders: 2,
            successfulOrdersValue: 105.2,
            successfulCommissionableValue: 91.47,
            successfulCommission: 11.89,
            successfulOnlinePaymentFee: 2.63,
            successfulFixedFee: 20,
            totalExVat: 34.52,
            vat: 5.18,
            totalIncVat: 39.7,
          },
        },
        {
          fileName: "2026-9-2_SINV260000000390306_summary.pdf",
          summary: {
            invoiceNo: "SINV260000000390306",
            invoiceDate: "2026-09-14",
            branch: "Branch A",
            successfulOrders: 3,
            successfulOrdersValue: 150,
            successfulCommissionableValue: 130,
            successfulCommission: 16.9,
            successfulOnlinePaymentFee: 3.75,
            successfulFixedFee: 30,
            advertisementBookings: 10,
            ncrBookingFee: 5,
            totalExVat: 65.65,
            vat: 9.85,
            totalIncVat: 75.5,
          },
        },
      ],
      "سبتمبر 2026",
    );

    expect(result.platform).toBe("ninja");
    expect(result.formatIds).toEqual(["ninja-invoice-summary-v1"]);
    expect(result.label).toBe("سبتمبر 2026");
    expect(result.summary.orders).toBe(5);
    expect(result.summary.branchCount).toBe(1);
    expect(result.summary.grossSales).toBeCloseTo(255.2, 6);
    expect(result.summary.ninjaCommissionExVat).toBeCloseTo(28.79, 6);
    expect(result.summary.ninjaPaymentFeesExVat).toBeCloseTo(6.38, 6);
    expect(result.summary.ninjaFixedFeesExVat).toBeCloseTo(50, 6);
    expect(result.summary.ninjaAdvertisingExVat).toBeCloseTo(10, 6);
    expect(result.summary.ninjaNcrBookingFeeExVat).toBeCloseTo(5, 6);
    expect(result.summary.ninjaInputVat).toBeCloseTo(15.03, 6);
    expect(result.summary.ninjaInvoiceTotalInclVat).toBeCloseTo(115.2, 6);
    expect(result.summary.periodStart).toBe("2026-09-07");
    expect(result.summary.periodEnd).toBe("2026-09-14");
    expect(result.branches[0]?.branch).toBe("Branch A");
    expect(result.daily).toEqual([]);
  });

  test("refuses incomplete invoice-summary pairs", () => {
    expect(() =>
      analyzeNinjaPdfDocuments(
        ["SINV260000000373113.pdf"],
        [
          {
            fileName: "SINV260000000390306_summary.pdf",
            summary: { invoiceNo: "SINV260000000390306", branch: "Branch A" },
          },
        ],
      ),
    ).toThrow("غير مكتملة المطابقة");
  });
});
