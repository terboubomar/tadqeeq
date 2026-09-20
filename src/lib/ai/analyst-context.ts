import {
  buildExceptionEvidence,
  buildPeriodExceptions,
  summarizeExceptions,
  type AuditException,
} from "@/lib/exceptions";
import {
  buildPeriodComparison,
  findPreviousComparablePeriod,
  type PeriodComparison,
} from "@/lib/period-intelligence";
import type { BranchRow } from "@/lib/analysis/types";
import type { StoredPeriod } from "@/lib/periods";

export type AnalystFactKind =
  | "period"
  | "branch"
  | "ranking"
  | "exception"
  | "evidence"
  | "comparison"
  | "warning";

export interface AnalystFact {
  id: string;
  kind: AnalystFactKind;
  label: string;
  displayValue: string;
  data: Record<string, string | number | boolean | null | Array<unknown>>;
}

export interface AnalystContext {
  platform: StoredPeriod["platform"];
  period: {
    start: string | null;
    end: string | null;
  };
  hasPreviousPeriod: boolean;
  facts: AnalystFact[];
  coverage: {
    branchCount: number;
    openExceptionCount: number;
    exceptionDetailsIncluded: number;
    evidenceTrailsIncluded: number;
    comparisonIncluded: boolean;
  };
}

const MAX_EXCEPTION_DETAILS = 30;
const MAX_EVIDENCE_TRAILS = 12;
const MAX_COMPARISON_BRANCHES = 12;
const MAX_COMPARISON_CATEGORIES = 10;

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function money(value: number): string {
  return value.toFixed(2) + " ر.س";
}

function pct(ratio: number): string {
  return (ratio * 100).toFixed(2) + "%";
}

function pp(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + Math.abs(value).toFixed(2) + " نقطة مئوية";
}

function signedMoney(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + money(Math.abs(value));
}

function signedPct(value: number | null): string {
  if (value === null) return "غير متاح";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + (Math.abs(value) * 100).toFixed(2) + "%";
}

function branchPlatformCost(period: StoredPeriod, branch: BranchRow): number {
  return period.platform === "keeta"
    ? (branch.keetaTotalCostExVat ?? branch.totalCharges)
    : branch.totalCharges;
}

function branchPlatformCostRate(period: StoredPeriod, branch: BranchRow): number {
  const cost = branchPlatformCost(period, branch);
  return branch.grossSales > 0 ? cost / branch.grossSales : 0;
}

class FactBuilder {
  private nextId = 1;
  readonly facts: AnalystFact[] = [];

  add(
    kind: AnalystFactKind,
    label: string,
    displayValue: string,
    data: AnalystFact["data"],
  ): AnalystFact {
    const fact: AnalystFact = {
      id: "F" + String(this.nextId++).padStart(3, "0"),
      kind,
      label,
      displayValue,
      data,
    };
    this.facts.push(fact);
    return fact;
  }
}

function addPeriodFacts(builder: FactBuilder, period: StoredPeriod, exceptions: AuditException[]) {
  const s = period.summary;
  const platformCostRate = s.grossSales > 0 ? s.totalCharges / s.grossSales : 0;
  const exceptionSummary = summarizeExceptions(exceptions);

  builder.add("period", "عدد الطلبات", String(s.orders), {
    value: s.orders,
    unit: "count",
  });
  builder.add("period", "عدد الفروع", String(s.branchCount), {
    value: s.branchCount,
    unit: "count",
  });
  builder.add("period", "المبيعات الإجمالية", money(s.grossSales), {
    value: s.grossSales,
    unit: "sar",
  });
  builder.add("period", "صافي المبيعات / التسوية", money(s.netSales), {
    value: s.netSales,
    unit: "sar",
  });
  builder.add("period", "إجمالي العمولة", money(s.commission), {
    value: s.commission,
    unit: "sar",
  });
  builder.add("period", "نسبة العمولة", pct(s.commissionPct), {
    valuePct: s.commissionPct * 100,
    unit: "percent",
  });
  builder.add("period", "إجمالي تكلفة المنصة", money(s.totalCharges), {
    value: s.totalCharges,
    unit: "sar",
  });
  builder.add("period", "تكلفة المنصة كنسبة من المبيعات", pct(platformCostRate), {
    valuePct: platformCostRate * 100,
    unit: "percent",
  });

  builder.add("period", "الاستثناءات المفتوحة", String(exceptionSummary.openCount), {
    value: exceptionSummary.openCount,
    unit: "count",
    criticalCount: exceptionSummary.criticalCount,
  });
  builder.add("period", "المبلغ محل المراجعة", money(exceptionSummary.underReview), {
    value: exceptionSummary.underReview,
    unit: "sar",
  });
  builder.add("period", "الاسترداد المحتمل", money(exceptionSummary.potentialRecovery), {
    value: exceptionSummary.potentialRecovery,
    unit: "sar",
    status: "potential_not_confirmed",
  });
  builder.add("period", "المبالغ المستردة المسجلة", money(exceptionSummary.recovered), {
    value: exceptionSummary.recovered,
    unit: "sar",
  });

  if (period.platform === "hungerstation") {
    const paymentFees =
      (s.bankFeeSuccess ?? 0) + (s.bankFeeRefunded ?? 0) + (s.walletFee ?? 0);
    builder.add("period", "رسوم الدفع المحتسبة", money(paymentFees), {
      value: paymentFees,
      unit: "sar",
    });
    if (finite(s.totalCollections) !== null) {
      builder.add("period", "إجمالي التحصيلات المحتسب", money(s.totalCollections ?? 0), {
        value: s.totalCollections ?? 0,
        unit: "sar",
      });
    }
    builder.add("period", "تعويضات العملاء", money(s.compensation), {
      value: s.compensation,
      unit: "sar",
    });
  } else if (period.platform === "keeta") {
    if (finite(s.keetaPlatformCostPct) !== null) {
      builder.add("period", "نسبة تكلفة منصة كيتا", pct(s.keetaPlatformCostPct ?? 0), {
        valuePct: (s.keetaPlatformCostPct ?? 0) * 100,
        unit: "percent",
      });
    }
    const settlement = finite(s.keetaExcelPayableVariance ?? s.keetaSettlementVariance);
    if (settlement !== null) {
      builder.add("period", "فرق تسوية كيتا", money(settlement), {
        value: settlement,
        unit: "sar",
      });
    }
    if (finite(s.keetaBankFeesExVat) !== null) {
      builder.add("period", "رسوم بنك كيتا بدون الضريبة", money(s.keetaBankFeesExVat ?? 0), {
        value: s.keetaBankFeesExVat ?? 0,
        unit: "sar",
      });
    }
  } else {
    if (finite(s.jahezSettlementVariance) !== null) {
      builder.add("period", "فرق صافي المطعم في جاهز", money(s.jahezSettlementVariance ?? 0), {
        value: s.jahezSettlementVariance ?? 0,
        unit: "sar",
      });
    }
    if (finite(s.jahezCompensationNetImpact) !== null) {
      builder.add("period", "صافي أثر تعويضات جاهز", money(s.jahezCompensationNetImpact ?? 0), {
        value: s.jahezCompensationNetImpact ?? 0,
        unit: "sar",
      });
    }
    if (finite(s.jahezCompensationDuplicateAmount) !== null) {
      builder.add(
        "period",
        "مبلغ التعويضات المكررة المشتبه بها",
        money(s.jahezCompensationDuplicateAmount ?? 0),
        {
          value: s.jahezCompensationDuplicateAmount ?? 0,
          unit: "sar",
          status: "suspected_not_confirmed",
        },
      );
    }
  }
}

function addBranchFacts(builder: FactBuilder, period: StoredPeriod) {
  const branches = period.branches ?? [];

  for (const branch of branches) {
    const platformCost = branchPlatformCost(period, branch);
    const platformCostRate = branchPlatformCostRate(period, branch);
    builder.add("branch", "مؤشرات فرع · " + branch.branch, money(branch.grossSales), {
      branch: branch.branch,
      orders: branch.orders,
      grossSales: branch.grossSales,
      netSales: branch.netSales,
      commission: branch.commission,
      commissionRatePct: branch.commissionPct * 100,
      platformCost,
      platformCostRatePct: platformCostRate * 100,
      ...(finite(branch.totalCollections) !== null
        ? { totalCollections: branch.totalCollections ?? 0 }
        : {}),
      ...(finite(branch.keetaSettlementVariance) !== null
        ? { settlementVariance: branch.keetaSettlementVariance ?? 0 }
        : {}),
      ...(finite(branch.keetaExcelPayableVariance) !== null
        ? { officialPayableVariance: branch.keetaExcelPayableVariance ?? 0 }
        : {}),
      ...(finite(branch.jahezSettlementVariance) !== null
        ? { settlementVariance: branch.jahezSettlementVariance ?? 0 }
        : {}),
      ...(finite(branch.jahezCompensationNetImpact) !== null
        ? { compensationNetImpact: branch.jahezCompensationNetImpact ?? 0 }
        : {}),
    });
  }

  function ranking(
    label: string,
    rows: BranchRow[],
    valueOf: (branch: BranchRow) => number,
    unit: "sar" | "percent" | "count",
  ) {
    const top = [...rows]
      .filter((branch) => Number.isFinite(valueOf(branch)))
      .sort((left, right) => valueOf(right) - valueOf(left))
      .slice(0, 5)
      .map((branch, index) => ({
        rank: index + 1,
        branch: branch.branch,
        value: valueOf(branch),
      }));

    if (!top.length) return;
    const display = top
      .map((row) => {
        const value =
          unit === "sar"
            ? money(row.value)
            : unit === "percent"
              ? (row.value * 100).toFixed(2) + "%"
              : String(row.value);
        return row.rank + ") " + row.branch + " — " + value;
      })
      .join(" · ");

    builder.add("ranking", label, display, {
      unit,
      ranking: top,
    });
  }

  ranking("أعلى الفروع بالمبيعات الإجمالية", branches, (branch) => branch.grossSales, "sar");
  ranking("أعلى الفروع بتكلفة المنصة", branches, (branch) => branchPlatformCost(period, branch), "sar");
  ranking(
    "أعلى الفروع بنسبة تكلفة المنصة",
    branches.filter((branch) => branch.grossSales > 0),
    (branch) => branchPlatformCostRate(period, branch),
    "percent",
  );
  ranking("أعلى الفروع بنسبة العمولة", branches, (branch) => branch.commissionPct, "percent");
  ranking("أعلى الفروع بعدد الطلبات", branches, (branch) => branch.orders, "count");
}

function addDailyFacts(builder: FactBuilder, period: StoredPeriod) {
  const daily = (period.daily ?? []).filter(
    (day) =>
      (!period.period_start || day.date >= period.period_start) &&
      (!period.period_end || day.date <= period.period_end),
  );
  if (!daily.length) return;

  const topSales = [...daily]
    .sort((a, b) => b.grossSales - a.grossSales)
    .slice(0, 5)
    .map((day, index) => ({
      rank: index + 1,
      date: day.date,
      grossSales: day.grossSales,
      orders: day.orders,
    }));
  const lowSales = [...daily]
    .sort((a, b) => a.grossSales - b.grossSales)
    .slice(0, 5)
    .map((day, index) => ({
      rank: index + 1,
      date: day.date,
      grossSales: day.grossSales,
      orders: day.orders,
    }));

  builder.add(
    "ranking",
    "أعلى أيام المبيعات",
    topSales.map((x) => x.date + " — " + money(x.grossSales)).join(" · "),
    { ranking: topSales, unit: "sar" },
  );
  builder.add(
    "ranking",
    "أقل أيام المبيعات",
    lowSales.map((x) => x.date + " — " + money(x.grossSales)).join(" · "),
    { ranking: lowSales, unit: "sar" },
  );
}

function addExceptionFacts(
  builder: FactBuilder,
  period: StoredPeriod,
  exceptions: AuditException[],
) {
  const open = exceptions.filter(
    (item) => item.status !== "closed" && item.status !== "recovered",
  );
  const included = open.slice(0, MAX_EXCEPTION_DETAILS);

  for (const item of included) {
    builder.add(
      "exception",
      item.label + (item.branch ? " · " + item.branch : ""),
      money(item.reviewAmount),
      {
        category: item.categoryLabel,
        label: item.label,
        branch: item.branch ?? null,
        severity: item.severity,
        status: item.status,
        computed: finite(item.computed),
        platformValue: finite(item.invoiced),
        difference: finite(item.difference),
        tolerance: item.tolerance,
        reviewAmount: item.reviewAmount,
        potentialRecovery: item.potentialRecovery,
        evidenceType: item.evidence ?? null,
        sourceLevel: item.sourceLevel,
      },
    );
  }

  for (const item of included.slice(0, MAX_EVIDENCE_TRAILS)) {
    const evidence = buildExceptionEvidence(period, item);
    builder.add(
      "evidence",
      "مسار الدليل · " + item.label + (item.branch ? " · " + item.branch : ""),
      evidence.conclusion,
      {
        exceptionLabel: item.label,
        branch: item.branch ?? null,
        reason: evidence.reason,
        formula: evidence.formula,
        evidenceLabel: evidence.evidenceLabel,
        calculatedSources: evidence.calculatedSources.map((field) => ({
          label: field.label,
          source: field.source,
          value: field.value ?? null,
        })),
        platformSources: evidence.platformSources.map((field) => ({
          label: field.label,
          source: field.source,
          value: field.value ?? null,
        })),
        conclusion: evidence.conclusion,
      },
    );
  }
}

function addComparisonFacts(builder: FactBuilder, comparison: PeriodComparison) {
  for (const item of [...comparison.metrics, ...comparison.platformMetrics]) {
    const isRatio = item.unit === "ratio";
    builder.add(
      "comparison",
      "مقارنة · " + item.label,
      isRatio
        ? pp(item.percentagePointChange ?? item.delta * 100)
        : item.unit === "sar"
          ? signedMoney(item.delta)
          : String(item.delta),
      {
        metric: item.label,
        unit: isRatio ? "percent" : item.unit,
        current: isRatio ? item.current * 100 : item.current,
        previous: isRatio ? item.previous * 100 : item.previous,
        delta: isRatio ? (item.percentagePointChange ?? item.delta * 100) : item.delta,
        deltaType: isRatio ? "percentage_points" : "absolute",
        relativeChangePct:
          item.relativeChange === null ? null : item.relativeChange * 100,
      },
    );
  }

  builder.add(
    "comparison",
    "مقارنة · الاستثناءات والمبالغ محل المراجعة",
    signedMoney(comparison.exceptions.underReviewDelta),
    {
      openCountCurrent: comparison.exceptions.current.openCount,
      openCountPrevious: comparison.exceptions.previous.openCount,
      openCountDelta: comparison.exceptions.openCountDelta,
      underReviewCurrent: comparison.exceptions.current.underReview,
      underReviewPrevious: comparison.exceptions.previous.underReview,
      underReviewDelta: comparison.exceptions.underReviewDelta,
      potentialRecoveryCurrent: comparison.exceptions.current.potentialRecovery,
      potentialRecoveryPrevious: comparison.exceptions.previous.potentialRecovery,
      potentialRecoveryDelta: comparison.exceptions.potentialRecoveryDelta,
      recoveredCurrent: comparison.exceptions.current.recovered,
      recoveredPrevious: comparison.exceptions.previous.recovered,
      recoveredDelta: comparison.exceptions.recoveredDelta,
    },
  );

  for (const branch of comparison.branchMovements.slice(0, MAX_COMPARISON_BRANCHES)) {
    builder.add(
      "comparison",
      "تحرك فرع · " + branch.branch,
      signedMoney(branch.platformCostDelta),
      {
        branch: branch.branch,
        status: branch.status,
        ordersDelta: branch.ordersDelta,
        grossSalesDelta: branch.grossSalesDelta,
        platformCostDelta: branch.platformCostDelta,
        platformCostRateDeltaPercentagePoints: branch.platformCostRateDelta * 100,
        commissionRateDeltaPercentagePoints: branch.commissionPctDelta * 100,
      },
    );
  }

  for (const category of comparison.exceptionCategories.slice(0, MAX_COMPARISON_CATEGORIES)) {
    builder.add(
      "comparison",
      "تحرك فئة استثناء · " + category.category,
      signedMoney(category.reviewAmountDelta),
      {
        category: category.category,
        countCurrent: category.currentCount,
        countPrevious: category.previousCount,
        countDelta: category.countDelta,
        reviewAmountCurrent: category.currentReviewAmount,
        reviewAmountPrevious: category.previousReviewAmount,
        reviewAmountDelta: category.reviewAmountDelta,
        potentialRecoveryCurrent: category.currentPotentialRecovery,
        potentialRecoveryPrevious: category.previousPotentialRecovery,
        potentialRecoveryDelta: category.potentialRecoveryDelta,
      },
    );
  }

  for (const warning of comparison.warnings) {
    builder.add("warning", "قيد على المقارنة", warning, { warning });
  }
}

export function buildAnalystContext(
  current: StoredPeriod,
  ownedPeriods: StoredPeriod[],
): AnalystContext {
  const builder = new FactBuilder();
  const exceptions = buildPeriodExceptions(current);
  const open = exceptions.filter(
    (item) => item.status !== "closed" && item.status !== "recovered",
  );

  addPeriodFacts(builder, current, exceptions);
  addBranchFacts(builder, current);
  addDailyFacts(builder, current);
  addExceptionFacts(builder, current, exceptions);

  const previous = findPreviousComparablePeriod(current, ownedPeriods);
  let comparisonIncluded = false;
  if (previous) {
    try {
      addComparisonFacts(builder, buildPeriodComparison(current, previous));
      comparisonIncluded = true;
    } catch {
      builder.add(
        "warning",
        "قيد على المقارنة",
        "توجد فترة سابقة لكن تعذّر إنشاء مقارنة موثوقة بسبب نطاق أو تواريخ البيانات.",
        { warning: "comparison_unavailable" },
      );
    }
  }

  return {
    platform: current.platform,
    period: {
      start: current.period_start,
      end: current.period_end,
    },
    hasPreviousPeriod: Boolean(previous),
    facts: builder.facts,
    coverage: {
      branchCount: current.branches?.length ?? 0,
      openExceptionCount: open.length,
      exceptionDetailsIncluded: Math.min(open.length, MAX_EXCEPTION_DETAILS),
      evidenceTrailsIncluded: Math.min(open.length, MAX_EVIDENCE_TRAILS),
      comparisonIncluded,
    },
  };
}

export function resolveAnalystFacts(
  context: AnalystContext,
  ids: string[],
): AnalystFact[] {
  const requested = new Set(ids);
  return context.facts.filter((fact) => requested.has(fact.id));
}
