import {
  buildPeriodExceptions,
  summarizeExceptions,
  type AuditException,
  type ExceptionSummary,
} from "./exceptions";
import type { BranchRow } from "./analysis/types";
import type { StoredPeriod } from "./periods";

export type ComparisonUnit = "sar" | "count" | "ratio";

export interface MetricComparison {
  key: string;
  label: string;
  unit: ComparisonUnit;
  current: number;
  previous: number;
  delta: number;
  relativeChange: number | null;
  percentagePointChange?: number;
}

export interface ExceptionCategoryMovement {
  category: string;
  currentCount: number;
  previousCount: number;
  countDelta: number;
  currentReviewAmount: number;
  previousReviewAmount: number;
  reviewAmountDelta: number;
  currentPotentialRecovery: number;
  previousPotentialRecovery: number;
  potentialRecoveryDelta: number;
}

export interface BranchPeriodSnapshot {
  orders: number;
  grossSales: number;
  netSales: number;
  platformCost: number;
  platformCostRate: number;
  commissionPct: number;
}

export interface BranchMovement {
  branch: string;
  status: "existing" | "new" | "removed";
  current: BranchPeriodSnapshot | null;
  previous: BranchPeriodSnapshot | null;
  ordersDelta: number;
  grossSalesDelta: number;
  platformCostDelta: number;
  platformCostRateDelta: number;
  commissionPctDelta: number;
}

export interface PeriodComparison {
  platform: StoredPeriod["platform"];
  currentPeriod: {
    start: string;
    end: string;
    days: number;
  };
  previousPeriod: {
    start: string;
    end: string;
    days: number;
  };
  comparableDuration: boolean;
  metrics: MetricComparison[];
  platformMetrics: MetricComparison[];
  exceptions: {
    current: ExceptionSummary;
    previous: ExceptionSummary;
    openCountDelta: number;
    underReviewDelta: number;
    potentialRecoveryDelta: number;
    recoveredDelta: number;
  };
  exceptionCategories: ExceptionCategoryMovement[];
  branchMovements: BranchMovement[];
  warnings: string[];
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function inclusiveDays(start: string, end: string): number {
  const startMs = Date.parse(start + "T00:00:00Z");
  const endMs = Date.parse(end + "T00:00:00Z");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new Error("تعذّر مقارنة الفترتين بسبب تواريخ غير صالحة.");
  }
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function relativeChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return (current - previous) / Math.abs(previous);
}

function metric(
  key: string,
  label: string,
  unit: ComparisonUnit,
  current: number,
  previous: number,
): MetricComparison {
  const delta = current - previous;
  return {
    key,
    label,
    unit,
    current,
    previous,
    delta,
    relativeChange: relativeChange(current, previous),
    ...(unit === "ratio" ? { percentagePointChange: delta * 100 } : {}),
  };
}

function platformCostRate(totalCharges: number, grossSales: number): number {
  return grossSales > 0 ? totalCharges / grossSales : 0;
}

function branchPlatformCost(period: StoredPeriod, branch: BranchRow): number {
  if (period.platform === "keeta") {
    return branch.keetaTotalCostExVat ?? branch.totalCharges;
  }
  return branch.totalCharges;
}

function branchSnapshot(period: StoredPeriod, branch: BranchRow): BranchPeriodSnapshot {
  const platformCost = branchPlatformCost(period, branch);
  return {
    orders: branch.orders,
    grossSales: branch.grossSales,
    netSales: branch.netSales,
    platformCost,
    platformCostRate: platformCostRate(platformCost, branch.grossSales),
    commissionPct: branch.commissionPct,
  };
}

function normalizedBranchName(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function branchMatches(left: BranchRow, right: BranchRow): boolean {
  const leftId = left.branchId?.trim();
  const rightId = right.branchId?.trim();
  if (leftId && rightId && leftId === rightId) return true;
  return normalizedBranchName(left.branch) === normalizedBranchName(right.branch);
}

function buildBranchMovements(
  current: StoredPeriod,
  previous: StoredPeriod,
): BranchMovement[] {
  const previousBranches = [...(previous.branches ?? [])];
  const usedPrevious = new Set<number>();
  const movements: BranchMovement[] = [];

  for (const currentBranch of current.branches ?? []) {
    const matchIndex = previousBranches.findIndex(
      (candidate, index) => !usedPrevious.has(index) && branchMatches(currentBranch, candidate),
    );
    const previousBranch = matchIndex >= 0 ? previousBranches[matchIndex] : undefined;
    if (matchIndex >= 0) usedPrevious.add(matchIndex);

    const currentSnapshot = branchSnapshot(current, currentBranch);
    const previousSnapshot = previousBranch ? branchSnapshot(previous, previousBranch) : null;

    movements.push({
      branch: currentBranch.branch,
      status: previousSnapshot ? "existing" : "new",
      current: currentSnapshot,
      previous: previousSnapshot,
      ordersDelta: currentSnapshot.orders - (previousSnapshot?.orders ?? 0),
      grossSalesDelta: currentSnapshot.grossSales - (previousSnapshot?.grossSales ?? 0),
      platformCostDelta: currentSnapshot.platformCost - (previousSnapshot?.platformCost ?? 0),
      platformCostRateDelta:
        currentSnapshot.platformCostRate - (previousSnapshot?.platformCostRate ?? 0),
      commissionPctDelta: currentSnapshot.commissionPct - (previousSnapshot?.commissionPct ?? 0),
    });
  }

  previousBranches.forEach((previousBranch, index) => {
    if (usedPrevious.has(index)) return;
    const previousSnapshot = branchSnapshot(previous, previousBranch);
    movements.push({
      branch: previousBranch.branch,
      status: "removed",
      current: null,
      previous: previousSnapshot,
      ordersDelta: -previousSnapshot.orders,
      grossSalesDelta: -previousSnapshot.grossSales,
      platformCostDelta: -previousSnapshot.platformCost,
      platformCostRateDelta: -previousSnapshot.platformCostRate,
      commissionPctDelta: -previousSnapshot.commissionPct,
    });
  });

  return movements.sort(
    (left, right) =>
      Math.abs(right.platformCostDelta) - Math.abs(left.platformCostDelta) ||
      Math.abs(right.grossSalesDelta) - Math.abs(left.grossSalesDelta),
  );
}

function aggregateExceptionCategories(exceptions: AuditException[]) {
  const open = exceptions.filter(
    (item) => item.status !== "closed" && item.status !== "recovered",
  );
  const map = new Map<
    string,
    { count: number; reviewAmount: number; potentialRecovery: number }
  >();

  for (const item of open) {
    const current = map.get(item.categoryLabel) ?? {
      count: 0,
      reviewAmount: 0,
      potentialRecovery: 0,
    };
    current.count += 1;
    current.reviewAmount += item.reviewAmount;
    current.potentialRecovery += item.potentialRecovery;
    map.set(item.categoryLabel, current);
  }
  return map;
}

function buildCategoryMovements(
  currentExceptions: AuditException[],
  previousExceptions: AuditException[],
): ExceptionCategoryMovement[] {
  const current = aggregateExceptionCategories(currentExceptions);
  const previous = aggregateExceptionCategories(previousExceptions);
  const categories = new Set([...current.keys(), ...previous.keys()]);

  return [...categories]
    .map((category) => {
      const now = current.get(category) ?? {
        count: 0,
        reviewAmount: 0,
        potentialRecovery: 0,
      };
      const before = previous.get(category) ?? {
        count: 0,
        reviewAmount: 0,
        potentialRecovery: 0,
      };
      return {
        category,
        currentCount: now.count,
        previousCount: before.count,
        countDelta: now.count - before.count,
        currentReviewAmount: now.reviewAmount,
        previousReviewAmount: before.reviewAmount,
        reviewAmountDelta: now.reviewAmount - before.reviewAmount,
        currentPotentialRecovery: now.potentialRecovery,
        previousPotentialRecovery: before.potentialRecovery,
        potentialRecoveryDelta: now.potentialRecovery - before.potentialRecovery,
      };
    })
    .sort(
      (left, right) =>
        Math.abs(right.reviewAmountDelta) - Math.abs(left.reviewAmountDelta) ||
        Math.abs(right.potentialRecoveryDelta) - Math.abs(left.potentialRecoveryDelta) ||
        Math.abs(right.countDelta) - Math.abs(left.countDelta),
    );
}

function optionalMetric(
  key: string,
  label: string,
  unit: ComparisonUnit,
  current: number | undefined,
  previous: number | undefined,
): MetricComparison | null {
  if (
    current === undefined ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return null;
  }
  return metric(key, label, unit, current, previous);
}

function buildPlatformMetrics(
  current: StoredPeriod,
  previous: StoredPeriod,
): MetricComparison[] {
  const c = current.summary;
  const p = previous.summary;

  if (current.platform === "hungerstation") {
    return [
      optionalMetric(
        "collections",
        "إجمالي التحصيلات المحتسب",
        "sar",
        c.totalCollections,
        p.totalCollections,
      ),
      optionalMetric(
        "compensation",
        "تعويضات العملاء",
        "sar",
        c.compensation,
        p.compensation,
      ),
      optionalMetric(
        "payment_fee_rate",
        "نسبة رسوم الدفع",
        "ratio",
        c.bankRate,
        p.bankRate,
      ),
    ].filter((item): item is MetricComparison => item !== null);
  }

  if (current.platform === "keeta") {
    return [
      optionalMetric(
        "keeta_platform_cost_rate",
        "نسبة تكلفة كيتا من المبيعات بدون الضريبة",
        "ratio",
        c.keetaPlatformCostPct,
        p.keetaPlatformCostPct,
      ),
      optionalMetric(
        "keeta_settlement_variance",
        "فرق التسوية",
        "sar",
        c.keetaExcelPayableVariance ?? c.keetaSettlementVariance,
        p.keetaExcelPayableVariance ?? p.keetaSettlementVariance,
      ),
      optionalMetric(
        "keeta_bank_fees",
        "رسوم البنك بدون الضريبة",
        "sar",
        c.keetaBankFeesExVat,
        p.keetaBankFeesExVat,
      ),
    ].filter((item): item is MetricComparison => item !== null);
  }

  return [
    optionalMetric(
      "jahez_settlement_variance",
      "فرق صافي المطعم",
      "sar",
      c.jahezSettlementVariance,
      p.jahezSettlementVariance,
    ),
    optionalMetric(
      "jahez_compensation_net",
      "صافي أثر التعويضات",
      "sar",
      c.jahezCompensationNetImpact,
      p.jahezCompensationNetImpact,
    ),
    optionalMetric(
      "jahez_duplicate_compensation",
      "مبلغ التعويضات المكررة المشتبه بها",
      "sar",
      c.jahezCompensationDuplicateAmount,
      p.jahezCompensationDuplicateAmount,
    ),
  ].filter((item): item is MetricComparison => item !== null);
}

export function findPreviousComparablePeriod(
  current: StoredPeriod,
  periods: StoredPeriod[],
): StoredPeriod | null {
  const currentStart = dateOnly(current.period_start);
  if (!currentStart) return null;

  return (
    periods
      .filter((candidate) => {
        if (candidate.id === current.id || candidate.platform !== current.platform) return false;
        const candidateEnd = dateOnly(candidate.period_end);
        return Boolean(candidateEnd && candidateEnd < currentStart);
      })
      .sort((left, right) => {
        const endCompare = (right.period_end ?? "").localeCompare(left.period_end ?? "");
        if (endCompare !== 0) return endCompare;
        return right.created_at.localeCompare(left.created_at);
      })[0] ?? null
  );
}

export function buildPeriodComparison(
  current: StoredPeriod,
  previous: StoredPeriod,
): PeriodComparison {
  if (current.platform !== previous.platform) {
    throw new Error("لا يمكن مقارنة فترتين من منصتين مختلفتين.");
  }

  const currentStart = dateOnly(current.period_start);
  const currentEnd = dateOnly(current.period_end);
  const previousStart = dateOnly(previous.period_start);
  const previousEnd = dateOnly(previous.period_end);

  if (!currentStart || !currentEnd || !previousStart || !previousEnd) {
    throw new Error("تحتاج مقارنة الفترات إلى تاريخ بداية ونهاية لكل فترة.");
  }
  if (previousEnd >= currentStart) {
    throw new Error("الفترة المرجعية يجب أن تنتهي قبل بداية الفترة الحالية.");
  }

  const currentDays = inclusiveDays(currentStart, currentEnd);
  const previousDays = inclusiveDays(previousStart, previousEnd);
  const currentExceptions = buildPeriodExceptions(current);
  const previousExceptions = buildPeriodExceptions(previous);
  const currentExceptionSummary = summarizeExceptions(currentExceptions);
  const previousExceptionSummary = summarizeExceptions(previousExceptions);

  const metrics = [
    metric("orders", "الطلبات", "count", current.summary.orders, previous.summary.orders),
    metric(
      "gross_sales",
      "المبيعات الإجمالية",
      "sar",
      current.summary.grossSales,
      previous.summary.grossSales,
    ),
    metric(
      "net_sales",
      "صافي المبيعات / التسوية",
      "sar",
      current.summary.netSales,
      previous.summary.netSales,
    ),
    metric(
      "commission",
      "العمولة",
      "sar",
      current.summary.commission,
      previous.summary.commission,
    ),
    metric(
      "commission_rate",
      "نسبة العمولة",
      "ratio",
      current.summary.commissionPct,
      previous.summary.commissionPct,
    ),
    metric(
      "platform_cost",
      "إجمالي تكلفة المنصة",
      "sar",
      current.summary.totalCharges,
      previous.summary.totalCharges,
    ),
    metric(
      "platform_cost_rate",
      "تكلفة المنصة كنسبة من المبيعات الإجمالية",
      "ratio",
      platformCostRate(current.summary.totalCharges, current.summary.grossSales),
      platformCostRate(previous.summary.totalCharges, previous.summary.grossSales),
    ),
  ];

  const warnings: string[] = [];
  if (currentDays !== previousDays) {
    warnings.push(
      "طول الفترتين مختلف؛ قارن النسب والمتوسطات بحذر قبل تفسير تغير القيم المطلقة.",
    );
  }
  if ((current.branches?.length ?? 0) !== (previous.branches?.length ?? 0)) {
    warnings.push(
      "عدد الفروع يختلف بين الفترتين؛ جزء من التغير الإجمالي قد يكون ناتجاً عن تغير التغطية.",
    );
  }

  return {
    platform: current.platform,
    currentPeriod: {
      start: currentStart,
      end: currentEnd,
      days: currentDays,
    },
    previousPeriod: {
      start: previousStart,
      end: previousEnd,
      days: previousDays,
    },
    comparableDuration: currentDays === previousDays,
    metrics,
    platformMetrics: buildPlatformMetrics(current, previous),
    exceptions: {
      current: currentExceptionSummary,
      previous: previousExceptionSummary,
      openCountDelta: currentExceptionSummary.openCount - previousExceptionSummary.openCount,
      underReviewDelta:
        currentExceptionSummary.underReview - previousExceptionSummary.underReview,
      potentialRecoveryDelta:
        currentExceptionSummary.potentialRecovery - previousExceptionSummary.potentialRecovery,
      recoveredDelta: currentExceptionSummary.recovered - previousExceptionSummary.recovered,
    },
    exceptionCategories: buildCategoryMovements(currentExceptions, previousExceptions),
    branchMovements: buildBranchMovements(current, previous),
    warnings,
  };
}
