import type {
  AnalysisResult,
  BranchRow,
  CheckRow,
  DailyRow,
  NinjaInvoiceSummary,
  Summary,
} from "./types";
import { aggregateNinjaPdfFiles, type NinjaPdfDocument } from "./ninja-files";

const VAT_FACTOR = 1.15;
const FORMAT_ID = "ninja-invoice-summary-v1";

function round(value: number): number {
  const result = Math.round(value * 1000000) / 1000000;
  return Object.is(result, -0) ? 0 : result;
}

function money(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function branchRow(input: ReturnType<typeof aggregateNinjaPdfFiles>["branches"][number]): BranchRow {
  const commission =
    input.successfulCommission + input.rejectedCommission + input.cancelledCommission;
  const paymentFees =
    input.successfulOnlinePaymentFee +
    input.rejectedOnlinePaymentFee +
    input.cancelledOnlinePaymentFee;
  const fixedFees = input.successfulFixedFee + input.rejectedFixedFee;
  const compensation = input.missingItemCompensation + input.lateDeliveryCompensation;
  const other = input.advertisementBookings + input.ncrBookingFee;
  const commissionBase = input.successfulCommissionableValue;

  return {
    branch: input.branch,
    branchId: input.branch,
    orders: input.successfulOrders,
    grossSales: round(input.successfulOrdersValue),
    netSales: round(input.successfulOrdersValue - input.totalIncVat),
    commission: round(commission),
    commissionPct: commissionBase > 0 ? round(commission / commissionBase) : 0,
    ccSuccess: 0,
    ccRejected: 0,
    walletAmount: 0,
    riderWallet: 0,
    rdfCampaigns: 0,
    freeDeliveryOrders: 0,
    compensation: round(compensation),
    jokerFees: 0,
    hsFoodDiscount: 0,
    rewardsDiscount: 0,
    restaurantFoodDiscount: 0,
    totalFoodDiscount: 0,
    partialRefund: 0,
    fulfillmentMods: 0,
    approvedRefunds: 0,
    waitingTimeFees: 0,
    bankFeeSuccess: round(paymentFees),
    bankFeeRefunded: 0,
    totalCharges: round(input.totalIncVat),
    rejectedOrders: input.rejectedOrders,
    rejectedSales: round(input.rejectedOrdersValue),
    ninjaCommissionExVat: round(commission),
    ninjaPaymentFeesExVat: round(paymentFees),
    ninjaFixedFeesExVat: round(fixedFees),
    ninjaAdvertisingExVat: round(input.advertisementBookings),
    ninjaCompensationExVat: round(compensation),
    ninjaNcrBookingFeeExVat: round(input.ncrBookingFee),
    ninjaInputVat: round(input.vat),
    ninjaInvoiceTotalInclVat: round(input.totalIncVat),
    branchAuditStatus: "matched",
    branchAuditLabel: "مطابق لملخصات فواتير نينجا",
    branchAuditNote: "الأرقام مجمعة مباشرة من ملفات Invoice Summary المطابقة بأرقام SINV.",
  };
}

function buildSummary(branches: BranchRow[], periodStart: string | null, periodEnd: string | null): Summary {
  const orders = branches.reduce((sum, branch) => sum + branch.orders, 0);
  const grossSales = branches.reduce((sum, branch) => sum + branch.grossSales, 0);
  const commission = branches.reduce((sum, branch) => sum + branch.commission, 0);
  const totalCharges = branches.reduce((sum, branch) => sum + branch.totalCharges, 0);
  const paymentFees = branches.reduce((sum, branch) => sum + (branch.ninjaPaymentFeesExVat ?? 0), 0);
  const fixedFees = branches.reduce((sum, branch) => sum + (branch.ninjaFixedFeesExVat ?? 0), 0);
  const advertising = branches.reduce((sum, branch) => sum + (branch.ninjaAdvertisingExVat ?? 0), 0);
  const compensation = branches.reduce((sum, branch) => sum + (branch.ninjaCompensationExVat ?? 0), 0);
  const ncr = branches.reduce((sum, branch) => sum + (branch.ninjaNcrBookingFeeExVat ?? 0), 0);
  const inputVat = branches.reduce((sum, branch) => sum + (branch.ninjaInputVat ?? 0), 0);

  return {
    platform: "ninja",
    orders,
    grossSales: round(grossSales),
    netSales: round(branches.reduce((sum, branch) => sum + branch.netSales, 0)),
    commission: round(commission),
    commissionPct: grossSales > 0 ? round(commission / (grossSales / VAT_FACTOR)) : 0,
    ccSuccess: 0,
    ccRejected: 0,
    walletAmount: 0,
    riderWallet: 0,
    rdfCampaigns: 0,
    compensation: round(compensation),
    jokerFees: 0,
    hsFoodDiscount: 0,
    rewardsDiscount: 0,
    restaurantFoodDiscount: 0,
    totalFoodDiscount: 0,
    partialRefund: 0,
    fulfillmentMods: 0,
    approvedRefunds: 0,
    waitingTimeFees: 0,
    rejectedOrders: branches.reduce((sum, branch) => sum + (branch.rejectedOrders ?? 0), 0),
    rejectedSales: round(branches.reduce((sum, branch) => sum + (branch.rejectedSales ?? 0), 0)),
    bankRate: 0,
    bankRateSource: "none",
    bankFeeSuccess: round(paymentFees),
    bankFeeRefunded: 0,
    invoiceOnlyExtras: round(fixedFees + advertising + compensation + ncr),
    totalCharges: round(totalCharges),
    branchCount: branches.length,
    statusCounts: { invoice_summary: orders },
    periodStart,
    periodEnd,
    ninjaCommissionExVat: round(commission),
    ninjaPaymentFeesExVat: round(paymentFees),
    ninjaFixedFeesExVat: round(fixedFees),
    ninjaAdvertisingExVat: round(advertising),
    ninjaCompensationExVat: round(compensation),
    ninjaNcrBookingFeeExVat: round(ncr),
    ninjaInputVat: round(inputVat),
    ninjaInvoiceTotalInclVat: round(totalCharges),
  };
}

function invoiceChecks(branches: BranchRow[]): CheckRow[] {
  const totalExVat = branches.reduce(
    (sum, branch) =>
      sum +
      (branch.ninjaCommissionExVat ?? 0) +
      (branch.ninjaPaymentFeesExVat ?? 0) +
      (branch.ninjaFixedFeesExVat ?? 0) +
      (branch.ninjaAdvertisingExVat ?? 0) +
      (branch.ninjaCompensationExVat ?? 0) +
      (branch.ninjaNcrBookingFeeExVat ?? 0),
    0,
  );
  const inputVat = branches.reduce((sum, branch) => sum + (branch.ninjaInputVat ?? 0), 0);
  const totalInclVat = branches.reduce((sum, branch) => sum + (branch.ninjaInvoiceTotalInclVat ?? 0), 0);
  return [
    {
      code: "ninja_invoice_summary_control",
      category: "invoice_total",
      controlOnly: true,
      label: "إجمالي ملخصات فواتير نينجا",
      computed: round(totalExVat + inputVat),
      invoiced: round(totalInclVat),
      evidence: "invoice_derived",
      tolerance: 0.05,
      hint: "تحقق تجميعي من مجموع بنود Invoice Summary مقابل إجمالي الفواتير شامل الضريبة.",
    },
  ];
}

export function analyzeNinjaPdfDocuments(
  invoiceFileNames: string[],
  summaries: NinjaPdfDocument[],
  label?: string,
): AnalysisResult {
  if (!summaries.length) {
    throw new Error("ارفع ملفات Ninja Invoice Summary بصيغة PDF.");
  }

  const aggregate = aggregateNinjaPdfFiles(invoiceFileNames, summaries);
  if (aggregate.duplicateInvoiceNumbers.length) {
    throw new Error(
      "يوجد رقم فاتورة Ninja مكرر: " + aggregate.duplicateInvoiceNumbers.join("، "),
    );
  }
  if (aggregate.unmatchedInvoices.length || aggregate.unmatchedSummaries.length) {
    const parts = [
      aggregate.unmatchedInvoices.length
        ? "فواتير بدون Summary: " + aggregate.unmatchedInvoices.join("، ")
        : "",
      aggregate.unmatchedSummaries.length
        ? "Summary بدون فاتورة: " + aggregate.unmatchedSummaries.join("، ")
        : "",
    ].filter(Boolean);
    throw new Error("ملفات Ninja غير مكتملة المطابقة. " + parts.join(" · "));
  }

  const branches = aggregate.branches.map(branchRow);
  if (!branches.length) throw new Error("تعذّر استخراج فروع Ninja من ملفات Invoice Summary.");

  const summary = buildSummary(branches, aggregate.periodStart, aggregate.periodEnd);
  const daily: DailyRow[] = [];

  const defaultLabel =
    aggregate.periodStart && aggregate.periodEnd
      ? "Ninja · " + aggregate.periodStart + " – " + aggregate.periodEnd
      : "Ninja";

  const allSummaries: NinjaInvoiceSummary[] = summaries.map((document) => document.summary);

  return {
    platform: "ninja",
    formatIds: [FORMAT_ID],
    label: label?.trim() || defaultLabel,
    summary,
    branches,
    daily,
    invoice: {
      lines: [
        { label: "عمولة نينجا قبل الضريبة", amount: summary.ninjaCommissionExVat ?? 0 },
        { label: "رسوم الدفع قبل الضريبة", amount: summary.ninjaPaymentFeesExVat ?? 0 },
        { label: "الرسوم الثابتة قبل الضريبة", amount: summary.ninjaFixedFeesExVat ?? 0 },
        { label: "الإعلانات قبل الضريبة", amount: summary.ninjaAdvertisingExVat ?? 0 },
        { label: "التعويضات قبل الضريبة", amount: summary.ninjaCompensationExVat ?? 0 },
        { label: "NCR Booking Fee قبل الضريبة", amount: summary.ninjaNcrBookingFeeExVat ?? 0 },
        { label: "ضريبة رسوم نينجا", amount: summary.ninjaInputVat ?? 0 },
        { label: "إجمالي فواتير نينجا شامل الضريبة", amount: summary.ninjaInvoiceTotalInclVat ?? 0 },
      ].filter((line) => Math.abs(line.amount) > 0.000001),
      totalExVat: round(
        (summary.ninjaCommissionExVat ?? 0) +
          (summary.ninjaPaymentFeesExVat ?? 0) +
          (summary.ninjaFixedFeesExVat ?? 0) +
          (summary.ninjaAdvertisingExVat ?? 0) +
          (summary.ninjaCompensationExVat ?? 0) +
          (summary.ninjaNcrBookingFeeExVat ?? 0),
      ),
      vat: summary.ninjaInputVat,
      totalIncVat: summary.ninjaInvoiceTotalInclVat,
      ninjaSummaries: allSummaries,
    },
    checks: invoiceChecks(branches),
  };
}
