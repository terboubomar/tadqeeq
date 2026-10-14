import {
  buildExceptionEvidence,
  buildPeriodExceptions,
  summarizeExceptions,
  type AuditException,
  isOpenException,
} from "@/lib/exceptions";
import {
  buildPeriodComparison,
  findPreviousComparablePeriod,
  type PeriodComparison,
} from "@/lib/period-intelligence";
import type { BranchRow } from "@/lib/analysis/types";
import { normalizeCheckMetadata } from "@/lib/analysis/check-metadata";
import type { StoredPeriod } from "@/lib/periods";
import { PLATFORM_COST_FORMULA_AR, platformCostPct, totalPlatformCharges } from "@/lib/reporting-metrics";

import { APP_KNOWLEDGE, normalizeAppRoute } from "./app-knowledge";

export type AnalystFactKind =
  | "period"
  | "branch"
  | "ranking"
  | "exception"
  | "evidence"
  | "comparison"
  | "invoice_check"
  | "daily"
  | "breakdown"
  | "status"
  | "history"
  | "app"
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
  currentRoute: string;
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
    invoiceChecksIncluded: number;
    dailyRowsIncluded: number;
    historyPeriodsIncluded: number;
    historyPeriodsAvailable: number;
    appKnowledgeItemsIncluded: number;
  };
}

const MAX_EXCEPTION_DETAILS = 30;
const MAX_EVIDENCE_TRAILS = 12;
const MAX_COMPARISON_BRANCHES = 12;
const MAX_COMPARISON_CATEGORIES = 10;
const MAX_DAILY_ROWS = 62;
const MAX_HISTORY_PERIODS = 24;

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

function safeExceptionLabel(value: string): string {
  return value.replace(/طلب\s+\d+/g, "طلب محجوب");
}

function safeEvidenceFields(
  fields: Array<{ label: string; source: string; value?: number | string }>,
) {
  return fields
    .filter(
      (field) =>
        !/\bID\b/i.test(field.label) &&
        !field.label.includes("رقم الطلب"),
    )
    .map((field) => ({
      label: field.label,
      source: field.source,
      value:
        field.label === "مطابقة الطلب" &&
        typeof field.value === "string" &&
        field.value.startsWith("مطابق عبر فترة سابقة")
          ? "مطابق عبر فترة سابقة"
          : (field.value ?? null),
    }));
}

function redactPrivateTokens(value: unknown, tokens: string[]): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const token of tokens) {
      if (token && token.length >= 3) result = result.split(token).join("[محجوب]");
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPrivateTokens(item, tokens));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        redactPrivateTokens(item, tokens),
      ]),
    );
  }
  return value;
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
  const platformCostRate = platformCostPct(totalPlatformCharges(period.platform, s), s.grossSales) ?? 0;
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
  builder.add("period", "نسبة تكلفة المنصة من إجمالي المبيعات", pct(platformCostRate), {
    valuePct: platformCostRate * 100,
    unit: "percent",
    formula: PLATFORM_COST_FORMULA_AR,
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
    const cardPaymentFees = (s.bankFeeSuccess ?? 0) + (s.bankFeeRefunded ?? 0);
    builder.add("period", "رسوم البطاقات المحتسبة", money(cardPaymentFees), {
      value: cardPaymentFees,
      unit: "sar",
      evidence: "deterministic",
    });
    if ((s.walletFee ?? 0) > 0) {
      builder.add("period", "رسوم المحافظ حسب الفاتورة", money(s.walletFee ?? 0), {
        value: s.walletFee ?? 0,
        unit: "sar",
        evidence: "invoice_derived",
        walletFeeBaseInvoice: s.walletFeeBase ?? 0,
      });
    }
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
      builder.add("period", "نسبة تكلفة كيتا من المبيعات بدون الضريبة", pct(s.keetaPlatformCostPct ?? 0), {
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
      ...(period.platform === "hungerstation"
        ? {
            ccSuccess: branch.ccSuccess,
            ccRejected: branch.ccRejected,
            bankFeeSuccess: branch.bankFeeSuccess,
            bankFeeRefunded: branch.bankFeeRefunded,
            walletAmount: branch.walletAmount,
            riderWallet: branch.riderWallet,
            walletFee: branch.walletFee ?? 0,
            rdfCampaigns: branch.rdfCampaigns,
            compensation: branch.compensation,
            jokerFees: branch.jokerFees,
            waitingTimeFees: branch.waitingTimeFees,
            rejectedSales: branch.rejectedSales ?? 0,
            totalCollections: branch.totalCollections ?? 0,
            invoiceCommission: branch.invoiceCommission ?? null,
            commissionVariance: branch.commissionVariance ?? null,
            invoiceCardPaymentFees: branch.invoiceCardPaymentFees ?? null,
            paymentFeeVariance: branch.paymentFeeVariance ?? null,
            collectionsVariance: branch.collectionsVariance ?? null,
            creditSalesVariance: branch.creditSalesVariance ?? null,
            branchAuditStatus: branch.branchAuditStatus ?? null,
          }
        : {}),
      ...(period.platform === "keeta"
        ? {
            salesExVat: branch.keetaSalesExVat ?? null,
            salesVat: branch.keetaSalesVat ?? null,
            bankFeesExVat: branch.keetaBankFeesExVat ?? null,
            deliveryCampaignExVat: branch.keetaDeliveryCampaignExVat ?? null,
            advertisingExVat: branch.keetaAdvertisingExVat ?? null,
            compensationExVat: branch.keetaCompensationExVat ?? null,
            otherExpensesExVat: branch.keetaOtherExpensesExVat ?? null,
            inputVat: branch.keetaInputVat ?? null,
            sourcePayable: branch.keetaSourcePayable ?? null,
            officialPayable: branch.keetaExcelPayable ?? null,
            officialPayableVariance: branch.keetaExcelPayableVariance ?? null,
          }
        : {}),
      ...(period.platform === "jahez"
        ? {
            commissionInclVat: branch.jahezCommissionInclVat ?? null,
            paymentFeesExVat: branch.jahezPaymentFeesExVat ?? null,
            paymentFeesVat: branch.jahezPaymentFeesVat ?? null,
            deliveryOfferInclVat: branch.jahezDeliveryOfferInclVat ?? null,
            deliveryCoupon: branch.jahezDeliveryCoupon ?? null,
            restaurantAmount: branch.jahezReportedRestaurantAmount ?? null,
            compensationDebit: branch.jahezCompensationDebit ?? null,
            compensationCredit: branch.jahezCompensationCredit ?? null,
            compensationNetImpact: branch.jahezCompensationNetImpact ?? null,
          }
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
    isOpenException,
  );
  const included = open.slice(0, MAX_EXCEPTION_DETAILS);

  for (const item of included) {
    builder.add(
      "exception",
      safeExceptionLabel(item.label) + (item.branch ? " · " + item.branch : ""),
      money(item.reviewAmount),
      {
        category: item.categoryLabel,
        label: safeExceptionLabel(item.label),
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
      "مسار الدليل · " + safeExceptionLabel(item.label) + (item.branch ? " · " + item.branch : ""),
      evidence.conclusion,
      {
        exceptionLabel: safeExceptionLabel(item.label),
        branch: item.branch ?? null,
        reason: evidence.reason,
        formula: evidence.formula,
        evidenceLabel: evidence.evidenceLabel,
        calculatedSources: safeEvidenceFields(evidence.calculatedSources),
        platformSources: safeEvidenceFields(evidence.platformSources),
        conclusion: evidence.conclusion,
      },
    );
  }
}


function addInvoiceCheckFacts(builder: FactBuilder, period: StoredPeriod) {
  const checks = normalizeCheckMetadata(
    period.platform,
    period.branches ?? [],
    period.invoice?.checks ?? [],
  );
  for (const check of checks) {
    const missing = check.invoiced === undefined;
    const difference = missing ? null : check.invoiced! - check.computed;
    const tolerance = check.tolerance ?? 1;
    builder.add(
      "invoice_check",
      "مطابقة فاتورة · " + check.label,
      missing ? "لم يُقرأ من الفاتورة" : money(difference ?? 0),
      {
        code: check.code,
        category: check.category,
        invoiceOnly: check.invoiceOnly ?? false,
        controlOnly: check.controlOnly ?? false,
        coveredByBranches: check.coveredByBranches ?? false,
        label: check.label,
        computed: check.computed,
        invoiced: check.invoiced ?? null,
        difference,
        tolerance,
        missing,
        withinTolerance:
          difference !== null ? Math.abs(difference) <= tolerance : null,
        evidence: check.evidence ?? "data",
        hint: check.hint ?? null,
      },
    );
  }
}

function addDailyDetailFacts(builder: FactBuilder, period: StoredPeriod) {
  const rows = (period.daily ?? [])
    .filter(
      (day) =>
        (!period.period_start || day.date >= period.period_start) &&
        (!period.period_end || day.date <= period.period_end),
    )
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, MAX_DAILY_ROWS);

  for (const day of rows) {
    builder.add("daily", "يوم · " + day.date, money(day.grossSales), {
      date: day.date,
      orders: day.orders,
      grossSales: day.grossSales,
      netSales: day.netSales,
      commission: day.commission,
      ccSuccess: day.ccSuccess,
      jahezCompensationDebit: day.jahezCompensationDebit ?? null,
      jahezCompensationCredit: day.jahezCompensationCredit ?? null,
      jahezCompensationNetImpact: day.jahezCompensationNetImpact ?? null,
    });
  }
}

function addBreakdownFacts(builder: FactBuilder, period: StoredPeriod) {
  const s = period.summary;
  const lines: Array<{ label: string; value: number; group: string }> = [];

  if (period.platform === "hungerstation") {
    lines.push(
      { label: "عمولة المبيعات", value: s.commission, group: "platform_cost" },
      { label: "رسوم البطاقات", value: s.bankFeeSuccess + s.bankFeeRefunded, group: "platform_cost" },
      { label: "رسوم المحافظ حسب الفاتورة", value: s.walletFee ?? 0, group: "platform_cost" },
      { label: "حملات التوصيل المجاني", value: s.rdfCampaigns, group: "platform_cost" },
      { label: "تعويضات العملاء", value: s.compensation, group: "platform_cost" },
      { label: "رسوم العروض السريعة", value: s.jokerFees, group: "platform_cost" },
      { label: "رسوم وقت الانتظار", value: s.waitingTimeFees, group: "platform_cost" },
      { label: "خصم المنصة على الأصناف", value: s.hsFoodDiscount, group: "discounts" },
      { label: "خصومات المكافآت", value: s.rewardsDiscount, group: "discounts" },
      { label: "خصم المطعم على الأصناف", value: s.restaurantFoodDiscount, group: "discounts" },
      { label: "تعديلات التنفيذ", value: s.fulfillmentMods, group: "refunds" },
      { label: "مرتجعات معتمدة", value: s.approvedRefunds, group: "refunds" },
      { label: "مرتجعات جزئية", value: s.partialRefund, group: "refunds" },
    );
  } else if (period.platform === "keeta") {
    lines.push(
      { label: "عمولة الطلبات بدون الضريبة", value: s.keetaCommissionExVat ?? 0, group: "platform_cost" },
      { label: "رسوم البنك بدون الضريبة", value: s.keetaBankFeesExVat ?? 0, group: "platform_cost" },
      { label: "التوصيل والحملات بدون الضريبة", value: s.keetaDeliveryCampaignExVat ?? 0, group: "platform_cost" },
      { label: "الإعلانات بدون الضريبة", value: s.keetaAdvertisingExVat ?? 0, group: "platform_cost" },
      { label: "تعويضات وخصومات المنصة بدون الضريبة", value: s.keetaCompensationExVat ?? 0, group: "platform_cost" },
      { label: "مصروفات أخرى بدون الضريبة", value: s.keetaOtherExpensesExVat ?? 0, group: "platform_cost" },
      { label: "ضريبة مدخلات تكاليف المنصة", value: s.keetaInputVat ?? 0, group: "tax" },
      { label: "Payable حسب كيتا", value: s.keetaSourcePayable ?? 0, group: "settlement" },
      { label: "فرق التسوية", value: s.keetaExcelPayableVariance ?? s.keetaSettlementVariance ?? 0, group: "settlement" },
    );
  } else {
    lines.push(
      { label: "عمولة جاهز بدون الضريبة", value: s.jahezCommissionInvoiceExVat ?? 0, group: "platform_cost" },
      { label: "رسوم المدفوعات بدون الضريبة", value: s.jahezPaymentFeesExVat ?? 0, group: "platform_cost" },
      { label: "عروض التوصيل للفوترة بدون الضريبة", value: s.jahezDeliveryOfferInvoiceExVat ?? 0, group: "platform_cost" },
      { label: "VAT رسوم المدفوعات", value: s.jahezPaymentFeesVat ?? 0, group: "tax" },
      { label: "عروض التوصيل المخصومة شامل الضريبة", value: s.jahezDeliveryOfferInclVat ?? 0, group: "settlement" },
      { label: "صافي أثر التعويضات", value: s.jahezCompensationNetImpact ?? 0, group: "compensation" },
      { label: "صافي المطعم بعد التعويضات", value: s.jahezAdjustedRestaurantAmount ?? s.netSales, group: "settlement" },
    );
  }

  for (const line of lines.filter((item) => Math.abs(item.value) > 0.005)) {
    builder.add("breakdown", "تفصيل بند · " + line.label, money(line.value), {
      label: line.label,
      value: line.value,
      unit: "sar",
      group: line.group,
    });
  }

  for (const [status, value] of Object.entries(s.statusCounts ?? {})) {
    builder.add("status", "حالة طلب · " + status, String(value), {
      status,
      value,
      unit: "count",
    });
  }
}

function addHistoryFacts(
  builder: FactBuilder,
  ownedPeriods: StoredPeriod[],
) {
  const ordered = [...ownedPeriods]
    .sort((left, right) => {
      const leftKey = left.period_end ?? left.created_at;
      const rightKey = right.period_end ?? right.created_at;
      return rightKey.localeCompare(leftKey);
    })
    .slice(0, MAX_HISTORY_PERIODS);

  for (const period of ordered) {
    const exceptions = buildPeriodExceptions(period);
    const exceptionSummary = summarizeExceptions(exceptions);
    const costRate =
      period.summary.grossSales > 0
        ? period.summary.totalCharges / period.summary.grossSales
        : 0;

    builder.add(
      "history",
      "فترة محفوظة · " + (period.period_start ?? "غير محدد") + " — " + (period.period_end ?? "غير محدد"),
      money(period.summary.grossSales),
      {
        platform: period.platform,
        start: period.period_start,
        end: period.period_end,
        orders: period.summary.orders,
        grossSales: period.summary.grossSales,
        netSales: period.summary.netSales,
        commission: period.summary.commission,
        commissionRatePct: period.summary.commissionPct * 100,
        platformCost: period.summary.totalCharges,
        platformCostRatePct: costRate * 100,
        openExceptions: exceptionSummary.openCount,
        underReview: exceptionSummary.underReview,
        potentialRecovery: exceptionSummary.potentialRecovery,
      },
    );
  }
}

function addAppKnowledgeFacts(
  builder: FactBuilder,
  currentRoute: string,
) {
  const normalized = normalizeAppRoute(currentRoute);
  for (const item of APP_KNOWLEDGE) {
    builder.add(
      "app",
      "معرفة التطبيق · " + item.label,
      item.purpose,
      {
        key: item.key,
        route: item.route,
        label: item.label,
        purpose: item.purpose,
        contains: item.contains,
        sourceOfTruth: item.sourceOfTruth,
        boundaries: item.boundaries,
        currentScreen: item.route === normalized,
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
  currentRoute = "/dashboard",
): AnalystContext {
  const builder = new FactBuilder();
  const exceptions = buildPeriodExceptions(current);
  const open = exceptions.filter(
    isOpenException,
  );

  addPeriodFacts(builder, current, exceptions);
  addBranchFacts(builder, current);
  addDailyFacts(builder, current);
  addDailyDetailFacts(builder, current);
  addInvoiceCheckFacts(builder, current);
  addBreakdownFacts(builder, current);
  addExceptionFacts(builder, current, exceptions);
  addHistoryFacts(builder, ownedPeriods);
  addAppKnowledgeFacts(builder, currentRoute);

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

  const privateTokens = [
    ...ownedPeriods.flatMap((period) => [period.id, period.label]),
    ...ownedPeriods.flatMap((period) =>
      (period.branches ?? []).map((branch) => branch.branchId),
    ),
  ].filter((token): token is string => Boolean(token));

  const safeFacts = builder.facts.map((fact) => ({
    ...fact,
    label: redactPrivateTokens(fact.label, privateTokens) as string,
    displayValue: redactPrivateTokens(fact.displayValue, privateTokens) as string,
    data: redactPrivateTokens(fact.data, privateTokens) as AnalystFact["data"],
  }));

  return {
    platform: current.platform,
    currentRoute: normalizeAppRoute(currentRoute),
    period: {
      start: current.period_start,
      end: current.period_end,
    },
    hasPreviousPeriod: Boolean(previous),
    facts: safeFacts,
    coverage: {
      branchCount: current.branches?.length ?? 0,
      openExceptionCount: open.length,
      exceptionDetailsIncluded: Math.min(open.length, MAX_EXCEPTION_DETAILS),
      evidenceTrailsIncluded: Math.min(open.length, MAX_EVIDENCE_TRAILS),
      comparisonIncluded,
      invoiceChecksIncluded: current.invoice?.checks?.length ?? 0,
      dailyRowsIncluded: Math.min(current.daily?.length ?? 0, MAX_DAILY_ROWS),
      historyPeriodsIncluded: Math.min(ownedPeriods.length, MAX_HISTORY_PERIODS),
      historyPeriodsAvailable: ownedPeriods.length,
      appKnowledgeItemsIncluded: APP_KNOWLEDGE.length,
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
