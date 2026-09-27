import { describe, expect, test } from "bun:test";

import {
  buildExceptionEvidence,
  buildPeriodExceptions,
  summarizeExceptions,
  type ExceptionWorkflowEntry,
} from "./exceptions";
import type { StoredPeriod } from "./periods";

function hungerPeriod(workflow?: Record<string, ExceptionWorkflowEntry>): StoredPeriod {
  return {
    id: "period-1",
    label: "HS Test Company, Aug",
    platform: "hungerstation",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    created_at: "2026-09-01T00:00:00Z",
    summary: {} as StoredPeriod["summary"],
    daily: [],
    branches: [
      {
        branch: "Branch A",
        branchId: "100",
        orders: 10,
        grossSales: 1000,
        netSales: 900,
        commission: 100,
        commissionPct: 0.1,
        ccSuccess: 0,
        ccRejected: 0,
        walletAmount: 0,
        riderWallet: 0,
        rdfCampaigns: 0,
        freeDeliveryOrders: 0,
        compensation: 0,
        jokerFees: 0,
        hsFoodDiscount: 0,
        rewardsDiscount: 0,
        restaurantFoodDiscount: 0,
        totalFoodDiscount: 0,
        partialRefund: 0,
        fulfillmentMods: 0,
        approvedRefunds: 0,
        waitingTimeFees: 0,
        bankFeeSuccess: 0,
        bankFeeRefunded: 0,
        totalCharges: 100,
        invoiceCommission: 110,
      },
    ],
    invoice: {
      lines: [],
      checks: [
        {
          label: "عمولة المبيعات",
          computed: 100,
          invoiced: 110,
          evidence: "data",
          tolerance: 0.05,
        },
        {
          label: "رسوم الدفع الإلكتروني",
          computed: 200,
          invoiced: 210,
          evidence: "contract",
          tolerance: 0.1,
        },
        {
          label: "الطابعات (فاتورة فقط)",
          computed: 0,
          invoiced: 500,
          evidence: "invoice_only",
        },
        {
          label: "إجمالي الفاتورة (بدون ضريبة)",
          computed: 810,
          invoiced: 1310,
          evidence: "mixed",
        },
      ],
      exceptionWorkflow: workflow,
    },
  } as StoredPeriod;
}

describe("Exception Center", () => {
  test("shows only actionable leaf discrepancies and prefers branch evidence", () => {
    const exceptions = buildPeriodExceptions(hungerPeriod());

    expect(exceptions).toHaveLength(2);
    expect(exceptions.filter((item) => item.category === "commission")).toHaveLength(1);
    expect(exceptions.find((item) => item.category === "commission")?.sourceLevel).toBe("branch");
    expect(exceptions.some((item) => item.label.includes("فاتورة فقط"))).toBe(false);
    expect(exceptions.some((item) => item.label.includes("إجمالي الفاتورة"))).toBe(false);

    const summary = summarizeExceptions(exceptions);
    expect(summary.openCount).toBe(2);
    expect(summary.underReview).toBeCloseTo(20, 6);
    expect(summary.potentialRecovery).toBeCloseTo(20, 6);
  });

  test("keeps exception identity, category and filters stable when display labels change", () => {
    const period = {
      id: "stable-check-codes",
      label: "Stable check metadata",
      platform: "hungerstation",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {} as StoredPeriod["summary"],
      daily: [],
      branches: [],
      invoice: {
        lines: [],
        checks: [
          {
            code: "HS_SALES_COMMISSION",
            category: "commission",
            label: "Original commission label",
            computed: 100,
            invoiced: 110,
            evidence: "data",
            tolerance: 0.05,
          },
          {
            code: "HS_INVOICE_TOTAL_EX_VAT",
            category: "invoice_total",
            controlOnly: true,
            label: "Original control label",
            computed: 500,
            invoiced: 900,
            evidence: "data",
            tolerance: 0.05,
          },
          {
            code: "HS_INVOICE_ONLY_EXTRA_1",
            category: "unsupported_charge",
            invoiceOnly: true,
            label: "Original invoice-only label",
            computed: 0,
            invoiced: 500,
            evidence: "invoice_only",
          },
        ],
      },
    } as StoredPeriod;

    const before = buildPeriodExceptions(period);
    expect(before).toHaveLength(1);
    const original = before[0]!;
    expect(original.code).toBe("HS_SALES_COMMISSION");
    expect(original.category).toBe("commission");

    period.invoice.exceptionWorkflow = {
      [original.id]: {
        status: "reviewing",
        note: "stable workflow",
      },
    };
    period.invoice.checks = period.invoice.checks?.map((check, index) => ({
      ...check,
      label: "Renamed UI label " + String(index + 1),
    }));

    const after = buildPeriodExceptions(period);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(original.id);
    expect(after[0]?.code).toBe(original.code);
    expect(after[0]?.category).toBe(original.category);
    expect(after[0]?.status).toBe("reviewing");
    expect(after[0]?.note).toBe("stable workflow");
  });

  test("data-missing exceptions never inflate amount under review", () => {
    const period = hungerPeriod();
    period.branches = [];
    period.invoice.checks = [
      {
        code: "HS_SALES_COMMISSION",
        category: "commission",
        label: "عمولة المبيعات",
        computed: 125000,
        invoiced: undefined,
        evidence: "data",
        tolerance: 0.05,
      },
      {
        code: "HS_CARD_PAYMENT_FEES",
        category: "payment_fee",
        label: "رسوم الدفع",
        computed: 100,
        invoiced: 112,
        evidence: "contract",
        tolerance: 0.1,
      },
    ];

    const exceptions = buildPeriodExceptions(period);
    const missing = exceptions.find((item) => item.category === "data_missing");
    const summary = summarizeExceptions(exceptions);

    expect(missing).toBeDefined();
    expect(missing?.reviewAmount).toBe(0);
    expect(missing?.potentialRecovery).toBe(0);
    expect(summary.underReview).toBeCloseTo(12, 6);
    expect(summary.potentialRecovery).toBeCloseTo(12, 6);
  });

  test("does not create false exposure for a legacy one-branch unnamed invoice match", () => {
    const period = hungerPeriod();
    const dataBranch = {
      ...period.branches[0]!,
      branch: "Burger Waqf Al Jamiyin",
      branchId: "151047",
      orders: 603,
      commission: 5568.196,
      bankFeeSuccess: 805.47475,
      bankFeeRefunded: 0,
      rdfCampaigns: 5960.869565217392,
      compensation: 99.1304347826087,
      jokerFees: 0,
      waitingTimeFees: 0,
      totalCollections: 35422.65,
      creditSales: 30934.63,
      branchAuditStatus: "unmatched" as const,
      branchAuditLabel: "غير مطابق",
      branchAuditNote: "لم يتم العثور على اسم فرع مطابق بشكل موثوق.",
      invoiceCommission: undefined,
    };

    const invoiceOnly = {
      ...period.branches[0]!,
      branch: "فرع في الفاتورة فقط 1",
      branchId: "",
      orders: 0,
      grossSales: 0,
      netSales: 0,
      commission: 0,
      commissionPct: 0,
      ccSuccess: 0,
      ccRejected: 0,
      bankFeeSuccess: 0,
      bankFeeRefunded: 0,
      rdfCampaigns: 0,
      compensation: 0,
      jokerFees: 0,
      waitingTimeFees: 0,
      totalCollections: 0,
      creditSales: 0,
      totalCharges: 0,
      invoiceCommission: 5568.2,
      invoicePaymentFees: 859.14,
      invoiceWalletFee: 53.66,
      invoiceCardPaymentFees: 805.48,
      invoiceOtherCharges: 6060,
      invoiceOnlyBranchCharges: 0,
      invoiceCollections: 35422.65,
      invoiceCreditSales: 30934.63,
      branchAuditStatus: "invoice_only" as const,
      branchAuditLabel: "في الفاتورة فقط",
      branchAuditNote: "الفرع موجود في الفاتورة لكنه غير موجود في ملف الطلبات المرفوع.",
      invoiceBranchName: undefined,
    };

    period.branches = [dataBranch, invoiceOnly];
    period.invoice.checks = [];

    const exceptions = buildPeriodExceptions(period);
    const summary = summarizeExceptions(exceptions);

    expect(exceptions).toHaveLength(0);
    expect(summary.openCount).toBe(0);
    expect(summary.underReview).toBe(0);
    expect(summary.potentialRecovery).toBe(0);
  });

  test("card fees printed under other commission become one classification note with nothing to recover", () => {
    const period = hungerPeriod();
    period.invoice.checks = [];
    period.branches = [
      {
        ...period.branches[0]!,
        branch: "Past - Malqa",
        branchId: "132263",
        commission: 100,
        invoiceCommission: 100,
        bankFeeSuccess: 4639.3,
        bankFeeRefunded: 0,
        rdfCampaigns: 32159.13,
        compensation: 0,
        jokerFees: 0,
        waitingTimeFees: 0,
        invoicePaymentFees: 0,
        invoiceWalletFee: 0,
        invoiceCardPaymentFees: 0,
        invoiceOtherCharges: 36798.44,
        invoiceOnlyBranchCharges: 0,
        branchAuditStatus: "matched" as const,
      },
    ];

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions.map((e) => e.code)).toEqual(["HS_BRANCH_FEE_CLASSIFICATION"]);
    expect(exceptions[0]?.severity).toBe("low");
    const summary = summarizeExceptions(exceptions);
    expect(summary.underReview).toBe(0);
    expect(summary.potentialRecovery).toBe(0);
  });

  test("real card-fee and other-fee gaps that do not offset are still reported separately", () => {
    const period = hungerPeriod();
    period.invoice.checks = [];
    period.branches = [
      {
        ...period.branches[0]!,
        commission: 100,
        invoiceCommission: 100,
        bankFeeSuccess: 100,
        bankFeeRefunded: 0,
        rdfCampaigns: 500,
        compensation: 0,
        jokerFees: 0,
        waitingTimeFees: 0,
        invoiceCardPaymentFees: 140,
        invoiceOtherCharges: 560,
        invoiceOnlyBranchCharges: 0,
        branchAuditStatus: "matched" as const,
      },
    ];

    const codes = buildPeriodExceptions(period).map((e) => e.code).sort();
    expect(codes).toEqual(["HS_BRANCH_CARD_FEE_VARIANCE", "HS_BRANCH_OTHER_FEES_VARIANCE"]);
  });

  test("reconciles one residual operational invoice branch while keeping fixed-fee rows invoice-only", () => {
    const period = hungerPeriod();

    const matchedBranch = {
      ...period.branches[0]!,
      branch: "PAST - Al Nasim",
      branchId: "1001",
      commission: 100,
      invoiceCommission: 100,
      branchAuditStatus: "matched" as const,
      branchAuditLabel: "مطابق",
      branchAuditNote: "مطابق.",
    };

    const mottoData = {
      ...period.branches[0]!,
      branch: "Motto - al Hizam Al Akhdar (Green Belt)",
      branchId: "163465",
      orders: 87,
      commission: 1258.294,
      bankFeeSuccess: 178.57,
      bankFeeRefunded: 0,
      rdfCampaigns: 504.34782608695656,
      compensation: 13.043478260869566,
      jokerFees: 0,
      waitingTimeFees: 0,
      totalCollections: 7873,
      creditSales: 6846.056,
      branchAuditStatus: "unmatched" as const,
      branchAuditLabel: "غير مطابق",
      branchAuditNote: "لم يتم العثور على اسم فرع مطابق بشكل موثوق.",
      invoiceCommission: undefined,
    };

    const mottoInvoice = {
      ...period.branches[0]!,
      branch: "Motto - Uhud",
      branchId: "",
      orders: 0,
      grossSales: 0,
      netSales: 0,
      commission: 0,
      commissionPct: 0,
      ccSuccess: 0,
      ccRejected: 0,
      bankFeeSuccess: 0,
      bankFeeRefunded: 0,
      rdfCampaigns: 0,
      compensation: 0,
      jokerFees: 0,
      waitingTimeFees: 0,
      totalCollections: 0,
      creditSales: 0,
      totalCharges: 0,
      invoiceBranchName: "Motto - Uhud",
      invoiceCommission: 1258.3,
      invoicePaymentFees: 179.4,
      invoiceWalletFee: 0.83,
      invoiceCardPaymentFees: 178.57,
      invoiceOtherCharges: 717.39,
      invoiceOnlyBranchCharges: 200,
      invoiceCollections: 7873,
      invoiceCreditSales: 6846.06,
      branchAuditStatus: "invoice_only" as const,
      branchAuditLabel: "في الفاتورة فقط",
      branchAuditNote: "الفرع موجود في الفاتورة لكنه غير موجود في ملف الطلبات المرفوع.",
    };

    const fixedFee = {
      ...period.branches[0]!,
      branch: "PAST - Al Burj",
      branchId: "",
      orders: 0,
      grossSales: 0,
      netSales: 0,
      commission: 0,
      commissionPct: 0,
      ccSuccess: 0,
      ccRejected: 0,
      bankFeeSuccess: 0,
      bankFeeRefunded: 0,
      rdfCampaigns: 0,
      compensation: 0,
      jokerFees: 0,
      waitingTimeFees: 0,
      totalCollections: 0,
      creditSales: 0,
      totalCharges: 0,
      invoiceBranchName: "PAST - Al Burj",
      invoiceCommission: 0,
      invoicePaymentFees: 0,
      invoiceOtherCharges: 500,
      invoiceOnlyBranchCharges: 500,
      invoiceCollections: 0,
      invoiceCreditSales: 0,
      branchAuditStatus: "invoice_only" as const,
      branchAuditLabel: "في الفاتورة فقط",
      branchAuditNote: "رسوم ثابتة فقط.",
    };

    period.branches = [matchedBranch, mottoData, mottoInvoice, fixedFee];
    period.invoice.checks = [];
    period.invoice.branches = [
      {
        branch: "Motto - Uhud",
        creditSalesOrders: 87,
        rejectedSalesOrders: 0,
      },
      {
        branch: "PAST - Al Burj",
        creditSalesOrders: 0,
        rejectedSalesOrders: 0,
      },
    ];

    const exceptions = buildPeriodExceptions(period);
    const summary = summarizeExceptions(exceptions);

    expect(exceptions).toHaveLength(0);
    expect(summary.openCount).toBe(0);
    expect(summary.underReview).toBe(0);
    expect(summary.potentialRecovery).toBe(0);
  });

  test("does not turn an invoice-only fixed-charge branch into a branch mismatch exception", () => {
    const period = hungerPeriod();
    period.branches.push({
      branch: "Fixed Fee Branch",
      branchId: "",
      orders: 0,
      grossSales: 0,
      netSales: 0,
      commission: 0,
      commissionPct: 0,
      ccSuccess: 0,
      ccRejected: 0,
      walletAmount: 0,
      riderWallet: 0,
      rdfCampaigns: 0,
      freeDeliveryOrders: 0,
      compensation: 0,
      jokerFees: 0,
      hsFoodDiscount: 0,
      rewardsDiscount: 0,
      restaurantFoodDiscount: 0,
      totalFoodDiscount: 0,
      partialRefund: 0,
      fulfillmentMods: 0,
      approvedRefunds: 0,
      waitingTimeFees: 0,
      bankFeeSuccess: 0,
      bankFeeRefunded: 0,
      totalCharges: 0,
      invoiceCommission: 0,
      invoicePaymentFees: 0,
      invoiceOtherCharges: 500,
      invoiceOnlyBranchCharges: 500,
      invoiceCollections: 0,
      invoiceCreditSales: 0,
      branchAuditStatus: "invoice_only",
      branchAuditLabel: "في الفاتورة فقط",
      branchAuditNote: "الفرع يحمل رسماً ثابتاً فقط ولا توجد عليه حركة تشغيلية.",
    });

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions.some((item) => item.branch === "Fixed Fee Branch")).toBe(false);
  });

  test("keeps an invoice-only branch actionable when it contains operational financial activity", () => {
    const period = hungerPeriod();
    period.branches.push({
      branch: "Operational Invoice Branch",
      branchId: "",
      orders: 0,
      grossSales: 0,
      netSales: 0,
      commission: 0,
      commissionPct: 0,
      ccSuccess: 0,
      ccRejected: 0,
      walletAmount: 0,
      riderWallet: 0,
      rdfCampaigns: 0,
      freeDeliveryOrders: 0,
      compensation: 0,
      jokerFees: 0,
      hsFoodDiscount: 0,
      rewardsDiscount: 0,
      restaurantFoodDiscount: 0,
      totalFoodDiscount: 0,
      partialRefund: 0,
      fulfillmentMods: 0,
      approvedRefunds: 0,
      waitingTimeFees: 0,
      bankFeeSuccess: 0,
      bankFeeRefunded: 0,
      totalCharges: 0,
      invoiceCommission: 125,
      invoicePaymentFees: 10,
      invoiceOtherCharges: 0,
      invoiceOnlyBranchCharges: 0,
      invoiceCollections: 700,
      invoiceCreditSales: 800,
      branchAuditStatus: "invoice_only",
      branchAuditLabel: "في الفاتورة فقط",
      branchAuditNote: "يوجد نشاط مالي في الفاتورة بدون فرع مقابل في ملف الطلبات.",
    });

    const exceptions = buildPeriodExceptions(period);
    const actionable = exceptions.filter(
      (item) => item.branch === "Operational Invoice Branch",
    );

    expect(actionable.length).toBeGreaterThan(0);
    expect(
      actionable.some((item) =>
        ["commission", "payment_fee", "collections", "sales", "branch_match"].includes(
          item.category,
        ),
      ),
    ).toBe(true);
  });

  test("never turns aggregate Keeta tax controls into an exception", () => {
    const period = {
      id: "keeta-old",
      label: "Keeta Aug",
      platform: "keeta",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {} as StoredPeriod["summary"],
      daily: [],
      branches: [],
      invoice: {
        lines: [],
        checks: [
          {
            label: "صافي الفاتورة الضريبية شامل الضريبة",
            computed: 643142.06,
            invoiced: 1,
            evidence: "data",
            tolerance: 0.05,
          },
          {
            label: "صافي الفاتورة الضريبية بدون الضريبة",
            computed: 559253.96,
            invoiced: 0,
            evidence: "data",
            tolerance: 0.05,
          },
        ],
      },
    } as StoredPeriod;

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions).toHaveLength(0);
    expect(summarizeExceptions(exceptions).openCount).toBe(0);
  });

  test("uses strict default tolerance instead of silently ignoring differences below SAR 1", () => {
    const period = {
      id: "strict-tolerance",
      label: "HS strict tolerance",
      platform: "hungerstation",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {} as StoredPeriod["summary"],
      daily: [],
      branches: [],
      invoice: {
        lines: [],
        checks: [
          {
            label: "عمولة المبيعات",
            computed: 100,
            invoiced: 100.2,
            evidence: "data",
          },
        ],
      },
    } as StoredPeriod;

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.reviewAmount).toBeCloseTo(0.2, 6);
  });

  test("a clean Keeta branch report stays clean even if a stale aggregate control is corrupted", () => {
    const period = {
      id: "keeta-clean",
      label: "Keeta Aug",
      platform: "keeta",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {} as StoredPeriod["summary"],
      daily: [],
      branches: [
        {
          branch: "Branch A",
          branchId: "1001",
          orders: 5,
          grossSales: 1000,
          netSales: 700,
          commission: 100,
          commissionPct: 0.1,
          ccSuccess: 0,
          ccRejected: 0,
          walletAmount: 0,
          riderWallet: 0,
          rdfCampaigns: 0,
          freeDeliveryOrders: 0,
          compensation: 0,
          jokerFees: 0,
          hsFoodDiscount: 0,
          rewardsDiscount: 0,
          restaurantFoodDiscount: 0,
          totalFoodDiscount: 0,
          partialRefund: 0,
          fulfillmentMods: 0,
          approvedRefunds: 0,
          waitingTimeFees: 0,
          bankFeeSuccess: 0,
          bankFeeRefunded: 0,
          totalCharges: 300,
          branchAuditStatus: "matched",
          keetaCommissionExVat: 100,
          keetaBankFeesExVat: 20,
          keetaDeliveryCampaignExVat: 30,
          keetaCreditSales: 900,
          keetaPdfOrderCommissionInclVat: 115,
          keetaPdfOrderCommissionVariance: 0,
          keetaPdfBankCommissionInclVat: 23,
          keetaPdfBankCommissionVariance: 0,
          keetaPdfDeliveryCommissionInclVat: 34.5,
          keetaPdfDeliveryCommissionVariance: 0,
          keetaPdfCreditSales: 900,
          keetaPdfCreditSalesVariance: 0,
          keetaPdfNetDue: 700,
          keetaPdfNetDueVariance: 0,
        },
      ],
      invoice: {
        lines: [],
        checks: [
          {
            label: "عمولة الطلب",
            computed: 100,
            invoiced: 100,
            evidence: "data",
            tolerance: 0.05,
          },
          {
            label: "صافي الفاتورة الضريبية شامل الضريبة",
            computed: 643142.06,
            invoiced: 1,
            evidence: "data",
            tolerance: 0.05,
          },
        ],
      },
    } as StoredPeriod;

    expect(buildPeriodExceptions(period)).toHaveLength(0);
  });

  test("uses Keeta Excel Payable as the actionable branch exception without double-counting Invoice amount", () => {
    const period = {
      id: "keeta-excel-mismatch",
      label: "Keeta Excel",
      platform: "keeta",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {} as StoredPeriod["summary"],
      daily: [],
      branches: [
        {
          branch: "Branch A",
          branchId: "1001",
          orders: 2,
          grossSales: 120,
          netSales: 90,
          commission: 10,
          commissionPct: 0.1,
          ccSuccess: 0,
          ccRejected: 0,
          walletAmount: 0,
          riderWallet: 0,
          rdfCampaigns: 0,
          freeDeliveryOrders: 0,
          compensation: 0,
          jokerFees: 0,
          hsFoodDiscount: 0,
          rewardsDiscount: 0,
          restaurantFoodDiscount: 0,
          totalFoodDiscount: 0,
          partialRefund: 0,
          fulfillmentMods: 0,
          approvedRefunds: 0,
          waitingTimeFees: 0,
          bankFeeSuccess: 0,
          bankFeeRefunded: 0,
          totalCharges: 30,
          branchAuditStatus: "warning",
          branchAuditLabel: "يحتاج مراجعة",
          branchAuditNote: "يوجد فرق بين Order Summary وInvoice Details في Excel.",
          keetaCommissionInvoiceInclVat: 20,
          keetaMerchantAdExVat: 0,
          keetaExcelInvoiceAmount: 30,
          keetaExcelInvoiceVariance: -10,
          keetaExcelPayable: 80,
          keetaExcelPayableVariance: 10,
        },
      ],
      invoice: {
        lines: [],
        checks: [
          {
            label: "Invoice amount مقابل Invoice Details",
            computed: 20,
            invoiced: 30,
            evidence: "data",
            tolerance: 0.05,
          },
          {
            label: "صافي المستحق مقابل Invoice Details",
            computed: 90,
            invoiced: 80,
            evidence: "data",
            tolerance: 0.05,
          },
        ],
      },
    } as StoredPeriod;

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.category).toBe("settlement");
    expect(exceptions[0]?.label).toBe("فرق Payable للفرع");
    expect(exceptions[0]?.reviewAmount).toBeCloseTo(10, 6);
    expect(exceptions[0]?.potentialRecovery).toBeCloseTo(10, 6);

    const evidence = buildExceptionEvidence(period, exceptions[0]!);
    expect(evidence.platformSources[0]?.source).toContain("Invoice Details");
  });

  test("creates actionable Jahez compensation cases without treating cross-period matches as errors", () => {
    const period = {
      id: "jahez-comp",
      label: "Jahez Aug",
      platform: "jahez",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {} as StoredPeriod["summary"],
      daily: [],
      branches: [],
      invoice: {
        lines: [],
        checks: [],
        jahezCompensation: {
          summaryTransactions: 4,
          summaryDebit: 139,
          summaryCredit: 0,
          detailTransactions: 4,
          detailDebit: 139,
          detailCredit: 0,
          netImpact: 139,
          matchedCurrent: 1,
          matchedHistorical: 1,
          unknownOrders: 1,
          duplicateCandidates: 1,
          duplicateAmount: 43,
          transactions: [
            {
              sequence: "1",
              branch: "Al Doha",
              orderId: "8437233319",
              transactionType: "debit",
              reason: "Adjustment",
              creationDate: "8/20/2026 13:52",
              amount: 43,
              free: false,
              match: "current",
              matchedBranch: "Al Doha",
            },
            {
              sequence: "2",
              branch: "Al Doha",
              orderId: "8437233319",
              transactionType: "debit",
              reason: "Adjustment",
              creationDate: "8/20/2026 13:52",
              amount: 43,
              free: false,
              match: "current",
              matchedBranch: "Al Doha",
              duplicateCandidate: true,
            },
            {
              sequence: "3",
              branch: "Uhud",
              orderId: "5789809338",
              transactionType: "debit",
              reason: "Adjustment",
              creationDate: "8/2/2026 2:53",
              amount: 43,
              free: false,
              match: "historical",
              matchedBranch: "Uhud",
              matchedPeriodLabel: "Jahez Jul",
            },
            {
              sequence: "4",
              branch: "Unknown",
              orderId: "999",
              transactionType: "debit",
              reason: "Adjustment",
              creationDate: "8/4/2026 1:00",
              amount: 10,
              free: false,
              match: "unknown",
            },
          ],
        },
      },
    } as StoredPeriod;

    const exceptions = buildPeriodExceptions(period);
    expect(exceptions).toHaveLength(2);

    const duplicate = exceptions.find((item) => item.label.includes("تكرار"));
    expect(duplicate?.category).toBe("compensation");
    expect(duplicate?.reviewAmount).toBeCloseTo(43, 6);
    expect(duplicate?.potentialRecovery).toBeCloseTo(43, 6);

    const unknown = exceptions.find((item) => item.label.includes("بدون طلب"));
    expect(unknown?.reviewAmount).toBeCloseTo(10, 6);
    expect(unknown?.potentialRecovery).toBeCloseTo(0, 6);

    expect(exceptions.some((item) => item.label.includes("5789809338"))).toBe(false);

    const evidence = buildExceptionEvidence(period, duplicate!);
    expect(evidence.formula).toContain("تعويض جاهز");
    expect(evidence.calculatedSources.some((row) => row.label === "رقم الطلب")).toBe(true);
  });

  test("builds a branch evidence trail with source fields and formula", () => {
    const period = hungerPeriod();
    const exception = buildPeriodExceptions(period).find(
      (item) => item.category === "commission",
    );
    expect(exception).toBeDefined();

    const evidence = buildExceptionEvidence(period, exception!);
    expect(evidence.formula).toContain("عمولة");
    expect(evidence.evidenceLabel).toBe("بيانات مستقلة");
    expect(
      evidence.calculatedSources.some((row) => row.source.includes("Commissionable GMV")),
    ).toBe(true);
    expect(
      evidence.platformSources.some((row) => row.source.includes("Sales Commission")),
    ).toBe(true);
    expect(evidence.conclusion).toContain("يتجاوز هامش المطابقة");
  });

  test("uses stored workflow history in the evidence trail", () => {
    const base = hungerPeriod();
    const exception = buildPeriodExceptions(base).find(
      (item) => item.category === "commission",
    );
    expect(exception).toBeDefined();

    const period = hungerPeriod({
      [exception!.id]: {
        status: "disputed",
        note: "تم إرسال الاعتراض",
        updatedAt: "2026-09-20T02:00:00.000Z",
        history: [
          {
            at: "2026-09-20T01:00:00.000Z",
            status: "reviewing",
          },
          {
            at: "2026-09-20T02:00:00.000Z",
            status: "disputed",
            note: "تم إرسال الاعتراض",
          },
        ],
      },
    });

    const updated = buildPeriodExceptions(period).find(
      (item) => item.id === exception!.id,
    );
    expect(updated).toBeDefined();

    const evidence = buildExceptionEvidence(period, updated!);
    expect(evidence.workflow).toHaveLength(2);
    expect(evidence.workflow[1]?.status).toBe("disputed");
    expect(evidence.workflow[1]?.note).toBe("تم إرسال الاعتراض");
  });

  test("applies persisted workflow without changing audit evidence", () => {
    const initial = buildPeriodExceptions(hungerPeriod());
    const commission = initial.find((item) => item.category === "commission");
    expect(commission).toBeDefined();

    const workflow: Record<string, ExceptionWorkflowEntry> = {
      [commission!.id]: {
        status: "recovered",
        recoveredAmount: 8,
        note: "تم استرداد جزء من الفرق",
      },
    };

    const exceptions = buildPeriodExceptions(hungerPeriod(workflow));
    const updated = exceptions.find((item) => item.id === commission!.id);
    expect(updated?.status).toBe("recovered");
    expect(updated?.recoveredAmount).toBe(8);
    expect(updated?.computed).toBe(100);
    expect(updated?.invoiced).toBe(110);

    const summary = summarizeExceptions(exceptions);
    expect(summary.openCount).toBe(1);
    expect(summary.underReview).toBeCloseTo(10, 6);
    expect(summary.potentialRecovery).toBeCloseTo(10, 6);
    expect(summary.recovered).toBeCloseTo(8, 6);
  });
});
