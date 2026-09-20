import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { analyzeKeeta } from "./keeta";
import { parseKeetaInvoice } from "./pdf";

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


function buildKeetaExcelOfficialWorkbook(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const headers = [
    "Brand Name",
    "Restaurant Name",
    "Restaurant ID",
    "shop code",
    "Transaction date",
    "Order Number",
    "Status",
    "Transaction type",
    "Original item price (VAT included)",
    "Subtotal of commission fee (VAT included)",
    "Bank fee (VAT included)",
    "Delivery subsidies (Keeta delivery) covered by merchant",
    "Photography Service Fee(VAT included)",
    "Adjustment (including invoice)",
    "Product campaign expenses by merchant (VAT included)",
    "Total Platform Deductions from Merchant (Merchant's Liability, VAT included)",
    "POS Machine Fee(VAT included)",
    "Merchant ad spend (including VAT)",
    "Payable to Restaurant",
  ];

  const orderRows = [
    ["Brand A", "Branch A", 1001, "A", "1 Aug 2026", "10001", "Completed", "Delivery Order", 115, -17.25, -2.875, -11.5, -1.15, 0, -5.75, -2.3, 0, 0, 74.175],
    ["Brand A", "Branch A", 1001, "A", "1 Aug 2026", "10001", "Completed", "Partial Refund", -23, 3.45, 0, 0, 0, 0, 0, 0, 0, 0, -19.55],
    ["Brand A", "Branch A", 1001, "A", "1 Aug 2026", null, null, "Advertising Fee", 0, 0, 0, 0, 0, 0, 0, 0, 0, -11.5, -11.5],
    ["Brand A", "Branch A", 1001, "A", "2 Aug 2026", "10002", "Completed", "Delivery Order", 57.5, -8.625, -1.4375, -5.75, 0, 0, 0, 0, 0, 0, 41.6875],
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([Array(headers.length).fill(null), Array(headers.length).fill(null), headers, ...orderRows]),
    "Order Summary",
  );

  const invoiceHeaders = [
    "Brand Name",
    "Brand ID",
    "Restaurant Name",
    "Restaurant ID",
    "shop code",
    "Transaction date",
    "Invoice amount",
    "Payable to Restaurant",
    "Settlement status",
    "Billing Cycle",
    "Settlement date",
    "Settlement object type",
    "Settlement object ID",
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      invoiceHeaders,
      ["Brand A", 1, "Branch A", 1001, "A", "1 Aug 2026", 40.825, 43.125, "Settled", "cycle", "3 Aug 2026", "Restaurant", 1001],
      ["Brand A", 1, "Branch A", 1001, "A", "2 Aug 2026", 15.8125, 41.6875, "Settled", "cycle", "3 Aug 2026", "Restaurant", 1001],
    ]),
    "Invoice Details",
  );

  const billingHeaders = [
    "Number of restaurants",
    "Transaction date",
    "Total Original item price(VAT included)",
    "Total Top-up to Minimum (VAT included)",
    "Total Compensation to Merchant (VAT included)",
    "Delivery fee for merchant delivery order (including VAT)",
    "Adjustment increases (not included in invoices)",
    "Total Commission(VAT included)",
    "Total Bank Fee(VAT included)",
    "Delivery subsidies (Keeta delivery) covered by merchant",
    "Photography Service Fee(VAT included)",
    "Adjustment (including invoice)",
    "Product campaign expenses by merchant(VAT included)",
    "Delivery promotion subsidy (merchant delivery, including VAT) covered by merchant",
    "Total Platform Deductions from Merchant (Merchant's Liability, VAT included)",
    "VAT withholding",
    "POS Machine Fee(VAT included)",
    "Merchant ad spend (including VAT)",
    "Adjustment decreases (not included in invoices)",
    "Total Payable to Restaurant",
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      Array(billingHeaders.length).fill(null),
      Array(billingHeaders.length).fill(null),
      billingHeaders,
      [1, "1 Aug 2026", 92, 0, 0, 0, 0, -13.8, -2.875, -11.5, -1.15, 0, -5.75, 0, -2.3, 0, 0, -11.5, 0, 43.125],
      [1, "2 Aug 2026", 57.5, 0, 0, 0, 0, -8.625, -1.4375, -5.75, 0, 0, 0, 0, 0, 0, 0, 0, 0, 41.6875],
    ]),
    "Billing data summary",
  );

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
    expect(result.summary.keetaProductCampaignExVat).toBeCloseTo(5, 6);
    expect(result.summary.keetaMerchantAdExVat).toBeCloseTo(0, 6);
    expect(result.summary.keetaCompensationExVat).toBeCloseTo(2, 6);
    expect(result.summary.keetaOtherExpensesExVat).toBeCloseTo(1, 6);

    expect(result.summary.keetaCommissionInvoiceExVat).toBeCloseTo(42.25, 6);
    expect(result.summary.keetaCommissionInvoiceInclVat).toBeCloseTo(48.5875, 6);
    expect(result.summary.keetaCreditSales).toBeCloseTo(164.45, 6);
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

  test("uses Invoice Details and Billing data summary as official Excel controls", () => {
    const result = analyzeKeeta(buildKeetaExcelOfficialWorkbook());
    const branch = result.branches[0];

    expect(result.summary.orders).toBe(2);
    expect(result.summary.statusCounts.Completed).toBe(2);
    expect(result.daily.find((row) => row.date === "2026-08-01")?.orders).toBe(1);
    expect(result.daily.find((row) => row.date === "2026-08-02")?.orders).toBe(1);

    expect(result.summary.keetaExcelInvoiceAmount).toBeCloseTo(56.6375, 6);
    expect(result.summary.keetaExcelInvoiceVariance).toBeCloseTo(0, 6);
    expect(result.summary.keetaExcelPayable).toBeCloseTo(84.8125, 6);
    expect(result.summary.keetaExcelPayableVariance).toBeCloseTo(0, 6);
    expect(result.summary.keetaBillingInvoiceAmount).toBeCloseTo(56.6375, 6);
    expect(result.summary.keetaBillingInvoiceVariance).toBeCloseTo(0, 6);
    expect(result.summary.keetaBillingPayable).toBeCloseTo(84.8125, 6);
    expect(result.summary.keetaBillingPayableVariance).toBeCloseTo(0, 6);

    expect(branch?.orders).toBe(2);
    expect(branch?.keetaExcelInvoiceAmount).toBeCloseTo(56.6375, 6);
    expect(branch?.keetaExcelInvoiceVariance).toBeCloseTo(0, 6);
    expect(branch?.keetaExcelPayable).toBeCloseTo(84.8125, 6);
    expect(branch?.keetaExcelPayableVariance).toBeCloseTo(0, 6);
    expect(branch?.branchAuditStatus).toBe("matched");
    expect(branch?.branchAuditNote).toContain("Invoice Details");

    expect(result.invoice.keetaExcelInvoiceDetailRows).toBe(2);
    expect(result.invoice.keetaBillingRows).toBe(2);
    expect(result.invoice.lines.some((line) => line.label.includes("Invoice Details"))).toBe(true);

    const invoiceCheck = result.checks.find(
      (check) => check.label === "Invoice amount مقابل Invoice Details",
    );
    const payableCheck = result.checks.find(
      (check) => check.label === "صافي المستحق مقابل Invoice Details",
    );
    expect(invoiceCheck?.computed).toBeCloseTo(56.6375, 6);
    expect(invoiceCheck?.invoiced).toBeCloseTo(56.6375, 6);
    expect(payableCheck?.computed).toBeCloseTo(84.8125, 6);
    expect(payableCheck?.invoiced).toBeCloseTo(84.8125, 6);
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


describe("Keeta PDF parser", () => {
  test("parses the August simple invoice, credit sales and branch pages", () => {
    const invoice = parseKeetaInvoice(
      "Tax Invoice Invoice Number 2094621624693301315001 " +
        "Description Quantity Unit Price Taxable Amount VAT Rate VAT Amount Total(Including VAT) " +
        "Promotion service fee 1.00 29190.83 29190.83 15.00 4378.63 33569.46 " +
        "Commission fee 1.00 530063.13 530063.13 15.00 79509.47 609572.60 " +
        "Total Taxable Amount (Excluding VAT) SAR 559253.96 " +
        "Total VAT Amount SAR 83888.10 Total(Including VAT) SAR 643142.06" +
        "\n" +
        "Simple invoice Order commission Order commission 217648.54 15.00 32647.28 250295.82 " +
        "Bank commission Bank commission 44364.16 15.00 6654.62 51018.78 " +
        "Other commission Delivery promotion subsidy (Keeta delivery) covered by restaurant " +
        "268050.43 15.00 40207.57 308258.00 " +
        "Total invoice (including VAT) 609572.60 " +
        "Total commission (not including VAT) 530063.13 VAT 79509.47 " +
        "Total credit sales 1749265.08 Net due invoice 1139692.48" +
        "\n" +
        "Credit Sales Original item price (including partial and full refunds) 1848962.45 " +
        "Top-up to minimum 0.00 Compensation to merchant 5147.77 " +
        "Merchant subsidy on items (including partial and full refunds) -70275.68 " +
        "Advertising costs -33569.46 POS machine fees -1000.00 " +
        "Total credit sales 1749265.08 Net due invoice 1139692.48" +
        "\n" +
        "Invoice Details For Branch Restaurant ID:1001 Commission " +
        "Order commission Order commission 25.88 " +
        "Bank commission Bank commission 4.31 " +
        "Other commission Delivery promotion subsidy (Keeta delivery) covered by restaurant 17.25 " +
        "Photography service fees 1.15 Subscription fee 0.00 Commission adjustment 0.00 " +
        "Total commission (not including VAT) 42.25 " +
        "Total invoice (including VAT) 48.59" +
        "\n" +
        "Credit Sales Restaurant ID:1001 " +
        "Original item price (including partial and full refunds) 172.50 " +
        "Top-up to minimum 0.00 Compensation to merchant 0.00 " +
        "Merchant subsidy on items (including partial and full refunds) -5.75 " +
        "Advertising costs 0.00 POS machine fees 0.00 " +
        "Total credit sales 164.45 Net due invoice 115.86",
    );

    expect(invoice.salesCommission).toBeCloseTo(217648.54, 2);
    expect(invoice.paymentFees).toBeCloseTo(44364.16, 2);
    expect(invoice.othersCommission).toBeCloseTo(268050.43, 2);
    expect(invoice.totalExVat).toBeCloseTo(530063.13, 2);
    expect(invoice.totalIncVat).toBeCloseTo(609572.6, 2);
    expect(invoice.creditSales).toBeCloseTo(1749265.08, 2);
    expect(invoice.netDue).toBeCloseTo(1139692.48, 2);
    expect(invoice.keetaPromotionServiceFeeExVat).toBeCloseTo(29190.83, 2);
    expect(invoice.keetaTaxInvoiceExVat).toBeCloseTo(559253.96, 2);
    expect(invoice.keetaTaxInvoiceVat).toBeCloseTo(83888.1, 2);
    expect(invoice.keetaTaxInvoiceInclVat).toBeCloseTo(643142.06, 2);
    expect(invoice.keetaAdvertisingCosts).toBeCloseTo(-33569.46, 2);
    expect(invoice.keetaBranches).toHaveLength(1);
    expect(invoice.keetaBranches?.[0]?.restaurantId).toBe("1001");
    expect(invoice.keetaBranches?.[0]?.commissionTotalInclVat).toBeCloseTo(48.59, 2);
    expect(invoice.keetaBranches?.[0]?.totalCreditSales).toBeCloseTo(164.45, 2);
    expect(invoice.keetaBranches?.[0]?.netDue).toBeCloseTo(115.86, 2);
  });

  test("nets July tax credit notes without changing the simple-invoice settlement", () => {
    const invoice = parseKeetaInvoice(
      "Tax Invoice Promotion service fee 1.00 26642.16 26642.16 15.00 3996.32 30638.48 " +
        "Commission fee 1.00 489088.65 489088.65 15.00 73363.30 562451.95 " +
        "Total Taxable Amount (Excluding VAT) SAR 515730.81 " +
        "Total VAT Amount SAR 77359.62 Total(Including VAT) SAR 593090.43" +
        "\n" +
        "Tax Credit Note Commission fee 1.00 21.80 21.80 15.00 3.27 25.07 " +
        "Total Taxable Amount (Excluding VAT) SAR 21.80 " +
        "Total VAT Amount SAR 3.27 Total(Including VAT) SAR 25.07" +
        "\n" +
        "Simple invoice Order commission 202903.01 15.00 30435.45 233338.46 " +
        "Bank commission 40951.67 15.00 6142.75 47094.42 " +
        "Other commission 245212.17 15.00 36781.83 281994.00 " +
        "Total invoice (including VAT) 562426.88 " +
        "Total commission (not including VAT) 489066.85 VAT 73360.03 " +
        "Total credit sales 1625520.52 Net due invoice 1063093.64",
    );

    expect(invoice.totalExVat).toBeCloseTo(489066.85, 2);
    expect(invoice.totalIncVat).toBeCloseTo(562426.88, 2);
    expect(invoice.keetaTaxInvoiceExVat).toBeCloseTo(515730.81, 2);
    expect(invoice.keetaTaxCreditNoteExVat).toBeCloseTo(21.8, 2);
    expect(invoice.keetaTaxCreditNoteInclVat).toBeCloseTo(25.07, 2);
    expect(invoice.netDue).toBeCloseTo(1063093.64, 2);
  });

  test("matches a branch PDF by Restaurant ID and exposes component variances", () => {
    const result = analyzeKeeta(buildKeetaWorkbook(), {
      invoice: {
        lines: [],
        salesCommission: 22.5,
        paymentFees: 3.75,
        othersCommission: 15,
        totalExVat: 42.25,
        totalIncVat: 48.5875,
        creditSales: 164.45,
        netDue: 115.8625,
        keetaBranches: [
          {
            restaurantId: "1001",
            orderCommissionInclVat: 25.875,
            bankCommissionInclVat: 4.3125,
            deliveryCommissionInclVat: 17.25,
            commissionTotalExVat: 42.25,
            commissionTotalInclVat: 48.5875,
            totalCreditSales: 164.45,
            netDue: 115.8625,
          },
        ],
      },
    });

    const branch = result.branches[0];
    expect(branch?.branchAuditStatus).toBe("matched");
    expect(branch?.keetaPdfOrderCommissionVariance).toBeCloseTo(0, 6);
    expect(branch?.keetaPdfBankCommissionVariance).toBeCloseTo(0, 6);
    expect(branch?.keetaPdfDeliveryCommissionVariance).toBeCloseTo(0, 6);
    expect(branch?.keetaPdfCommissionVariance).toBeCloseTo(0, 6);
    expect(branch?.keetaPdfCreditSalesVariance).toBeCloseTo(0, 6);
    expect(branch?.keetaPdfNetDueVariance).toBeCloseTo(0, 6);
  });
});
