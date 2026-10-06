import type {
  BranchRow,
  CheckCategory,
  CheckRow,
  Platform,
} from "./types";

interface StableCheckMetadata {
  code: string;
  category: CheckCategory;
  invoiceOnly?: boolean;
  controlOnly?: boolean;
}

const LEGACY_CHECKS: Record<
  Platform,
  Record<string, StableCheckMetadata>
> = {
  hungerstation: {
    "عمولة المبيعات": {
      code: "HS_SALES_COMMISSION",
      category: "commission",
    },
    "رسوم الدفع الإلكتروني": {
      code: "HS_CARD_PAYMENT_FEES",
      category: "payment_fee",
    },
    "رسوم الدفع الإلكتروني القابلة للتحقق (البطاقات)": {
      code: "HS_CARD_PAYMENT_FEES",
      category: "payment_fee",
    },
    "عمولات أخرى القابلة للتحقق من البيانات": {
      code: "HS_OTHER_COMMISSION_DATA",
      category: "other_fee",
    },
    "إجمالي الفاتورة (بدون ضريبة)": {
      code: "HS_INVOICE_TOTAL_EX_VAT",
      category: "invoice_total",
      controlOnly: true,
    },
    "مبيعات الائتمان (بدون ضريبة)": {
      code: "HS_CREDIT_SALES",
      category: "sales",
    },
    "المبيعات المرفوضة (بدون ضريبة)": {
      code: "HS_REJECTED_SALES",
      category: "rejected_sales",
    },
    "رسوم مدفوعات المحافظ (أساس من الفاتورة)": {
      code: "HS_WALLET_PAYMENT_FEE",
      category: "payment_fee",
      controlOnly: true,
    },
    "إجمالي التحصيلات": {
      code: "HS_TOTAL_COLLECTIONS",
      category: "collections",
    },
    "صافي المستحق بعد فاتورة العمولة": {
      code: "HS_NET_DUE_AFTER_INVOICE",
      category: "settlement",
    },
  },
  keeta: {
    "صافي التسوية مقابل Order Summary Payable": {
      code: "KEETA_ORDER_SUMMARY_PAYABLE",
      category: "settlement",
    },
    "Invoice amount مقابل Invoice Details": {
      code: "KEETA_EXCEL_INVOICE_AMOUNT",
      category: "invoice_total",
    },
    "صافي المستحق مقابل Invoice Details": {
      code: "KEETA_EXCEL_PAYABLE",
      category: "settlement",
    },
    "Invoice amount مقابل Billing data summary": {
      code: "KEETA_BILLING_INVOICE_AMOUNT",
      category: "invoice_total",
      controlOnly: true,
    },
    "صافي المستحق مقابل Billing data summary": {
      code: "KEETA_BILLING_PAYABLE",
      category: "settlement",
      controlOnly: true,
    },
    "عمولة الطلب": {
      code: "KEETA_ORDER_COMMISSION",
      category: "commission",
    },
    "الرسوم المصرفية": {
      code: "KEETA_BANK_COMMISSION",
      category: "payment_fee",
    },
    "عمولات أخرى - دعم توصيل كيتا": {
      code: "KEETA_DELIVERY_COMMISSION",
      category: "delivery_campaign",
    },
    "إجمالي فاتورة العمولة بدون الضريبة": {
      code: "KEETA_COMMISSION_INVOICE_EX_VAT",
      category: "invoice_total",
      controlOnly: true,
    },
    "إجمالي فاتورة العمولة شامل الضريبة": {
      code: "KEETA_COMMISSION_INVOICE_INCL_VAT",
      category: "invoice_total",
      controlOnly: true,
    },
    "إجمالي البيع الآجل": {
      code: "KEETA_CREDIT_SALES",
      category: "sales",
    },
    "صافي المستحق مقابل فاتورة كيتا": {
      code: "KEETA_PDF_NET_DUE",
      category: "settlement",
    },
    "إعانة التاجر على الأصناف": {
      code: "KEETA_MERCHANT_ITEM_SUBSIDY",
      category: "campaign",
    },
    "تكاليف الإعلانات": {
      code: "KEETA_ADVERTISING_COSTS",
      category: "advertising",
    },
    "رسوم أجهزة POS": {
      code: "KEETA_POS_FEES",
      category: "pos_fee",
    },
    "صافي الفاتورة الضريبية بدون الضريبة": {
      code: "KEETA_TAX_INVOICE_NET_EX_VAT",
      category: "invoice_total",
      controlOnly: true,
    },
    "صافي الفاتورة الضريبية شامل الضريبة": {
      code: "KEETA_TAX_INVOICE_NET_INCL_VAT",
      category: "invoice_total",
      controlOnly: true,
    },
  },
  jahez: {
    "إجمالي الطلبات مقابل ملخص جاهز": {
      code: "JAHEZ_ORDERS_SUMMARY_CONTROL",
      category: "sales",
      controlOnly: true,
    },
    "صافي المطعم المعاد احتسابه": {
      code: "JAHEZ_RESTAURANT_SETTLEMENT_CONTROL",
      category: "settlement",
      controlOnly: true,
    },
    "عمولة الطلبات مقابل ملخص جاهز": {
      code: "JAHEZ_COMMISSION_SUMMARY_CONTROL",
      category: "commission",
      controlOnly: true,
    },
    "تعويضات جاهز: إجمالي الخصم": {
      code: "JAHEZ_COMPENSATION_DEBIT_CONTROL",
      category: "compensation",
      controlOnly: true,
    },
    "تعويضات جاهز: إجمالي الإضافة": {
      code: "JAHEZ_COMPENSATION_CREDIT_CONTROL",
      category: "compensation",
      controlOnly: true,
    },
    "عمولة جاهز": {
      code: "JAHEZ_PDF_COMMISSION",
      category: "commission",
    },
    "عروض التوصيل": {
      code: "JAHEZ_DELIVERY_OFFERS",
      category: "delivery_campaign",
    },
    "رسوم مدفوعات جاهز": {
      code: "JAHEZ_PAYMENT_FEES",
      category: "payment_fee",
    },
    "إجمالي فاتورة جاهز بدون الضريبة": {
      code: "JAHEZ_INVOICE_TOTAL_EX_VAT",
      category: "invoice_total",
      controlOnly: true,
    },
    "ضريبة فاتورة جاهز": {
      code: "JAHEZ_INVOICE_VAT",
      category: "tax",
      controlOnly: true,
    },
    "إجمالي فاتورة جاهز شامل الضريبة": {
      code: "JAHEZ_INVOICE_TOTAL_INCL_VAT",
      category: "invoice_total",
      controlOnly: true,
    },
  },
};

function branchCoverage(
  code: string,
  branches: BranchRow[],
): boolean | undefined {
  switch (code) {
    case "HS_SALES_COMMISSION":
      return branches.some((branch) => branch.invoiceCommission !== undefined);
    case "HS_CARD_PAYMENT_FEES":
      return branches.some((branch) => branch.invoicePaymentFees !== undefined);
    case "HS_OTHER_COMMISSION_DATA":
      return branches.some((branch) => branch.invoiceOtherCharges !== undefined);
    case "HS_CREDIT_SALES":
      return branches.some(
        (branch) =>
          branch.invoiceCreditSales !== undefined ||
          branch.branchAuditNote?.includes("ملخص مبيعات الفرع مفقود"),
      );
    case "HS_TOTAL_COLLECTIONS":
      return branches.some((branch) => branch.invoiceCollections !== undefined);
    case "KEETA_ORDER_SUMMARY_PAYABLE":
    case "KEETA_EXCEL_PAYABLE":
      return branches.some((branch) => branch.keetaExcelPayable !== undefined);
    case "KEETA_EXCEL_INVOICE_AMOUNT":
      return branches.some((branch) => branch.keetaExcelInvoiceAmount !== undefined);
    case "KEETA_ORDER_COMMISSION":
      return branches.some((branch) => branch.keetaPdfOrderCommissionInclVat !== undefined);
    case "KEETA_BANK_COMMISSION":
      return branches.some((branch) => branch.keetaPdfBankCommissionInclVat !== undefined);
    case "KEETA_DELIVERY_COMMISSION":
      return branches.some((branch) => branch.keetaPdfDeliveryCommissionInclVat !== undefined);
    case "KEETA_CREDIT_SALES":
      return branches.some((branch) => branch.keetaPdfCreditSales !== undefined);
    case "KEETA_PDF_NET_DUE":
      return branches.some((branch) => branch.keetaPdfNetDue !== undefined);
    default:
      return undefined;
  }
}

export function normalizeCheckMetadata(
  platform: Platform,
  branches: BranchRow[],
  checks: CheckRow[],
): CheckRow[] {
  return checks.map((check, index) => {
    if (check.code && check.category) {
      return {
        ...check,
        coveredByBranches:
          check.coveredByBranches ?? branchCoverage(check.code, branches),
      };
    }

    const legacy = LEGACY_CHECKS[platform][check.label];
    if (legacy) {
      return {
        ...check,
        ...legacy,
        coveredByBranches: branchCoverage(legacy.code, branches),
      };
    }

    if (check.evidence === "invoice_only") {
      return {
        ...check,
        code: platform.toUpperCase() + "_LEGACY_INVOICE_ONLY_" + String(index + 1),
        category: "unsupported_charge",
        invoiceOnly: true,
      };
    }

    // Unknown historical checks are retained for Invoice Check but never promoted
    // to an actionable financial exception without explicit metadata.
    return {
      ...check,
      code: platform.toUpperCase() + "_LEGACY_UNKNOWN_" + String(index + 1),
      category: "other",
      controlOnly: true,
    };
  });
}
