import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

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
      "Original Amount": 115,
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

describe("HungerStation audit rules", () => {
  test("uses the validated status rules and counts only billable RDF orders", () => {
    const result = analyzeHungerStation(buildWorkbook(), {
      manualBankRate: 0.025,
      invoice: {
        lines: [],
        salesCommission: 27.75,
        paymentFees: 5.85,
        othersCommission: 517.5,
        totalExVat: 551.1,
        totalOnlineSales: -214.5,
        extras: [{ label: "الطابعات", amount: 500 }],
      },
    });

    expect(result.summary.orders).toBe(3);
    expect(result.summary.netSales).toBeCloseTo(185, 6);
    expect(result.summary.commission).toBeCloseTo(27.75, 6);
    expect(result.summary.ccSuccess).toBeCloseTo(210, 6);
    expect(result.summary.netBankCards).toBeCloseTo(180, 6);
    expect(result.summary.ccRejected).toBeCloseTo(24, 6);
    expect(result.summary.walletAmount).toBeCloseTo(11, 6);
    expect(result.summary.riderWallet).toBeCloseTo(7, 6);
    expect(result.summary.rdfCampaigns).toBeCloseTo(17.5, 6);
    expect(result.summary.totalFoodDiscount).toBeCloseTo(20, 6);
    expect(result.summary.netMarketingDiscount).toBeCloseTo(16.5, 6);
    expect(result.summary.totalCollections).toBeCloseTo(214.5, 6);
    expect(result.branches[0]?.freeDeliveryOrders).toBe(3);

    const paymentCheck = result.checks.find(
      (check) => check.label === "رسوم الدفع الإلكتروني (البطاقات)",
    );
    expect(paymentCheck?.computed).toBeCloseTo(5.85, 6);
    expect(paymentCheck?.evidence).toBe("contract");

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
      (check) => check.label === "رسوم الدفع الإلكتروني (البطاقات)",
    );
    expect(paymentCheck?.computed).toBeCloseTo(5.85, 6);
    expect(paymentCheck?.invoiced).toBeCloseTo(23.4, 6);
    expect(paymentCheck?.evidence).toBe("contract");
  });

  test("marks invoice-implied bank rates as non-independent when no contract rate is provided", () => {
    const result = analyzeHungerStation(buildWorkbook(), {
      invoice: {
        lines: [],
        paymentFees: 5.85,
      },
    });

    expect(result.summary.bankRateSource).toBe("invoice");
    expect(result.summary.bankRate).toBeCloseTo(0.025, 8);

    const paymentCheck = result.checks.find(
      (check) => check.label === "رسوم الدفع الإلكتروني (البطاقات)",
    );
    expect(paymentCheck?.evidence).toBe("invoice_derived");
  });
});

describe("HungerStation commission invoice parser", () => {
  test("detects the real Online Payments Fees summary label", () => {
    const figures = parseHungerInvoice(
      "Sales Commission 269,792.2 40,468.83 310,261.03 " +
        "Online Payments Fees 43,216.26 6,482.44 49,698.7 " +
        "Others Commission 212,976.92 31,946.54 244,923.46 " +
        "Total Invoice 525,985.38 78,897.81 604,883.19 " +
        "Total Online Sales (1,957,570.23) " +
        "Net Due Invoice (1,352,687.04)",
    );

    expect(figures.salesCommission).toBeCloseTo(269792.2, 2);
    expect(figures.paymentFees).toBeCloseTo(43216.26, 2);
    expect(figures.othersCommission).toBeCloseTo(212976.92, 2);
    expect(figures.totalExVat).toBeCloseTo(525985.38, 2);
    expect(figures.totalIncVat).toBeCloseTo(604883.19, 2);
  });
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
