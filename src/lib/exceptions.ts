import type { CheckEvidence } from "./analysis/types";
import type { StoredPeriod } from "./periods";

export type ExceptionStatus =
  | "new"
  | "reviewing"
  | "contacted"
  | "disputed"
  | "recovered"
  | "closed";

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";

export type ExceptionCategory =
  | "commission"
  | "payment_fee"
  | "other_fee"
  | "delivery_campaign"
  | "campaign"
  | "advertising"
  | "pos_fee"
  | "sales"
  | "rejected_sales"
  | "collections"
  | "settlement"
  | "tax"
  | "invoice_total"
  | "unsupported_charge"
  | "branch_match"
  | "other";

export interface ExceptionWorkflowEntry {
  status: ExceptionStatus;
  note?: string;
  recoveredAmount?: number;
  updatedAt?: string;
}

export interface AuditException {
  id: string;
  periodId: string;
  periodLabel: string;
  platform: StoredPeriod["platform"];
  periodStart: string | null;
  periodEnd: string | null;
  sourceLevel: "summary" | "branch";
  branch?: string;
  branchId?: string;
  category: ExceptionCategory;
  categoryLabel: string;
  label: string;
  computed?: number;
  invoiced?: number;
  difference?: number;
  tolerance: number;
  reviewAmount: number;
  potentialRecovery: number;
  evidence?: CheckEvidence;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  note?: string;
  recoveredAmount: number;
  rollup: boolean;
  hint?: string;
}

export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, string> = {
  new: "جديد",
  reviewing: "قيد المراجعة",
  contacted: "تم التواصل",
  disputed: "تم الاعتراض",
  recovered: "تم الاسترداد",
  closed: "مغلق",
};

export const EXCEPTION_SEVERITY_LABELS: Record<ExceptionSeverity, string> = {
  critical: "حرج",
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
};

const CATEGORY_LABELS: Record<ExceptionCategory, string> = {
  commission: "العمولة",
  payment_fee: "رسوم الدفع",
  other_fee: "رسوم أخرى",
  delivery_campaign: "التوصيل والحملات",
  campaign: "الحملات",
  advertising: "الإعلانات",
  pos_fee: "رسوم POS",
  sales: "المبيعات",
  rejected_sales: "المبيعات المرفوضة",
  collections: "التحصيلات",
  settlement: "التسوية",
  tax: "الضريبة",
  invoice_total: "إجمالي الفاتورة",
  unsupported_charge: "بند غير مدعوم",
  branch_match: "مطابقة الفرع",
  other: "أخرى",
};

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function exceptionId(
  periodId: string,
  level: "summary" | "branch",
  category: ExceptionCategory,
  label: string,
  branchId?: string,
): string {
  return `ex_${hashString([periodId, level, category, branchId ?? "", label].join("|"))}`;
}

function categoryForLabel(label: string, evidence?: CheckEvidence): ExceptionCategory {
  if (evidence === "invoice_only" || label.includes("فاتورة فقط")) return "unsupported_charge";
  if (label.includes("عمولة المبيعات") || label.includes("عمولة الطلب")) return "commission";
  if (
    label.includes("رسوم الدفع") ||
    label.includes("الرسوم المصرفية") ||
    label.includes("رسوم مدفوعات المحافظ")
  ) {
    return "payment_fee";
  }
  if (label.includes("عمولات أخرى")) {
    return label.includes("توصيل") ? "delivery_campaign" : "other_fee";
  }
  if (label.includes("إعانة") || label.includes("حملة")) return "campaign";
  if (label.includes("الإعلانات")) return "advertising";
  if (label.includes("POS")) return "pos_fee";
  if (label.includes("مرفوض")) return "rejected_sales";
  if (label.includes("مبيعات") || label.includes("البيع الآجل")) return "sales";
  if (label.includes("التحصيلات")) return "collections";
  if (label.includes("صافي المستحق") || label.includes("التسوية")) return "settlement";
  if (label.includes("الضريبية") || label.includes("الضريبة")) return "tax";
  if (label.includes("إجمالي الفاتورة") || label.includes("فاتورة العمولة")) return "invoice_total";
  return "other";
}

function isRollupLabel(label: string): boolean {
  return (
    label.includes("إجمالي الفاتورة") ||
    label.includes("إجمالي فاتورة العمولة") ||
    label.includes("صافي المستحق") ||
    label.includes("صافي الفاتورة الضريبية") ||
    label.includes("رسوم مدفوعات المحافظ")
  );
}

function severityFor(amount: number, category: ExceptionCategory): ExceptionSeverity {
  if (category === "branch_match" && amount === 0) return "high";
  if (amount >= 5_000) return "critical";
  if (amount >= 1_000) return "high";
  if (amount >= 100) return "medium";
  return "low";
}

function recoveryFor(
  category: ExceptionCategory,
  computed: number,
  invoiced: number,
  evidence?: CheckEvidence,
): number {
  if (evidence === "invoice_only" || evidence === "mixed" || evidence === "invoice_derived") {
    return 0;
  }

  if (
    category === "commission" ||
    category === "payment_fee" ||
    category === "other_fee" ||
    category === "delivery_campaign" ||
    category === "campaign" ||
    category === "advertising" ||
    category === "pos_fee"
  ) {
    return Math.max(0, invoiced - computed);
  }

  if (category === "collections" || category === "settlement") {
    return Math.max(0, computed - invoiced);
  }

  return 0;
}

function workflowFor(period: StoredPeriod, id: string): ExceptionWorkflowEntry | undefined {
  return period.invoice?.exceptionWorkflow?.[id];
}

function makeException(
  period: StoredPeriod,
  input: {
    sourceLevel: "summary" | "branch";
    branch?: string;
    branchId?: string;
    category: ExceptionCategory;
    label: string;
    computed?: number;
    invoiced?: number;
    tolerance?: number;
    evidence?: CheckEvidence;
    rollup?: boolean;
    hint?: string;
    forceReviewAmount?: number;
  },
): AuditException {
  const computed = input.computed;
  const invoiced = input.invoiced;
  const difference =
    computed !== undefined && invoiced !== undefined ? invoiced - computed : undefined;
  const tolerance = input.tolerance ?? 1;
  const reviewAmount =
    input.forceReviewAmount ??
    (difference !== undefined ? Math.abs(difference) : Math.abs(invoiced ?? computed ?? 0));
  const id = exceptionId(
    period.id,
    input.sourceLevel,
    input.category,
    input.label,
    input.branchId,
  );
  const workflow = workflowFor(period, id);

  return {
    id,
    periodId: period.id,
    periodLabel: period.label,
    platform: period.platform,
    periodStart: period.period_start,
    periodEnd: period.period_end,
    sourceLevel: input.sourceLevel,
    branch: input.branch,
    branchId: input.branchId,
    category: input.category,
    categoryLabel: CATEGORY_LABELS[input.category],
    label: input.label,
    computed,
    invoiced,
    difference,
    tolerance,
    reviewAmount,
    potentialRecovery:
      computed !== undefined && invoiced !== undefined
        ? recoveryFor(input.category, computed, invoiced, input.evidence)
        : 0,
    evidence: input.evidence,
    severity: severityFor(reviewAmount, input.category),
    status: workflow?.status ?? "new",
    note: workflow?.note,
    recoveredAmount: workflow?.recoveredAmount ?? 0,
    rollup: input.rollup ?? false,
    hint: input.hint,
  };
}

function summaryExceptions(period: StoredPeriod): AuditException[] {
  const result: AuditException[] = [];

  for (const check of period.invoice?.checks ?? []) {
    const tolerance = check.tolerance ?? 1;
    const difference = check.invoiced - check.computed;
    const invoiceOnly =
      check.evidence === "invoice_only" || check.label.includes("فاتورة فقط");
    if (!invoiceOnly && Math.abs(difference) <= tolerance) continue;
    if (invoiceOnly && Math.abs(check.invoiced) <= 0.005) continue;

    const category = categoryForLabel(check.label, check.evidence);
    result.push(
      makeException(period, {
        sourceLevel: "summary",
        category,
        label: check.label,
        computed: check.computed,
        invoiced: check.invoiced,
        tolerance,
        evidence: check.evidence,
        rollup: isRollupLabel(check.label),
        hint: check.hint,
        forceReviewAmount: invoiceOnly ? Math.abs(check.invoiced) : undefined,
      }),
    );
  }

  return result;
}

function pushBranchVariance(
  result: AuditException[],
  period: StoredPeriod,
  input: {
    branch: string;
    branchId: string;
    category: ExceptionCategory;
    label: string;
    computed?: number;
    invoiced?: number;
    tolerance: number;
    rollup?: boolean;
    hint?: string;
  },
) {
  if (input.computed === undefined || input.invoiced === undefined) return;
  if (Math.abs(input.invoiced - input.computed) <= input.tolerance) return;

  result.push(
    makeException(period, {
      sourceLevel: "branch",
      branch: input.branch,
      branchId: input.branchId,
      category: input.category,
      label: input.label,
      computed: input.computed,
      invoiced: input.invoiced,
      tolerance: input.tolerance,
      evidence: "data",
      rollup: input.rollup,
      hint: input.hint,
    }),
  );
}

function hungerBranchExceptions(period: StoredPeriod): AuditException[] {
  const result: AuditException[] = [];

  for (const branch of period.branches ?? []) {
    const paymentComputed =
      branch.bankFeeSuccess + branch.bankFeeRefunded + (branch.walletFee ?? 0);
    const otherComputed =
      branch.rdfCampaigns + branch.compensation + branch.jokerFees + branch.waitingTimeFees;
    const otherInvoiced =
      branch.invoiceOtherCharges !== undefined
        ? branch.invoiceOtherCharges - (branch.invoiceOnlyBranchCharges ?? 0)
        : undefined;

    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "commission",
      label: "فرق عمولة الفرع",
      computed: branch.commission,
      invoiced: branch.invoiceCommission,
      tolerance: 0.05,
    });
    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "payment_fee",
      label: "فرق رسوم الدفع للفرع",
      computed: paymentComputed,
      invoiced: branch.invoicePaymentFees,
      tolerance: 0.1,
    });
    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "other_fee",
      label: "فرق الرسوم الأخرى للفرع",
      computed: otherComputed,
      invoiced: otherInvoiced,
      tolerance: 0.1,
    });
    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "collections",
      label: "فرق تحصيلات الفرع",
      computed: branch.totalCollections,
      invoiced: branch.invoiceCollections,
      tolerance: 0.05,
    });
    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "sales",
      label: "فرق مبيعات الائتمان للفرع",
      computed: branch.creditSales,
      invoiced: branch.invoiceCreditSales,
      tolerance: 0.05,
    });

    if ((branch.invoiceOnlyBranchCharges ?? 0) > 0.005) {
      result.push(
        makeException(period, {
          sourceLevel: "branch",
          branch: branch.branch,
          branchId: branch.branchId,
          category: "unsupported_charge",
          label: "بنود فرع موجودة في الفاتورة فقط",
          computed: 0,
          invoiced: branch.invoiceOnlyBranchCharges,
          tolerance: 0,
          evidence: "invoice_only",
          forceReviewAmount: Math.abs(branch.invoiceOnlyBranchCharges ?? 0),
          hint: branch.branchAuditNote,
        }),
      );
    }

    if (
      (branch.branchAuditStatus === "warning" ||
        branch.branchAuditStatus === "unmatched" ||
        branch.branchAuditStatus === "invoice_only") &&
      !result.some(
        (item) =>
          item.branchId === branch.branchId &&
          item.sourceLevel === "branch" &&
          item.periodId === period.id,
      )
    ) {
      result.push(
        makeException(period, {
          sourceLevel: "branch",
          branch: branch.branch,
          branchId: branch.branchId,
          category: "branch_match",
          label:
            branch.branchAuditStatus === "invoice_only"
              ? "فرع موجود في الفاتورة فقط"
              : "مشكلة في مطابقة الفرع",
          tolerance: 0,
          evidence: "data",
          hint: branch.branchAuditNote,
          forceReviewAmount: Math.abs(branch.invoiceOnlyBranchCharges ?? 0),
        }),
      );
    }
  }

  return result;
}

function keetaBranchExceptions(period: StoredPeriod): AuditException[] {
  const result: AuditException[] = [];

  for (const branch of period.branches ?? []) {
    const vatFactor = 1.15;

    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "commission",
      label: "فرق عمولة الطلب للفرع",
      computed:
        branch.keetaPdfOrderCommissionInclVat !== undefined &&
        branch.keetaPdfOrderCommissionVariance !== undefined
          ? branch.keetaPdfOrderCommissionInclVat + branch.keetaPdfOrderCommissionVariance
          : (branch.keetaCommissionExVat ?? 0) * vatFactor,
      invoiced: branch.keetaPdfOrderCommissionInclVat,
      tolerance: 0.06,
    });
    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "payment_fee",
      label: "فرق الرسوم المصرفية للفرع",
      computed:
        branch.keetaPdfBankCommissionInclVat !== undefined &&
        branch.keetaPdfBankCommissionVariance !== undefined
          ? branch.keetaPdfBankCommissionInclVat + branch.keetaPdfBankCommissionVariance
          : (branch.keetaBankFeesExVat ?? 0) * vatFactor,
      invoiced: branch.keetaPdfBankCommissionInclVat,
      tolerance: 0.06,
    });
    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "delivery_campaign",
      label: "فرق دعم توصيل كيتا للفرع",
      computed:
        branch.keetaPdfDeliveryCommissionInclVat !== undefined &&
        branch.keetaPdfDeliveryCommissionVariance !== undefined
          ? branch.keetaPdfDeliveryCommissionInclVat + branch.keetaPdfDeliveryCommissionVariance
          : (branch.keetaDeliveryCampaignExVat ?? 0) * vatFactor,
      invoiced: branch.keetaPdfDeliveryCommissionInclVat,
      tolerance: 0.06,
    });
    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "invoice_total",
      label: "فرق فاتورة عمولة الفرع",
      computed: branch.keetaCommissionInvoiceInclVat,
      invoiced: branch.keetaPdfCommissionInvoiceInclVat,
      tolerance: 0.06,
      rollup: true,
    });
    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "sales",
      label: "فرق البيع الآجل للفرع",
      computed: branch.keetaCreditSales,
      invoiced: branch.keetaPdfCreditSales,
      tolerance: 0.06,
    });
    pushBranchVariance(result, period, {
      branch: branch.branch,
      branchId: branch.branchId,
      category: "settlement",
      label: "فرق صافي مستحق الفرع",
      computed: branch.netSales,
      invoiced: branch.keetaPdfNetDue,
      tolerance: 0.06,
      rollup: true,
    });

    if (
      (branch.branchAuditStatus === "warning" ||
        branch.branchAuditStatus === "unmatched" ||
        branch.branchAuditStatus === "invoice_only") &&
      !result.some(
        (item) =>
          item.branchId === branch.branchId &&
          item.sourceLevel === "branch" &&
          item.periodId === period.id,
      )
    ) {
      result.push(
        makeException(period, {
          sourceLevel: "branch",
          branch: branch.branch,
          branchId: branch.branchId,
          category: "branch_match",
          label:
            branch.branchAuditStatus === "invoice_only"
              ? "فرع موجود في PDF فقط"
              : "مشكلة في مطابقة Store ID",
          tolerance: 0,
          evidence: "data",
          hint: branch.branchAuditNote,
          forceReviewAmount: 0,
        }),
      );
    }
  }

  return result;
}

export function buildPeriodExceptions(period: StoredPeriod): AuditException[] {
  const summary = summaryExceptions(period);
  const branch =
    period.platform === "hungerstation"
      ? hungerBranchExceptions(period)
      : keetaBranchExceptions(period);

  // When a discrepancy is already localized to one or more branches, suppress the
  // duplicate non-rollup summary exception for the same category. Rollup controls
  // remain visible as diagnostics but never inflate financial impact.
  const branchCategories = new Set(
    branch.filter((item) => !item.rollup).map((item) => item.category),
  );
  const result = [
    ...summary.filter((item) => item.rollup || !branchCategories.has(item.category)),
    ...branch,
  ];

  return result.sort((left, right) => {
    const rank: Record<ExceptionSeverity, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    return rank[right.severity] - rank[left.severity] || right.reviewAmount - left.reviewAmount;
  });
}

export function buildAllExceptions(periods: StoredPeriod[]): AuditException[] {
  return periods.flatMap(buildPeriodExceptions).sort((left, right) => {
    const dateCompare = (right.periodEnd ?? "").localeCompare(left.periodEnd ?? "");
    return dateCompare || right.reviewAmount - left.reviewAmount;
  });
}

function financialLeaves(exceptions: AuditException[]): AuditException[] {
  const usable = exceptions.filter((item) => !item.rollup && item.reviewAmount > 0);
  const groups = new Map<string, AuditException[]>();

  for (const item of usable) {
    const key = `${item.periodId}|${item.category}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const leaves: AuditException[] = [];
  for (const group of groups.values()) {
    const branchItems = group.filter((item) => item.sourceLevel === "branch");
    if (branchItems.length) leaves.push(...branchItems);
    else leaves.push(...group.filter((item) => item.sourceLevel === "summary"));
  }
  return leaves;
}

export interface ExceptionSummary {
  total: number;
  openCount: number;
  criticalCount: number;
  underReview: number;
  potentialRecovery: number;
  recovered: number;
}

export function summarizeExceptions(exceptions: AuditException[]): ExceptionSummary {
  const open = exceptions.filter(
    (item) => item.status !== "closed" && item.status !== "recovered",
  );
  const leaves = financialLeaves(exceptions);
  const openLeaves = leaves.filter(
    (item) => item.status !== "closed" && item.status !== "recovered",
  );

  return {
    total: exceptions.length,
    openCount: open.length,
    criticalCount: open.filter((item) => item.severity === "critical").length,
    underReview: openLeaves.reduce((sum, item) => sum + item.reviewAmount, 0),
    potentialRecovery: openLeaves.reduce((sum, item) => sum + item.potentialRecovery, 0),
    recovered: exceptions.reduce((sum, item) => sum + item.recoveredAmount, 0),
  };
}
