import { describe, expect, test } from "bun:test";

import { aggregateNinjaPdfFiles, ninjaInvoiceNumber } from "./ninja-files";

describe("Ninja direct PDF files", () => {
  test("matches invoice and summary files by SINV number without ZIP/folder assumptions", () => {
    expect(ninjaInvoiceNumber("2026-9-1_SINV260000000373113.pdf")).toBe("SINV260000000373113");
    expect(ninjaInvoiceNumber("2026-9-1_SINV260000000373113_summary.pdf")).toBe("SINV260000000373113");

    const result = aggregateNinjaPdfFiles(
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
            branch: "Burger Waqf - Dammam - Al Jamiyin (Cloud",
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
            branch: "Burger Waqf - Dammam - Al Jamiyin (Cloud",
            successfulOrders: 3,
            successfulOrdersValue: 150,
            successfulCommissionableValue: 130,
            successfulCommission: 16.9,
            successfulOnlinePaymentFee: 3.75,
            successfulFixedFee: 30,
            missingItemCompensation: 12,
            totalExVat: 62.65,
            vat: 9.4,
            totalIncVat: 72.05,
          },
        },
      ],
    );

    expect(result.unmatchedInvoices).toEqual([]);
    expect(result.unmatchedSummaries).toEqual([]);
    expect(result.periodStart).toBe("2026-09-07");
    expect(result.periodEnd).toBe("2026-09-14");
    expect(result.branches).toHaveLength(1);
    expect(result.branches[0]).toMatchObject({
      invoices: 2,
      successfulOrders: 5,
      successfulOrdersValue: 255.2,
      successfulCommission: 28.79,
      successfulOnlinePaymentFee: 6.38,
      successfulFixedFee: 50,
      missingItemCompensation: 12,
      totalExVat: 97.17,
      totalIncVat: 111.75,
    });
  });

  test("reports missing pairs and duplicate invoice numbers instead of guessing", () => {
    const result = aggregateNinjaPdfFiles(
      [
        "SINV260000000373113.pdf",
        "copy_SINV260000000373113.pdf",
        "SINV260000000390306.pdf",
      ],
      [
        {
          fileName: "SINV260000000373113_summary.pdf",
          summary: { invoiceNo: "SINV260000000373113", branch: "Branch A" },
        },
        {
          fileName: "SINV260000000400949_summary.pdf",
          summary: { invoiceNo: "SINV260000000400949", branch: "Branch B" },
        },
      ],
    );

    expect(result.duplicateInvoiceNumbers).toEqual(["SINV260000000373113"]);
    expect(result.unmatchedInvoices).toEqual(["SINV260000000390306"]);
    expect(result.unmatchedSummaries).toEqual(["SINV260000000400949"]);
  });
});
