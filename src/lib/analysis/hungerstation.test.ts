import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { buildPeriodExceptions, summarizeExceptions } from "../exceptions";
import type { StoredPeriod } from "../periods";
import { analyzeHungerStation } from "./hungerstation";
import { parseCpcInvoice, parseHungerInvoice } from "./pdf";

function buildWorkbook(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();

  const orders = [
    {
      "Order ID": 1,
      Status: "Successful",
      "Branch Name": "Branch A",
      "HS Branch ID": 100,
      "Original Amount": 150,
      "Commissionable GMV (VAT Excluded)": 100,
      Commission: 15,
      "Payment Type": "Online payment",
      "CC Amount": 120,
      "Wallet Amount": 10,
      "Transmitter Amount": 5,
      "Restaurant delivery Discount": 11.5,
      "Flash Deals Fee Excluding Vat": 0,
      "HS Food Discount": 2,
      "Rewards Discounts": 3,
      "Restaurant Food discount": 4,
      "CC Refund Amount": 0,
      "Wallet Refund": 0,
      "Operation Day": "2026-08-01",
    },
    {
      "Order ID": 2,
      Status: "Failed After Pick Up",
      "Branch Name": "Branch A",
      "HS Branch ID": 100,
      "Original Amount": 57.5,
      "Commissionable GMV (VAT Excluded)": 50,
      Commission: 7.5,
      "Payment Type": "Online payment",
      "CC Amount": 60,
      "Wallet Amount": 1,
      "Transmitter Amount": 2,
      "Restaurant delivery Discount": 5.75,
      "Flash Deals Fee Excluding Vat": 0,
      "HS Food Discount": 1,
      "Rewards Discounts": 0.5,
      "Restaurant Food discount": 1,
      "CC Refund Amount": 0,
      "Wallet Refund": 0,
      "Operation Day": "2026-08-01",
    },
    {
      "Order ID": 3,
      Status: "Failed by vendor",
      "Branch Name": "Branch A",
      "HS Branch ID": 100,
      "Original Amount": 28.75,
      "Commissionable GMV (VAT Excluded)": 25,
      Commission: 3.75,
      "Payment Type": "Online payment",
      "CC Amount": 30,
      "Wallet Amount": 7,
      "Transmitter Amount": 25,
      "Restaurant delivery Discount": 2.875,
      "Flash Deals Fee Excluding Vat": 0,
      "HS Food Discount": 4,
      "Rewards Discounts": 6,
      "Restaurant Food discount": 8,
      "CC Refund Amount": 0,
      "Wallet Refund": 0,
      "Operation Day": "2026-08-01",
    },
    {
      "Order ID": 4,
      Status: "Rejected",
      "Branch Name": "Branch A",
      "HS Branch ID": 100,
      "Original Amount": 11.5,
      "Commissionable GMV (VAT Excluded)": 10,
      Commission: 1.5,
      "Payment Type": "Online payment",
      "CC Amount": 12,
      "Wallet Amount": 0,
      "Transmitter Amount": 0,
      "Restaurant delivery Discount": 1.15,
      "Flash Deals Fee Excluding Vat": 0,
      "HS Food Discount": 0,
      "Rewards Discounts": 0,
      "Restaurant Food discount": 0,
      "CC Refund Amount": 0,
      "Wallet Refund": 0,
      "Operation Day": "2026-08-01",
    },
    {
      "Order ID": 5,
      Status: "Failed Before Pick Up",
      "Branch Name": "Branch A",
      "HS Branch ID": 100,
      "Original Amount": 0,
      "Commissionable GMV (VAT Excluded)": 0,
      Commission: 0,
      "Payment Type": "Online payment",
      "CC Amount": 8,
      "Wallet Amount": 0,
      "Transmitter Amount": 0,
      "Restaurant delivery Discount": 0,
      "Flash Deals Fee Excluding Vat": 0,
      "HS Food Discount": 0,
      "Rewards Discounts": 0,
      "Restaurant Food discount": 0,
      "CC Refund Amount": 0,
      "Wallet Refund": 0,
      "Operation Day": "2026-08-01",
    },
    {
      "Order ID": 6,
      Status: "Failed",
      "Branch Name": "Branch A",
      "HS Branch ID": 100,
      "Original Amount": 0,
      "Commissionable GMV (VAT Excluded)": 0,
      Commission: 0,
      "Payment Type": "Online payment",
      "CC Amount": 4,
      "Wallet Amount": 0,
      "Transmitter Amount": 0,
      "Restaurant delivery Discount": 0,
      "Flash Deals Fee Excluding Vat": 0,
      "HS Food Discount": 0,
      "Rewards Discounts": 0,
      "Restaurant Food discount": 0,
      "CC Refund Amount": 0,
      "Wallet Refund": 0,
      "Operation Day": "2026-08-01",
    },
  ];

  const freeDelivery = [
    { ID: 1, "Branch Name": "Branch A", "HS Branch ID": 100, Status: "Successful" },
    { ID: 2, "Branch Name": "Branch A", "HS Branch ID": 100, Status: "Failed After Pick Up" },
    { ID: 3, "Branch Name": "Branch A", "HS Branch ID": 100, Status: "Failed by vendor" },
    { ID: 4, "Branch Name": "Branch A", "HS Branch ID": 100, Status: "Rejected" },
    { ID: 5, "Branch Name": "Branch A", "HS Branch ID": 100, Status: "Failed Before Pick Up" },
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(orders),
    "1 Commissionable GMV",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(freeDelivery),
    "2 Free Delivery Orders",
  );

  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function buildArabicBranchWorkbook(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        Status: "Successful",
        "Branch Name": "باست - الروضة",
        "HS Branch ID": 1001,
        "Payment Type": "Online payment",
        "Commissionable GMV (VAT Excluded)": 100,
        Commission: 15,
        "CC Amount": 100,
        "Operation Day": "2026-08-01",
      },
      {
        Status: "Successful",
        "Branch Name": "باست - النخيل",
        "HS Branch ID": 1002,
        "Payment Type": "Online payment",
        "Commissionable GMV (VAT Excluded)": 200,
        Commission: 30,
        "CC Amount": 200,
        "Operation Day": "2026-08-01",
      },
    ]),
    "1 Commissionable GMV",
  );
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("HungerStation audit rules", () => {
  test("uses the validated status rules and counts only billable RDF orders", () => {
    const result = analyzeHungerStation(buildWorkbook(), {
      manualBankRate: 0.025,
      invoice: {
        lines: [],
        salesCommission: 27.75,
        paymentFees: 7.1,
        othersCommission: 517.5,
        totalExVat: 552.35,
        totalOnlineSales: -214.5,
        extras: [
          { label: "رسوم محفظة العميل", amount: 1.25 },
          { label: "الطابعات", amount: 500 },
        ],
      },
    });

    expect(result.summary.orders).toBe(3);
    expect(result.summary.grossSales).toBeCloseTo(201.25, 6);
    expect(result.summary.netSales).toBeCloseTo(185, 6);
    expect(result.summary.commission).toBeCloseTo(27.75, 6);
    expect(result.summary.ccSuccess).toBeCloseTo(210, 6);
    expect(result.summary.netBankCards).toBeCloseTo(180, 6);
    expect(result.summary.ccRejected).toBeCloseTo(24, 6);
    expect(result.summary.walletAmount).toBeCloseTo(11, 6);
    expect(result.summary.riderWallet).toBeCloseTo(7, 6);
    expect(result.summary.walletFeeBase).toBeCloseTo(0, 6);
    expect(result.summary.walletFee).toBeCloseTo(1.25, 6);
    expect(result.summary.rdfCampaigns).toBeCloseTo(17.5, 6);
    expect(result.summary.totalFoodDiscount).toBeCloseTo(20, 6);
    expect(result.summary.netMarketingDiscount).toBeCloseTo(16.5, 6);
    expect(result.summary.totalCollections).toBeCloseTo(214.5, 6);
    expect(result.branches[0]?.freeDeliveryOrders).toBe(3);

    const paymentCheck = result.checks.find(
      (check) => check.label === "رسوم الدفع الإلكتروني القابلة للتحقق (البطاقات)",
    );
    expect(paymentCheck?.computed).toBeCloseTo(5.85, 6);
    expect(paymentCheck?.invoiced).toBeCloseTo(5.85, 6);
    expect(paymentCheck?.evidence).toBe("contract");

    const walletFeeCheck = result.checks.find(
      (check) => check.label.startsWith("رسوم مدفوعات المحافظ"),
    );
    expect(walletFeeCheck?.computed).toBeCloseTo(1.25, 6);
    expect(walletFeeCheck?.invoiced).toBeCloseTo(1.25, 6);
    expect(walletFeeCheck?.evidence).toBe("mixed");

    const collectionsCheck = result.checks.find(
      (check) => check.label === "إجمالي التحصيلات",
    );
    expect(collectionsCheck?.computed).toBeCloseTo(214.5, 6);
    expect(collectionsCheck?.invoiced).toBeCloseTo(214.5, 6);
    expect(collectionsCheck?.evidence).toBe("data");

    const printerCheck = result.checks.find((check) => check.label.includes("الطابعات"));
    expect(printerCheck?.computed).toBe(0);
    expect(printerCheck?.invoiced).toBe(500);
    expect(printerCheck?.evidence).toBe("invoice_only");
  });

  test("treats a missing invoice commission as data missing, not a zero-value variance", () => {
    const result = analyzeHungerStation(buildWorkbook(), {
      manualBankRate: 0.025,
      invoice: {
        lines: [],
        paymentFees: 5.85,
        othersCommission: 17.5,
        totalExVat: 51.1,
      },
    });

    const commissionCheck = result.checks.find(
      (check) => check.label === "عمولة المبيعات",
    );
    expect(commissionCheck?.invoiced).toBeUndefined();

    const period = {
      id: "hs-missing-commission",
      label: result.label,
      platform: result.platform,
      period_start: result.summary.periodStart,
      period_end: result.summary.periodEnd,
      created_at: "2026-09-01T00:00:00Z",
      summary: result.summary,
      branches: result.branches,
      daily: result.daily,
      invoice: {
        ...result.invoice,
        checks: result.checks,
      },
    } as StoredPeriod;

    const exceptions = buildPeriodExceptions(period);
    const missing = exceptions.filter((item) => item.category === "data_missing");

    expect(exceptions.filter((item) => item.category === "commission")).toHaveLength(0);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.label).toContain("عمولة المبيعات");
    expect(missing[0]?.reviewAmount).toBe(0);
    expect(missing[0]?.potentialRecovery).toBe(0);

    const summary = summarizeExceptions(exceptions);
    expect(summary.underReview).toBe(0);
    expect(summary.potentialRecovery).toBe(0);
  });

  test("keeps a real zero invoice value distinct from missing data", () => {
    const result = analyzeHungerStation(buildWorkbook(), {
      manualBankRate: 0.025,
      invoice: {
        lines: [],
        salesCommission: 0,
        paymentFees: 5.85,
        othersCommission: 17.5,
        totalExVat: 51.1,
      },
    });

    const commissionCheck = result.checks.find(
      (check) => check.label === "عمولة المبيعات",
    );
    expect(commissionCheck?.invoiced).toBe(0);

    const period = {
      id: "hs-zero-commission",
      label: result.label,
      platform: result.platform,
      period_start: result.summary.periodStart,
      period_end: result.summary.periodEnd,
      created_at: "2026-09-01T00:00:00Z",
      summary: result.summary,
      branches: result.branches,
      daily: result.daily,
      invoice: {
        ...result.invoice,
        checks: result.checks,
      },
    } as StoredPeriod;

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions.some((item) => item.category === "data_missing")).toBe(false);
    expect(exceptions.some((item) => item.category === "commission")).toBe(true);
  });

  test("contract rate takes precedence over the invoice-implied rate", () => {
    const result = analyzeHungerStation(buildWorkbook(), {
      manualBankRate: 0.025,
      invoice: {
        lines: [],
        paymentFees: 23.4,
      },
    });

    expect(result.summary.bankRateSource).toBe("manual");
    expect(result.summary.bankRate).toBeCloseTo(0.025, 8);
    expect(result.summary.invoiceImpliedBankRate).toBeCloseTo(0.1, 8);

    const paymentCheck = result.checks.find(
      (check) => check.label === "رسوم الدفع الإلكتروني القابلة للتحقق (البطاقات)",
    );
    expect(paymentCheck?.computed).toBeCloseTo(5.85, 6);
    expect(paymentCheck?.invoiced).toBeCloseTo(23.4, 6);
    expect(paymentCheck?.evidence).toBe("contract");
  });

  test("marks invoice-implied bank rates as non-independent when no contract rate is provided", () => {
    const result = analyzeHungerStation(buildWorkbook(), {
      invoice: {
        lines: [],
        paymentFees: 7.1,
        walletFeeBase: 50,
        walletFee: 1.25,
      },
    });

    expect(result.summary.bankRateSource).toBe("invoice");
    expect(result.summary.bankRate).toBeCloseTo(0.025, 8);

    const paymentCheck = result.checks.find(
      (check) => check.label === "رسوم الدفع الإلكتروني القابلة للتحقق (البطاقات)",
    );
    expect(paymentCheck?.evidence).toBe("invoice_derived");
  });
});

describe("HungerStation branch identity matching", () => {
  test("matches Arabic branch names even when audited amounts are swapped", () => {
    const result = analyzeHungerStation(buildArabicBranchWorkbook(), {
      manualBankRate: 0.025,
      invoice: {
        lines: [],
        branches: [
          {
            branch: "بـاست - الرَّوضة",
            salesCommission: 30,
            paymentFees: 5,
            totalCollections: 200,
            creditSales: 200,
          },
          {
            branch: "باست - النخيل",
            salesCommission: 15,
            paymentFees: 2.5,
            totalCollections: 100,
            creditSales: 100,
          },
        ],
      },
    });

    const rawdah = result.branches.find((row) => row.branch === "باست - الروضة");
    const nakheel = result.branches.find((row) => row.branch === "باست - النخيل");

    expect(rawdah?.invoiceBranchName).toBe("بـاست - الرَّوضة");
    expect(rawdah?.invoiceCommission).toBe(30);
    expect(nakheel?.invoiceBranchName).toBe("باست - النخيل");
    expect(nakheel?.invoiceCommission).toBe(15);
  });

  test("matches one data branch to one unnamed invoice branch without using audited amounts", () => {
    const result = analyzeHungerStation(buildWorkbook(), {
      manualBankRate: 0.025,
      invoice: {
        lines: [],
        salesCommission: 27.75,
        paymentFees: 7.1,
        othersCommission: 17.5,
        totalExVat: 52.35,
        creditSales: 175,
        rejectedSales: 10,
        totalOnlineSales: 214.5,
        branches: [
          {
            salesCommission: 27.75,
            paymentFees: 7.1,
            walletFee: 1.25,
            walletFeeBase: 50,
            otherCommission: 17.5,
            totalCollections: 214.5,
            creditSales: 175,
          },
        ],
        walletFee: 1.25,
        walletFeeBase: 50,
      },
    });

    expect(result.branches).toHaveLength(1);
    const branch = result.branches[0]!;
    expect(branch.branch).toBe("Branch A");
    expect(["matched", "rounding"]).toContain(branch.branchAuditStatus);
    expect(branch.branchAuditNote).toContain("فرع تشغيلي واحد");
    expect(branch.invoiceCommission).toBeCloseTo(27.75, 6);
    expect(branch.invoiceCardPaymentFees).toBeCloseTo(5.85, 6);
    expect(branch.invoiceOtherCharges).toBeCloseTo(17.5, 6);
    expect(branch.invoiceCollections).toBeCloseTo(214.5, 6);
    expect(branch.invoiceCreditSales).toBeCloseTo(175, 6);
    expect(
      result.branches.some((row) => row.branch.startsWith("فرع في الفاتورة فقط")),
    ).toBe(false);

    const period = {
      id: "hs-singleton-unnamed",
      label: result.label,
      platform: result.platform,
      period_start: result.summary.periodStart,
      period_end: result.summary.periodEnd,
      created_at: "2026-09-01T00:00:00Z",
      summary: result.summary,
      branches: result.branches,
      daily: result.daily,
      invoice: {
        ...result.invoice,
        checks: result.checks,
      },
    } as StoredPeriod;

    expect(buildPeriodExceptions(period)).toHaveLength(0);
  });

  test("does not use the singleton fallback when multiple data branches exist", () => {
    const result = analyzeHungerStation(buildArabicBranchWorkbook(), {
      manualBankRate: 0.025,
      invoice: {
        lines: [],
        branches: [
          {
            salesCommission: 15,
            paymentFees: 2.5,
            totalCollections: 100,
            creditSales: 100,
          },
        ],
      },
    });

    const operational = result.branches.filter(
      (row) => row.branchAuditStatus !== "invoice_only",
    );
    expect(operational).toHaveLength(2);
    expect(operational.every((row) => row.branchAuditStatus === "unmatched")).toBe(true);
    expect(result.branches.some((row) => row.branchAuditStatus === "invoice_only")).toBe(true);
  });

  test("does not match a different branch merely because the audited amounts are identical", () => {
    const result = analyzeHungerStation(buildArabicBranchWorkbook(), {
      manualBankRate: 0.025,
      invoice: {
        lines: [],
        branches: [
          {
            branch: "باست - الشاطئ",
            salesCommission: 15,
            paymentFees: 2.5,
            totalCollections: 100,
            creditSales: 100,
          },
        ],
      },
    });

    const rawdah = result.branches.find((row) => row.branch === "باست - الروضة");

    expect(rawdah?.invoiceBranchName).toBeUndefined();
    expect(rawdah?.branchAuditStatus).toBe("unmatched");
    expect(rawdah?.branchAuditNote).toContain("اسم فرع");
  });
});

describe("HungerStation branch reconciliation", () => {
  test("preserves an Arabic-only branch name from HungerStation invoice pages", () => {
    const invoice = parseHungerInvoice(
      "Sales Commission 15.00 2.25 17.25 " +
        "Payment Fees 2.50 0.38 2.88 " +
        "Others Commission 0.00 0.00 0.00 " +
        "Total Invoice 17.50 2.63 20.13" +
        "\n" +
        "Invoice Details باست - الروضة Commissions " +
        "HS delivery commission 100.00 15.0% 15.00 " +
        "Successful Bank Fee 100.00 2.5% 2.50 " +
        "Total Commission 17.50" +
        "\n" +
        "Online Payments for branch باست - الروضة " +
        "Net Bank Cards Payments (100.00) " +
        "Total Collections (100.00) " +
        "Credit Sales 1.0 100.00 115.00",
    );

    expect(invoice.branches?.[0]?.branch).toBe("باست - الروضة");
  });

  test("parses a branch detail pair and reconciles it to the Excel branch", () => {
    const invoice = parseHungerInvoice(
      "Sales Commission 27.75 4.16 31.91 " +
        "Payment Fees 7.10 1.07 8.17 " +
        "Others Commission 517.50 77.63 595.13 " +
        "Total Invoice 552.35 82.85 635.20 " +
        "Total Online Sales (214.50) Net Due Invoice (420.70) " +
        "Credit Sales 3.0 175.00 201.25 Rejected sales 1.0 10.00 11.50" +
        "\n" +
        "Invoice Details Branch A Commissions " +
        "HS delivery commission 185.00 15.0% 27.75 " +
        "Successful Bank Fee 210.00 2.5% 5.25 " +
        "Refunded Bank Fee 24.00 2.5% 0.60 " +
        "Wallet Payments Fee 50.00 2.5% 1.25 " +
        "RDF campaigns 3.0 5.83 17.50 " +
        "Printers 1.0 500.00 500.00 " +
        "Total Commission 552.35" +
        "\n" +
        "Online Payments for branch Branch A " +
        "Net Bank Cards Payments (180.00) " +
        "User wallets payments (11.00) " +
        "Rider wallets payments (7.00) " +
        "Total food discounts (20.00) " +
        "Restaurant food discounts 13.00 " +
        "Rewards Discounts (9.50) " +
        "Net Marketing Discounts (16.50) " +
        "Total Approved Claims 0.00 " +
        "Total Collections (214.50) " +
        "Credit Sales 3.0 175.00 201.25 " +
        "Rejected sales 1.0 10.00 11.50",
    );

    expect(invoice.branches).toHaveLength(1);
    expect(invoice.branches?.[0]?.branch).toBe("Branch A");
    expect(invoice.branches?.[0]?.salesCommission).toBeCloseTo(27.75, 2);
    expect(invoice.branches?.[0]?.paymentFees).toBeCloseTo(7.1, 2);
    expect(invoice.walletFeeBase).toBeCloseTo(50, 2);
    expect(invoice.walletFee).toBeCloseTo(1.25, 2);
    expect(invoice.branches?.[0]?.invoiceOnlyCharges).toBeCloseTo(500, 2);
    expect(invoice.branches?.[0]?.totalCollections).toBeCloseTo(214.5, 2);
    expect(invoice.branches?.[0]?.creditSales).toBeCloseTo(175, 2);

    const result = analyzeHungerStation(buildWorkbook(), {
      manualBankRate: 0.025,
      invoice,
    });
    const branch = result.branches.find((row) => row.branch === "Branch A");

    expect(branch?.branchAuditStatus).toBe("matched");
    expect(branch?.invoiceCommission).toBeCloseTo(27.75, 2);
    expect(branch?.commissionVariance).toBeCloseTo(0, 6);
    expect(branch?.invoicePaymentFees).toBeCloseTo(7.1, 2);
    expect(branch?.invoiceWalletFee).toBeCloseTo(1.25, 2);
    expect(branch?.invoiceCardPaymentFees).toBeCloseTo(5.85, 2);
    expect(branch?.paymentFeeVariance).toBeCloseTo(0, 6);
    expect(branch?.invoiceCollections).toBeCloseTo(214.5, 2);
    expect(branch?.collectionsVariance).toBeCloseTo(0, 6);
    expect(branch?.invoiceCreditSales).toBeCloseTo(175, 2);
    expect(branch?.creditSalesVariance).toBeCloseTo(0, 6);
    expect(branch?.invoiceOnlyBranchCharges).toBeCloseTo(500, 2);
  });

  test("does not charge wallet collections when the branch invoice has no Wallet Payments Fee", () => {
    const invoice = parseHungerInvoice(
      "Sales Commission 27.75 4.16 31.91 " +
        "Payment Fees 5.85 0.88 6.73 " +
        "Others Commission 17.50 2.63 20.13 " +
        "Total Invoice 51.10 7.67 58.77 " +
        "Total Online Sales (214.50) Net Due Invoice (155.73) " +
        "Credit Sales 3.0 175.00 201.25 Rejected sales 1.0 10.00 11.50" +
        "\n" +
        "Invoice Details Branch A Commissions " +
        "HS delivery commission 185.00 15.0% 27.75 " +
        "Successful Bank Fee 210.00 2.5% 5.25 " +
        "Refunded Bank Fee 24.00 2.5% 0.60 " +
        "RDF campaigns 3.0 5.83 17.50 " +
        "Total Commission 51.10" +
        "\n" +
        "Online Payments for branch Branch A " +
        "Net Bank Cards Payments (180.00) " +
        "User wallets payments (11.00) " +
        "Rider wallets payments (7.00) " +
        "Total food discounts (20.00) " +
        "Restaurant food discounts 13.00 " +
        "Rewards Discounts (9.50) " +
        "Net Marketing Discounts (16.50) " +
        "Total Approved Claims 0.00 " +
        "Total Collections (214.50) " +
        "Credit Sales 3.0 175.00 201.25 " +
        "Rejected sales 1.0 10.00 11.50",
    );

    const result = analyzeHungerStation(buildWorkbook(), {
      manualBankRate: 0.025,
      invoice,
    });
    const branch = result.branches.find((row) => row.branch === "Branch A");

    expect(branch?.walletAmount).toBeCloseTo(11, 6);
    expect(branch?.riderWallet).toBeCloseTo(7, 6);
    expect(branch?.invoiceWalletFee).toBeCloseTo(0, 6);
    expect(branch?.invoiceCardPaymentFees).toBeCloseTo(5.85, 6);
    expect(branch?.paymentFeeVariance).toBeCloseTo(0, 6);
    expect(branch?.branchAuditStatus).toBe("matched");
  });

  test("reads Sales Summary from page two without using page-two fee-detail headings", () => {
    const figures = parseHungerInvoice(
      "Sales Commission 5,568.20 835.23 6,403.43 " +
        "Payment Fees 859.14 128.87 988.01 " +
        "Others Commission 6,060.00 909.00 6,969.00 " +
        "Total Invoice 12,487.34 1,873.10 14,360.44 " +
        "Total Online Sales (35,422.65) Net Due Invoice (21,062.21)" +
        "\n" +
        "Sales Summary Credit Sales 603.0 30,934.63 35,574.82 " +
        "Rejected sales 0.0 0.00 0.00",
    );

    expect(figures.paymentFees).toBeCloseTo(859.14, 2);
    expect(figures.creditSalesOrders).toBeCloseTo(603, 2);
    expect(figures.creditSales).toBeCloseTo(30934.63, 2);
  });
});

describe("HungerStation commission invoice parser", () => {
  test("does not mistake the page-2 bank-fee base for the page-1 Payment Fees total", () => {
    const figures = parseHungerInvoice(
      "Sales Commission 177,350.53 26,602.58 203,953.11 " +
        "Payment Fees 21,159.07 3,173.86 24,332.93 " +
        "Others Commission 133,705.25 20,055.79 153,761.04 " +
        "Total Invoice 332,214.85 49,832.23 382,047.08 " +
        "Total Online Sales (881,878.98) Net Due Invoice (499,831.90) " +
        "Credit Sales 14,173.0 769,843.17 885,319.64 " +
        "Rejected sales 7.0 254.21 292.34" +
        "\n" +
        "Online Payments Fees Successful Bank Fee 731,716.81 2.5% 18,292.94 " +
        "Refunded Bank Fee 1,816.65 2.5% 45.42 " +
        "Wallet Payments Fee 112,827.41 2.5% 2,820.71",
    );

    expect(figures.paymentFees).toBeCloseTo(21159.07, 2);
    expect(figures.salesCommission).toBeCloseTo(177350.53, 2);
    expect(figures.totalExVat).toBeCloseTo(332214.85, 2);
    expect(figures.creditSales).toBeCloseTo(769843.17, 2);
  });

  test("detects the real Online Payments Fees summary label", () => {
    const figures = parseHungerInvoice(
      "Sales Commission 269,792.2 40,468.83 310,261.03 " +
        "Online Payments Fees 43,216.26 6,482.44 49,698.7 " +
        "Others Commission 212,976.92 31,946.54 244,923.46 " +
        "Total Invoice 525,985.38 78,897.81 604,883.19 " +
        "Total Online Sales (1,957,570.23) " +
        "Net Due Invoice (1,352,687.04) " +
        "Credit Sales 30,036.0 1,702,828.6 1,958,252.89 " +
        "Rejected sales 4.0 158.22 181.95",
    );

    expect(figures.salesCommission).toBeCloseTo(269792.2, 2);
    expect(figures.paymentFees).toBeCloseTo(43216.26, 2);
    expect(figures.othersCommission).toBeCloseTo(212976.92, 2);
    expect(figures.totalExVat).toBeCloseTo(525985.38, 2);
    expect(figures.totalIncVat).toBeCloseTo(604883.19, 2);
    expect(figures.creditSalesOrders).toBeCloseTo(30036, 2);
    expect(figures.creditSales).toBeCloseTo(1702828.6, 2);
    expect(figures.creditSalesIncVat).toBeCloseTo(1958252.89, 2);
    expect(figures.rejectedSalesOrders).toBeCloseTo(4, 2);
    expect(figures.rejectedSales).toBeCloseTo(158.22, 2);
    expect(figures.rejectedSalesIncVat).toBeCloseTo(181.95, 2);
  });
});

  test("extracts the aggregate wallet fee base without treating wallet collections as the fee base", () => {
    const figures = parseHungerInvoice(
      "Sales Commission 279,237.45 41,885.62 321,123.07 " +
        "Payment Fees 40,835.53 6,125.33 46,960.86 " +
        "Others Commission 149,161.30 22,374.20 171,535.50 " +
        "Total Invoice 469,234.28 70,385.14 539,619.42" +
        "\n" +
        "Invoice Details Commissions " +
        "Successful Bank Fee 1,628,333.97 2.5% 40,708.37 " +
        "Refunded Bank Fee 2,603.43 2.5% 65.14 " +
        "Wallet Payments Fee 2,480.66 2.5% 62.02 " +
        "Total Commission 469,234.28",
    );

    expect(figures.walletFeeBase).toBeCloseTo(2480.66, 2);
    expect(figures.walletFee).toBeCloseTo(62.02, 2);
    expect(figures.extras?.some((extra) => extra.label.includes("محفظة")) ?? false).toBe(false);
  });

describe("HungerStation CPC parser", () => {
  test("reads the real before-VAT, VAT and after-VAT labels without confusing them", () => {
    const figures = parseCpcInvoice(
      "Total Invoice Value Before VAT SAR 47587.23 " +
        "VAT Value( 15.0 %) SAR 7138.08 " +
        "Total Invoice Value After VAT SAR 54725.31 " +
        "Total Invoice Net Value SAR 54725.31 " +
        "HS-ADS-2026/8-4708457",
    );

    expect(figures.totalExVat).toBeCloseTo(47587.23, 2);
    expect(figures.vat).toBeCloseTo(7138.08, 2);
    expect(figures.totalIncVat).toBeCloseTo(54725.31, 2);
    expect(figures.invoiceNo).toBe("HS-ADS-2026/8-4708457");
  });

  test("accepts the older HS-CPC invoice number format used in July 2026", () => {
    const figures = parseCpcInvoice(
      "Total Invoice Value Before VAT SAR 59441.01 " +
        "VAT Value( 15.0 %) SAR 8916.15 " +
        "Total Invoice Value After VAT SAR 68357.16 " +
        "Total Invoice Net Value SAR 68357.16 " +
        "HS-CPC-2026/7-4617261",
    );

    expect(figures.totalExVat).toBeCloseTo(59441.01, 2);
    expect(figures.vat).toBeCloseTo(8916.15, 2);
    expect(figures.totalIncVat).toBeCloseTo(68357.16, 2);
    expect(figures.invoiceNo).toBe("HS-CPC-2026/7-4617261");
  });
});
