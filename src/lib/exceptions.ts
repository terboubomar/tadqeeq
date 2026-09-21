import { normalizeCheckMetadata } from "./analysis/check-metadata";
import type { CheckCategory, CheckEvidence, CheckRow } from "./analysis/types";
import type { StoredPeriod } from "./periods";

export type ExceptionStatus =
  | "new"
  | "reviewing"
  | "contacted"
  | "disputed"
  | "recovered"
  | "closed";

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";

export type ExceptionCategory = CheckCategory | "branch_match" | "data_missing";

export interface ExceptionWorkflowEvent {
  at: string;
  status: ExceptionStatus;
  note?: string;
  recoveredAmount?: number;
}

export interface ExceptionWorkflowEntry {
  status: ExceptionStatus;
  note?: string;
  recoveredAmount?: number;
  updatedAt?: string;
  history?: ExceptionWorkflowEvent[];
}

export interface EvidenceField {
  label: string;
  source: string;
  value?: number | string;
}

export interface ExceptionEvidenceTrail {
  reason: string;
  formula: string;
  evidenceLabel: string;
  calculatedSources: EvidenceField[];
  platformSources: EvidenceField[];
  conclusion: string;
  workflow: ExceptionWorkflowEvent[];
}

export interface AuditException {
  id: string;
  code: string;
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
  compensation: "التعويضات",
  tax: "الضريبة",
  invoice_total: "إجمالي الفاتورة",
  unsupported_charge: "بند غير مدعوم",
  branch_match: "مطابقة الفرع",
  data_missing: "بيانات مفقودة",
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

export function stableExceptionId(
  periodId: string,
  level: "summary" | "branch",
  code: string,
  branchId?: string,
): string {
  return `ex_${hashString([periodId, level, code, branchId ?? ""].join("|"))}`;
}

/** Legacy label-based ID used only by the one-off workflow migration/fallback. */
export function legacyExceptionId(
  periodId: string,
  level: "summary" | "branch",
  category: ExceptionCategory,
  label: string,
  branchId?: string,
): string {
  return `ex_${hashString([periodId, level, category, branchId ?? "", label].join("|"))}`;
}

function isIndependentEvidence(evidence: CheckEvidence | undefined): boolean {
  return evidence === undefined || evidence === "data" || evidence === "contract";
}

function toleranceFor(check: CheckRow): number {
  if (typeof check.tolerance === "number") return check.tolerance;
  return check.evidence === "contract" ? 0.1 : 0.05;
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
  if (!isIndependentEvidence(evidence)) return 0;

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

function workflowFor(
  period: StoredPeriod,
  id: string,
  legacyId?: string,
): ExceptionWorkflowEntry | undefined {
  return (
    period.invoice?.exceptionWorkflow?.[id] ??
    (legacyId ? period.invoice?.exceptionWorkflow?.[legacyId] : undefined)
  );
}

function makeException(
  period: StoredPeriod,
  input: {
    code: string;
    sourceLevel: "summary" | "branch";
    branch?: string;
    branchId?: string;
    category: ExceptionCategory;
    label: string;
    computed?: number;
    invoiced?: number;
    tolerance?: number;
    evidence?: CheckEvidence;
    hint?: string;
    forceReviewAmount?: number;
    forcePotentialRecovery?: number;
  },
): AuditException {
  const computed = input.computed;
  const invoiced = input.invoiced;
  const difference =
    computed !== undefined && invoiced !== undefined ? invoiced - computed : undefined;
  const tolerance = input.tolerance ?? 0.05;
  const reviewAmount =
    input.forceReviewAmount ??
    (difference !== undefined ? Math.abs(difference) : Math.abs(invoiced ?? computed ?? 0));
  const id = stableExceptionId(
    period.id,
    input.sourceLevel,
    input.code,
    input.branchId,
  );
  const legacyId = legacyExceptionId(
    period.id,
    input.sourceLevel,
    input.category,
    input.label,
    input.branchId,
  );
  const workflow = workflowFor(period, id, legacyId);

  return {
    id,
    code: input.code,
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
      input.forcePotentialRecovery ??
      (computed !== undefined && invoiced !== undefined
        ? recoveryFor(input.category, computed, invoiced, input.evidence)
        : 0),
    evidence: input.evidence,
    severity: severityFor(reviewAmount, input.category),
    status: workflow?.status ?? "new",
    note: workflow?.note,
    recoveredAmount: workflow?.recoveredAmount ?? 0,
    rollup: false,
    hint: input.hint,
  };
}

function summaryExceptions(period: StoredPeriod): AuditException[] {
  const result: AuditException[] = [];
  const checks = normalizeCheckMetadata(
    period.platform,
    period.branches ?? [],
    period.invoice?.checks ?? [],
  );

  for (const check of checks) {
    // Exception Center consumes explicit machine metadata only. Display labels
    // never decide category, identity, branch coverage, or filtering.
    if (!isIndependentEvidence(check.evidence)) continue;
    if (check.invoiceOnly || check.controlOnly || check.coveredByBranches) continue;

    const tolerance = toleranceFor(check);
    if (check.invoiced === undefined) {
      result.push(
        makeException(period, {
          code: check.code,
          sourceLevel: "summary",
          category: "data_missing",
          label: "بيانات فاتورة مفقودة · " + check.label,
          computed: check.computed,
          invoiced: undefined,
          tolerance,
          evidence: check.evidence,
          hint:
            "لم تُقرأ قيمة المقارنة من الفاتورة أو المستند الرسمي لهذا البند؛ لا يمكن اعتباره فرقاً مالياً حتى يتوفر المصدر.",
          forceReviewAmount: 0,
          forcePotentialRecovery: 0,
        }),
      );
      continue;
    }

    const difference = check.invoiced - check.computed;
    if (!Number.isFinite(difference) || Math.abs(difference) <= tolerance) continue;

    result.push(
      makeException(period, {
        code: check.code,
        sourceLevel: "summary",
        category: check.category,
        label: check.label,
        computed: check.computed,
        invoiced: check.invoiced,
        tolerance,
        evidence: check.evidence,
        hint: check.hint,
      }),
    );
  }

  return result;
}

function pushBranchVariance(
  result: AuditException[],
  period: StoredPeriod,
  input: {
    code: string;
    branch: string;
    branchId: string;
    category: ExceptionCategory;
    label: string;
    computed?: number;
    invoiced?: number;
    tolerance: number;
    hint?: string;
  },
) {
  if (input.computed === undefined || input.invoiced === undefined) return;
  const difference = input.invoiced - input.computed;
  if (!Number.isFinite(difference) || Math.abs(difference) <= input.tolerance) return;

  result.push(
    makeException(period, {
      code: input.code,
      sourceLevel: "branch",
      branch: input.branch,
      branchId: input.branchId,
      category: input.category,
      label: input.label,
      computed: input.computed,
      invoiced: input.invoiced,
      tolerance: input.tolerance,
      evidence: "data",
      hint: input.hint,
    }),
  );
}

function branchAlreadyHasException(
  result: AuditException[],
  periodId: string,
  branchId: string,
): boolean {
  return result.some(
    (item) =>
      item.periodId === periodId &&
      item.sourceLevel === "branch" &&
      item.branchId === branchId,
  );
}

function hungerInvoiceHasOperationalActivity(branch: StoredPeriod["branches"][number]): boolean {
  const dataRelatedOtherCharges =
    (branch.invoiceOtherCharges ?? 0) - (branch.invoiceOnlyBranchCharges ?? 0);

  return [
    branch.invoiceCommission,
    branch.invoicePaymentFees,
    branch.invoiceCollections,
    branch.invoiceCreditSales,
    dataRelatedOtherCharges,
  ].some(
    (value) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      Math.abs(value) > 0.05,
  );
}

function hungerBranchExceptions(period: StoredPeriod): AuditException[] {
  const result: AuditException[] = [];

  for (const branch of period.branches ?? []) {
    const paymentComputed = branch.bankFeeSuccess + branch.bankFeeRefunded;
    const invoiceCardPaymentFees =
      branch.invoiceCardPaymentFees ??
      (branch.invoicePaymentFees !== undefined
        ? branch.invoicePaymentFees - (branch.invoiceWalletFee ?? 0)
        : undefined);
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
      label: "فرق رسوم الدفع بالبطاقات للفرع",
      computed: paymentComputed,
      invoiced: invoiceCardPaymentFees,
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

    // invoiceOnlyBranchCharges means "not independently verifiable", not
    // "incorrect". Keep those charges in Invoice Check unless the branch matcher
    // itself says the branch is missing/unmatched.
    if (
      (branch.branchAuditStatus === "warning" ||
        branch.branchAuditStatus === "unmatched" ||
        branch.branchAuditStatus === "invoice_only") &&
      (branch.branchAuditStatus !== "invoice_only" ||
        hungerInvoiceHasOperationalActivity(branch)) &&
      !branchAlreadyHasException(result, period.id, branch.branchId)
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
          forceReviewAmount: 0,
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
    const hasPdfEvidence =
      branch.keetaPdfOrderCommissionInclVat !== undefined ||
      branch.keetaPdfBankCommissionInclVat !== undefined ||
      branch.keetaPdfDeliveryCommissionInclVat !== undefined ||
      branch.keetaPdfCreditSales !== undefined ||
      branch.keetaPdfNetDue !== undefined;

    if (hasPdfEvidence) {
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
      });
    } else {
      const excelPayableVariance =
        branch.keetaExcelPayable !== undefined
          ? branch.keetaExcelPayable - branch.netSales
          : undefined;
      pushBranchVariance(result, period, {
        branch: branch.branch,
        branchId: branch.branchId,
        category: "settlement",
        label: "فرق Payable للفرع",
        computed: branch.netSales,
        invoiced: branch.keetaExcelPayable,
        tolerance: 0.02,
      });

      // Invoice amount and Payable usually express the same financial mismatch in
      // opposite directions. Only open a second Invoice amount case when Payable
      // itself is already clean, avoiding double-counting the same exposure.
      if (
        excelPayableVariance === undefined ||
        Math.abs(excelPayableVariance) <= 0.02
      ) {
        pushBranchVariance(result, period, {
          branch: branch.branch,
          branchId: branch.branchId,
          category: "invoice_total",
          label: "فرق Invoice amount للفرع",
          computed:
            (branch.keetaCommissionInvoiceInclVat ?? 0) +
            (branch.keetaMerchantAdExVat ?? 0) * vatFactor,
          invoiced: branch.keetaExcelInvoiceAmount,
          tolerance: 0.02,
        });
      }
    }

    if (
      (branch.branchAuditStatus === "warning" ||
        branch.branchAuditStatus === "unmatched" ||
        branch.branchAuditStatus === "invoice_only") &&
      !branchAlreadyHasException(result, period.id, branch.branchId)
    ) {
      const source =
        branch.keetaPdfNetDue !== undefined
          ? "PDF"
          : branch.keetaExcelPayable !== undefined
            ? "Invoice Details"
            : "مصادر كيتا";
      result.push(
        makeException(period, {
          sourceLevel: "branch",
          branch: branch.branch,
          branchId: branch.branchId,
          category: "branch_match",
          label:
            branch.branchAuditStatus === "invoice_only"
              ? "فرع موجود في " + source + " فقط"
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

function jahezCompensationExceptions(period: StoredPeriod): AuditException[] {
  const result: AuditException[] = [];
  const compensation = period.invoice?.jahezCompensation;
  if (!compensation) return result;

  const debitDifference = compensation.summaryDebit - compensation.detailDebit;
  if (Math.abs(debitDifference) > 0.01) {
    result.push(
      makeException(period, {
        sourceLevel: "summary",
        category: "compensation",
        label: "عدم اتساق إجمالي خصم التعويضات",
        computed: compensation.detailDebit,
        invoiced: compensation.summaryDebit,
        evidence: "data",
        tolerance: 0.01,
        hint: "مجموع معاملات debit في تفاصيل ملف التعويضات لا يساوي إجمالي الخصم في رأس الملف.",
      }),
    );
  }

  const creditDifference = compensation.summaryCredit - compensation.detailCredit;
  if (Math.abs(creditDifference) > 0.01) {
    result.push(
      makeException(period, {
        sourceLevel: "summary",
        category: "compensation",
        label: "عدم اتساق إجمالي إضافة التعويضات",
        computed: compensation.detailCredit,
        invoiced: compensation.summaryCredit,
        evidence: "data",
        tolerance: 0.01,
        hint: "مجموع معاملات credit في تفاصيل ملف التعويضات لا يساوي إجمالي الإضافة في رأس الملف.",
      }),
    );
  }

  for (const transaction of compensation.transactions) {
    const branchId = "jahez-comp:" + transaction.orderId + ":" + transaction.sequence;
    const source = transaction.matchedPeriodLabel
      ? "الفترة " + transaction.matchedPeriodLabel
      : transaction.match === "current"
        ? "الفترة الحالية"
        : "لا يوجد طلب مصدر متاح";

    if (transaction.duplicateCandidate) {
      result.push(
        makeException(period, {
          sourceLevel: "branch",
          branch: transaction.branch,
          branchId,
          category: "compensation",
          label: "اشتباه تكرار تعويض · طلب " + transaction.orderId,
          evidence: "data",
          tolerance: 0,
          forceReviewAmount: transaction.amount,
          forcePotentialRecovery:
            transaction.transactionType === "debit" ? transaction.amount : 0,
          hint:
            "وجد Tadqeeq معاملة تعويض إضافية مطابقة تماماً لمعاملة سابقة لنفس الطلب والمبلغ والوقت والسبب. هذه إشارة مراجعة وليست إثباتاً نهائياً على الخصم المكرر.",
        }),
      );
    }

    if (transaction.match === "unknown") {
      result.push(
        makeException(period, {
          sourceLevel: "branch",
          branch: transaction.branch,
          branchId: branchId + ":unknown",
          category: "compensation",
          label: "تعويض بدون طلب مصدر متاح · طلب " + transaction.orderId,
          evidence: "data",
          tolerance: 0,
          forceReviewAmount: transaction.amount,
          hint:
            "معاملة التعويض موجودة في تقرير جاهز، لكن رقم الطلب غير موجود في فهرس الطلبات المتاح للفترة الحالية أو الفترات السابقة المحفوظة. يحتاج مراجعة المصدر قبل الاعتراض.",
        }),
      );
    }

    if (transaction.branchMismatch) {
      result.push(
        makeException(period, {
          sourceLevel: "branch",
          branch: transaction.branch,
          branchId: branchId + ":branch",
          category: "compensation",
          label: "عدم تطابق فرع التعويض · طلب " + transaction.orderId,
          evidence: "data",
          tolerance: 0,
          forceReviewAmount: transaction.amount,
          hint:
            "فرع التعويض لا يطابق فرع الطلب المصدر. الطلب مطابق في " +
            source +
            (transaction.matchedBranch ? " تحت فرع " + transaction.matchedBranch + "." : "."),
        }),
      );
    }
  }

  return result;
}

export function buildPeriodExceptions(period: StoredPeriod): AuditException[] {
  const result = [
    ...summaryExceptions(period),
    ...(period.platform === "hungerstation"
      ? hungerBranchExceptions(period)
      : period.platform === "keeta"
        ? keetaBranchExceptions(period)
        : jahezCompensationExceptions(period)),
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

  return {
    total: exceptions.length,
    openCount: open.length,
    criticalCount: open.filter((item) => item.severity === "critical").length,
    underReview: open.reduce((sum, item) => sum + item.reviewAmount, 0),
    potentialRecovery: open.reduce((sum, item) => sum + item.potentialRecovery, 0),
    recovered: exceptions.reduce((sum, item) => sum + item.recoveredAmount, 0),
  };
}


const EVIDENCE_LABELS: Record<CheckEvidence, string> = {
  data: "بيانات مستقلة",
  contract: "بيانات + شروط العقد",
  invoice_derived: "مشتق من الفاتورة",
  invoice_only: "من الفاتورة فقط",
  mixed: "مصادر مختلطة",
};

function definedField(
  label: string,
  source: string,
  value: number | string | null | undefined,
): EvidenceField | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return { label, source, value };
}

function compactFields(fields: Array<EvidenceField | null>): EvidenceField[] {
  return fields.filter((field): field is EvidenceField => field !== null);
}

function workflowTimeline(period: StoredPeriod, item: AuditException): ExceptionWorkflowEvent[] {
  const workflow = period.invoice?.exceptionWorkflow?.[item.id];
  if (!workflow) return [];

  if (workflow.history?.length) return workflow.history;
  if (!workflow.updatedAt) return [];

  return [
    {
      at: workflow.updatedAt,
      status: workflow.status,
      note: workflow.note,
      recoveredAmount: workflow.recoveredAmount,
    },
  ];
}

function genericReason(item: AuditException): string {
  if (item.category === "data_missing") {
    return (
      item.hint ??
      "قيمة المقارنة الرسمية غير متاحة، لذلك لا يمكن تنفيذ مطابقة مالية لهذا البند."
    );
  }
  if (item.category === "branch_match") {
    return item.hint ?? "تعذّرت مطابقة الفرع بشكل موثوق بين مصدر البيانات ومستند المنصة.";
  }
  return (
    item.hint ??
    "القيمة المعاد احتسابها من المصدر المستقل تختلف عن القيمة الواردة من المنصة بأكثر من هامش التقريب المسموح."
  );
}

function conclusionFor(item: AuditException): string {
  if (item.category === "data_missing") {
    return "البيانات الرسمية لهذا البند مفقودة. لا يوجد فرق مالي أو مبلغ استرداد محسوب حتى يتم توفير المصدر.";
  }
  if (item.category === "branch_match") return genericReason(item);
  const difference = Math.abs(item.difference ?? 0);
  const base =
    "الفرق " +
    difference.toFixed(2) +
    " ر.س يتجاوز هامش المطابقة " +
    item.tolerance.toFixed(2) +
    " ر.س.";
  if (item.potentialRecovery > 0) {
    return (
      base +
      " اتجاه الفرق يشير إلى مبلغ محتمل للاسترداد قدره " +
      item.potentialRecovery.toFixed(2) +
      " ر.س، ويحتاج اعتماداً بشرياً قبل المطالبة."
    );
  }
  return base + " يحتاج مراجعة مصدرية قبل اتخاذ أي إجراء مالي.";
}

export function buildExceptionEvidence(
  period: StoredPeriod,
  item: AuditException,
): ExceptionEvidenceTrail {
  const branch =
    period.branches?.find(
      (row) =>
        (item.branchId && row.branchId === item.branchId) ||
        (!item.branchId && item.branch && row.branch === item.branch),
    ) ?? null;

  let formula = "القيمة المحتسبة من المصدر المستقل مقابل القيمة الواردة من المنصة";
  let calculatedSources: EvidenceField[] = compactFields([
    definedField("القيمة المحتسبة", "محرك تدقيق", item.computed),
  ]);
  let platformSources: EvidenceField[] = compactFields([
    definedField("قيمة المنصة", "الفاتورة / ملف المنصة", item.invoiced),
  ]);

  if (item.sourceLevel === "summary") {
    if (period.platform === "keeta" && item.label.includes("صافي التسوية")) {
      formula = "إجمالي البيع الآجل - فاتورة العمولة شامل الضريبة = صافي التسوية";
      calculatedSources = compactFields([
        definedField("إجمالي البيع الآجل", "Keeta Order Summary", period.summary.keetaCreditSales),
        definedField(
          "فاتورة العمولة شامل الضريبة",
          "Keeta Order Summary",
          period.summary.keetaCommissionInvoiceInclVat,
        ),
        definedField("صافي التسوية المحتسب", "محرك تدقيق", item.computed),
      ]);
      platformSources = compactFields([
        definedField("Payable to merchant", "Keeta Order Summary", item.invoiced),
      ]);
    } else if (period.platform === "jahez") {
      if (item.category === "commission") {
        formula = "Jahez Commission من ملخص CSV ÷ 1.15 = عمولة الفاتورة بدون الضريبة";
        calculatedSources = compactFields([
          definedField(
            "عمولة جاهز شامل الضريبة",
            "Jahez CSV · Merchant Summary",
            period.summary.jahezCommissionInclVat,
          ),
          definedField(
            "عمولة الفاتورة المحتسبة بدون الضريبة",
            "محرك تدقيق",
            item.computed,
          ),
        ]);
        platformSources = compactFields([
          definedField(
            "Commission",
            "Jahez PDF · Tax Invoice",
            period.invoice?.jahezCommissionExVat,
          ),
        ]);
      } else if (item.category === "payment_fee") {
        formula = "Payment Fees في ملخص CSV = Payment Fees في الفاتورة بدون الضريبة";
        calculatedSources = compactFields([
          definedField(
            "Payment Fees",
            "Jahez CSV · Merchant Summary",
            period.summary.jahezPaymentFeesExVat,
          ),
        ]);
        platformSources = compactFields([
          definedField(
            "Payment Fees",
            "Jahez PDF · Tax Invoice",
            period.invoice?.jahezPaymentFeesExVat,
          ),
        ]);
      } else if (item.category === "delivery_campaign") {
        formula =
          "لكل Delivery Offer: سعر الوحدة شامل الضريبة ÷ 1.15 ثم تقريب هللتين × عدد الطلبات";
        const tiers = period.summary.jahezDeliveryOfferTiers
          ? Object.entries(period.summary.jahezDeliveryOfferTiers)
              .map(([amount, quantity]) => amount + " × " + quantity)
              .join("، ")
          : undefined;
        calculatedSources = compactFields([
          definedField("Delivery Offer tiers", "Jahez CSV · Orders", tiers),
          definedField(
            "عروض التوصيل المحتسبة بدون الضريبة",
            "محرك تدقيق",
            period.summary.jahezDeliveryOfferInvoiceExVat,
          ),
        ]);
        platformSources = compactFields([
          definedField(
            "Delivery Offer",
            "Jahez PDF · Tax Invoice",
            period.invoice?.jahezDeliveryOfferExVat,
          ),
        ]);
      } else {
        const check = period.invoice?.checks?.find((candidate) => candidate.label === item.label);
        formula = check?.hint ?? formula;
      }
    } else {
      const check = period.invoice?.checks?.find((candidate) => candidate.label === item.label);
      formula = check?.hint ?? formula;
    }
  } else if (branch && period.platform === "hungerstation") {
    if (item.category === "commission") {
      formula = "مجموع عمولة الطلبات القابلة للفوترة والمرفوضة";
      calculatedSources = compactFields([
        definedField("الأساس الخاضع للعمولة", "HungerStation Excel · Commissionable GMV", branch.netSales),
        definedField("العمولة المحتسبة", "HungerStation Excel · Commission", branch.commission),
      ]);
      platformSources = compactFields([
        definedField("عمولة الفرع", "HungerStation PDF · Sales Commission", branch.invoiceCommission),
      ]);
    } else if (item.category === "payment_fee") {
      formula =
        "رسوم البطاقات الناجحة + رسوم البطاقات المرتجعة = رسوم البطاقات القابلة للتحقق؛ Wallet Payments Fee يُستبعد من المقارنة المستقلة";
      calculatedSources = compactFields([
        definedField("أساس البطاقات الناجحة", "HungerStation Excel · CC Amount", branch.ccSuccess),
        definedField("رسوم البطاقات الناجحة", "محرك تدقيق", branch.bankFeeSuccess),
        definedField("أساس البطاقات المرتجعة", "HungerStation Excel · Refunded CC", branch.ccRejected),
        definedField("رسوم البطاقات المرتجعة", "محرك تدقيق", branch.bankFeeRefunded),
        definedField("إجمالي رسوم البطاقات المحتسب", "محرك تدقيق", item.computed),
      ]);
      platformSources = compactFields([
        definedField(
          "إجمالي Payment Fees",
          "HungerStation PDF · Payment Fees",
          branch.invoicePaymentFees,
        ),
        definedField(
          "Wallet Payments Fee المستبعد",
          "HungerStation PDF · Wallet Payments Fee",
          branch.invoiceWalletFee,
        ),
        definedField(
          "رسوم البطاقات للمقارنة",
          "محرك تدقيق · Payment Fees ناقص Wallet Payments Fee",
          branch.invoiceCardPaymentFees,
        ),
      ]);
    } else if (item.category === "other_fee") {
      formula = "RDF + تعويضات العملاء + رسوم العروض + وقت الانتظار";
      calculatedSources = compactFields([
        definedField("RDF", "HungerStation Excel", branch.rdfCampaigns),
        definedField("تعويضات العملاء", "HungerStation Excel", branch.compensation),
        definedField("رسوم العروض", "HungerStation Excel", branch.jokerFees),
        definedField("وقت الانتظار", "HungerStation Excel", branch.waitingTimeFees),
        definedField("إجمالي الرسوم القابلة للتحقق", "محرك تدقيق", item.computed),
      ]);
      platformSources = compactFields([
        definedField("عمولات أخرى", "HungerStation PDF · Other Commission", branch.invoiceOtherCharges),
        definedField(
          "بنود من الفاتورة فقط",
          "HungerStation PDF · غير قابلة للتحقق من Excel",
          branch.invoiceOnlyBranchCharges,
        ),
        definedField("المقارن بعد الاستبعاد", "محرك تدقيق", item.invoiced),
      ]);
    } else if (item.category === "collections") {
      formula =
        "صافي البطاقات + محافظ العملاء + محافظ المندوبين + صافي الخصومات التسويقية + الاعتراضات المعتمدة";
      calculatedSources = compactFields([
        definedField("صافي البطاقات", "HungerStation Excel", branch.netBankCards),
        definedField("محافظ العملاء", "HungerStation Excel", branch.walletAmount),
        definedField("محافظ المندوبين", "HungerStation Excel", branch.riderWallet),
        definedField("صافي الخصومات التسويقية", "HungerStation Excel", branch.netMarketingDiscount),
        definedField("اعتراضات معتمدة", "HungerStation Excel", branch.approvedRefunds),
        definedField("إجمالي التحصيلات المحتسب", "محرك تدقيق", branch.totalCollections),
      ]);
      platformSources = compactFields([
        definedField("تحصيلات الفرع", "HungerStation PDF · Total Collections", branch.invoiceCollections),
      ]);
    } else if (item.category === "sales") {
      formula = "Commissionable GMV للطلبات القابلة للفوترة، بدون ضريبة القيمة المضافة";
      calculatedSources = compactFields([
        definedField("عدد الطلبات", "HungerStation Excel", branch.orders),
        definedField("مبيعات الائتمان المحتسبة", "HungerStation Excel · Commissionable GMV", branch.creditSales),
      ]);
      platformSources = compactFields([
        definedField("مبيعات الائتمان", "HungerStation PDF · Sales Summary", branch.invoiceCreditSales),
      ]);
    } else if (item.category === "branch_match") {
      formula =
        "تطبيع اسم الفرع العربي ثم مطابقة الاسم الكامل أولاً، وبعدها احتواء فريد فقط؛ لا تُستخدم المبالغ المالية في تحديد هوية الفرع";
      calculatedSources = compactFields([
        definedField("اسم الفرع", "HungerStation Excel", branch.branch),
      ]);
      platformSources = compactFields([
        definedField("اسم الفرع في الفاتورة", "HungerStation PDF", branch.invoiceBranchName),
        definedField("حالة المطابقة", "محرك تدقيق", branch.branchAuditLabel),
      ]);
    }
  } else if (branch && period.platform === "keeta") {
    if (item.category === "commission") {
      formula = "عمولة الطلب بدون الضريبة × 1.15 = عمولة الطلب شامل الضريبة";
      calculatedSources = compactFields([
        definedField("عمولة الطلب بدون الضريبة", "Keeta Order Summary", branch.keetaCommissionExVat),
        definedField("عمولة الطلب شامل الضريبة", "محرك تدقيق", item.computed),
      ]);
      platformSources = compactFields([
        definedField("Order commission", "Keeta PDF · Branch Invoice Details", branch.keetaPdfOrderCommissionInclVat),
      ]);
    } else if (item.category === "payment_fee") {
      formula = "رسوم البنك بدون الضريبة × 1.15 = الرسوم المصرفية شامل الضريبة";
      calculatedSources = compactFields([
        definedField("رسوم البنك بدون الضريبة", "Keeta Order Summary", branch.keetaBankFeesExVat),
        definedField("رسوم البنك شامل الضريبة", "محرك تدقيق", item.computed),
      ]);
      platformSources = compactFields([
        definedField("Bank commission", "Keeta PDF · Branch Invoice Details", branch.keetaPdfBankCommissionInclVat),
      ]);
    } else if (item.category === "delivery_campaign") {
      formula = "دعم توصيل كيتا بدون الضريبة × 1.15 = Other commission شامل الضريبة";
      calculatedSources = compactFields([
        definedField("دعم توصيل كيتا بدون الضريبة", "Keeta Order Summary", branch.keetaDeliveryCampaignExVat),
        definedField("المحتسب شامل الضريبة", "محرك تدقيق", item.computed),
      ]);
      platformSources = compactFields([
        definedField("Other commission", "Keeta PDF · Branch Invoice Details", branch.keetaPdfDeliveryCommissionInclVat),
      ]);
    } else if (item.category === "sales") {
      formula = "إجمالي مكونات Credit Sales من Order Summary";
      calculatedSources = compactFields([
        definedField("Credit Sales المحتسب", "Keeta Order Summary", branch.keetaCreditSales),
      ]);
      platformSources = compactFields([
        definedField("Total credit sales", "Keeta PDF · Branch Credit Sales", branch.keetaPdfCreditSales),
      ]);
    } else if (item.category === "invoice_total") {
      formula =
        "فاتورة العمولة شامل الضريبة + Merchant ad spend شامل الضريبة = Invoice amount";
      calculatedSources = compactFields([
        definedField(
          "فاتورة العمولة شامل الضريبة",
          "Keeta Order Summary",
          branch.keetaCommissionInvoiceInclVat,
        ),
        definedField(
          "Merchant ad spend شامل الضريبة",
          "Keeta Order Summary",
          (branch.keetaMerchantAdExVat ?? 0) * 1.15,
        ),
        definedField("Invoice amount المحتسب", "محرك تدقيق", item.computed),
      ]);
      platformSources = compactFields([
        definedField(
          "Invoice amount",
          "Keeta Excel · Invoice Details",
          branch.keetaExcelInvoiceAmount,
        ),
      ]);
    } else if (item.category === "settlement") {
      formula = "Credit Sales - فاتورة العمولة شامل الضريبة = Payable / Net Due";
      calculatedSources = compactFields([
        definedField("Credit Sales", "Keeta Order Summary", branch.keetaCreditSales),
        definedField(
          "فاتورة العمولة شامل الضريبة",
          "Keeta Order Summary",
          branch.keetaCommissionInvoiceInclVat,
        ),
        definedField("صافي المستحق المحتسب", "محرك تدقيق", branch.netSales),
      ]);
      platformSources = compactFields([
        definedField(
          branch.keetaPdfNetDue !== undefined ? "Net due invoice" : "Payable to Restaurant",
          branch.keetaPdfNetDue !== undefined
            ? "Keeta PDF · Branch Credit Sales"
            : "Keeta Excel · Invoice Details",
          branch.keetaPdfNetDue ?? branch.keetaExcelPayable,
        ),
      ]);
    } else if (item.category === "branch_match") {
      formula = "مطابقة مباشرة بواسطة Store ID / Restaurant ID";
      calculatedSources = compactFields([
        definedField("Store ID", "Keeta Order Summary", branch.branchId),
        definedField("اسم المتجر", "Keeta Order Summary", branch.branch),
      ]);
      platformSources = compactFields([
        definedField(
          "حالة المطابقة",
          branch.keetaPdfNetDue !== undefined
            ? "Keeta PDF"
            : branch.keetaExcelPayable !== undefined
              ? "Keeta Excel · Invoice Details"
              : "محرك تدقيق",
          branch.branchAuditLabel,
        ),
      ]);
    }
  } else if (period.platform === "jahez" && item.category === "compensation") {
    const orderId = item.label.match(/طلب\s+(\d+)/)?.[1];
    const transaction = period.invoice?.jahezCompensation?.transactions.find(
      (row) =>
        row.orderId === orderId &&
        (item.branch ? row.branch === item.branch : true) &&
        (item.label.includes("تكرار") ? row.duplicateCandidate : true),
    );
    if (transaction) {
      formula = "معاملة تعويض جاهز تُراجع مقابل الطلب المصدر وحالة المطابقة والتكرار";
      calculatedSources = compactFields([
        definedField("رقم الطلب", "Jahez Compensation Report", transaction.orderId),
        definedField("نوع الحركة", "Jahez Compensation Report", transaction.transactionType),
        definedField("السبب", "Jahez Compensation Report", transaction.reason),
        definedField("المبلغ", "Jahez Compensation Report", transaction.amount),
        definedField("تاريخ الإنشاء", "Jahez Compensation Report", transaction.creationDate),
      ]);
      platformSources = compactFields([
        definedField(
          "مطابقة الطلب",
          transaction.match === "current"
            ? "Jahez Restaurant Financial Report · الفترة الحالية"
            : transaction.match === "historical"
              ? "Jahez Restaurant Financial Report · فترة سابقة"
              : "فهرس طلبات Jahez",
          transaction.match === "current"
            ? "مطابق"
            : transaction.match === "historical"
              ? "مطابق عبر فترة سابقة" +
                (transaction.matchedPeriodLabel ? " · " + transaction.matchedPeriodLabel : "")
              : "غير موجود",
        ),
        definedField("فرع الطلب المصدر", "فهرس طلبات Jahez", transaction.matchedBranch),
        definedField(
          "تكرار مطابق",
          "محرك تدقيق",
          transaction.duplicateCandidate ? "نعم — معاملة إضافية مطابقة" : "لا",
        ),
      ]);
    }
  }

  return {
    reason: genericReason(item),
    formula,
    evidenceLabel: item.evidence ? EVIDENCE_LABELS[item.evidence] : "بيانات مستقلة",
    calculatedSources,
    platformSources,
    conclusion: conclusionFor(item),
    workflow: workflowTimeline(period, item),
  };
}
