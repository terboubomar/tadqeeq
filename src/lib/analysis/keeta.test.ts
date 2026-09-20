import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { analyzeKeeta } from "./keeta";

function buildKeetaWorkbook(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const headers = [
    "Brand Name",
    "Store name",
    "Store ID",
    "shop code",
    "Transaction date",
    "Status",
    "Original item price (VAT included)",
    "Total Top-up to Minimum (VAT included)",
    "Total Compensation to Merchant (VAT included)",
    "Delivery fee for merchant delivery order (including VAT)",
    "Adjustment increases (not included in invoices)",
    "Subtotal of commission fee (VAT included)",
    "Bank fee (VAT included)",
    "Delivery subsidies (Keeta delivery) covered by merchant",
    "Photography Service Fee(VAT included)",
    "Adjustment (including invoice)",
    "Product campaign expenses by merchant (VAT included)",
    "Delivery promotion subsidy (merchant delivery, including VAT) covered by merchant",
    "Total Platform Deductions from Merchant (Merchant's Liability, VAT included)",
    "VAT withholding",
    "POS Machine Fee(VAT included)",
    "Merchant ad spend (including VAT)",
    "Adjustment decreases (not included in invoices)",
    "Payable to merchant",
  ];

  const rows = [
    Array(headers.length).fill(null),
    Array(headers.length).fill(null),
    headers,
    [
      "باست",
      "Branch A",
      1001,
      "",
      "1 Aug 2026",
      "Completed",
      115,
      0,
      0,
      0,
      0,
      -17.25,
      -2.875,
      -11.5,
      -1.15,
      0,
      -5.75,
      0,
      -2.3,
      0,
      0,
      0,
      0,
      74.175,
    ],
    [
      "باست",
      "Branch A",
      1001,
      "",
      "2 Aug 2026",
      "Completed",
      57.5,
      0,
      0,
      0,
      0,
      -8.625,
      -1.4375,
      -5.75,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      41.6875,
    ],
  ];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Order Summary");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("Keeta audit engine", () => {
  test("reconstructs sales, cost categories and settlement from Order Summary", () => {
    const result = analyzeKeeta(buildKeetaWorkbook());
    const branch = result.branches[0];

    expect(result.summary.orders).toBe(2);
    expect(result.summary.branchCount).toBe(1);
    expect(result.summary.grossSales).toBeCloseTo(172.5, 6);
    expect(result.summary.keetaSalesExVat).toBeCloseTo(150, 6);
    expect(result.summary.keetaSalesVat).toBeCloseTo(22.5, 6);

    expect(result.summary.keetaCommissionExVat).toBeCloseTo(22.5, 6);
    expect(result.summary.keetaBankFeesExVat).toBeCloseTo(3.75, 6);
    expect(result.summary.keetaDeliveryCampaignExVat).toBeCloseTo(15, 6);
    expect(result.summary.keetaAdvertisingExVat).toBeCloseTo(5, 6);
    expect(result.summary.keetaCompensationExVat).toBeCloseTo(2, 6);
    expect(result.summary.keetaOtherExpensesExVat).toBeCloseTo(1, 6);

    expect(result.summary.keetaTotalCostExVat).toBeCloseTo(49.25, 6);
    expect(result.summary.keetaInputVat).toBeCloseTo(7.3875, 6);
    expect(result.summary.keetaTotalCostInclVat).toBeCloseTo(56.6375, 6);
    expect(result.summary.netSales).toBeCloseTo(115.8625, 6);
    expect(result.summary.keetaSourcePayable).toBeCloseTo(115.8625, 6);
    expect(result.summary.keetaSettlementVariance).toBeCloseTo(0, 6);
    expect(result.summary.keetaPlatformCostPct).toBeCloseTo(49.25 / 150, 8);
    expect(result.summary.keetaAvgOrderValueInclVat).toBeCloseTo(86.25, 6);

    expect(branch?.branchId).toBe("1001");
    expect(branch?.keetaTotalCostExVat).toBeCloseTo(49.25, 6);
    expect(branch?.keetaSourcePayable).toBeCloseTo(115.8625, 6);
    expect(branch?.keetaSettlementVariance).toBeCloseTo(0, 6);

    const settlementCheck = result.checks.find(
      (check) => check.label === "صافي التسوية مقابل ملف كيتا",
    );
    expect(settlementCheck?.computed).toBeCloseTo(115.8625, 6);
    expect(settlementCheck?.invoiced).toBeCloseTo(115.8625, 6);
    expect(settlementCheck?.evidence).toBe("data");

    expect(result.summary.statusCounts.Completed).toBe(2);
    expect(result.summary.periodStart).toBe("2026-08-01");
    expect(result.summary.periodEnd).toBe("2026-08-02");
  });

  test("compares the independently calculated settlement to invoice Net Due when supplied", () => {
    const result = analyzeKeeta(buildKeetaWorkbook(), {
      invoice: { lines: [], netDue: 115.8625 },
    });

    const check = result.checks.find(
      (row) => row.label === "صافي المستحق مقابل فاتورة كيتا",
    );
    expect(check?.computed).toBeCloseTo(115.8625, 6);
    expect(check?.invoiced).toBeCloseTo(115.8625, 6);
    expect(check?.evidence).toBe("data");
  });
});
