import type { AnalystContext, AnalystFact } from "./analyst-context";
import type { AnalystAiResponse, AnalystTablePresentation } from "./analyst-ai";

function money(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " ر.س"
    : "—";
}

function percent(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + "%"
    : "—";
}

function count(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value).toLocaleString("en-US")
    : "—";
}

function text(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "—";
}

function factsByIds(context: AnalystContext, ids: string[]): AnalystFact[] {
  const requested = new Set(ids);
  return context.facts.filter((fact) => requested.has(fact.id));
}

function branchName(fact: AnalystFact): string | null {
  return typeof fact.data["branch"] === "string" ? fact.data["branch"] : null;
}

function rankingNames(facts: AnalystFact[]): string[] {
  const names: string[] = [];

  for (const fact of facts) {
    if (fact.kind !== "ranking" || !Array.isArray(fact.data["ranking"])) continue;
    for (const row of fact.data["ranking"]) {
      if (!row || typeof row !== "object") continue;
      const branch = (row as Record<string, unknown>)["branch"];
      if (typeof branch === "string" && !names.includes(branch)) names.push(branch);
    }
  }

  return names;
}

function branchTable(
  context: AnalystContext,
  requestedFacts: AnalystFact[],
  title: string,
): AnalystTablePresentation | null {
  const directBranches = requestedFacts.filter((fact) => fact.kind === "branch");
  const rankedNames = rankingNames(requestedFacts);

  const allBranchFacts = context.facts.filter((fact) => fact.kind === "branch");
  const byName = new Map(
    allBranchFacts
      .map((fact) => [branchName(fact), fact] as const)
      .filter((entry): entry is [string, AnalystFact] => Boolean(entry[0])),
  );

  const ordered: AnalystFact[] = [];

  if (rankedNames.length) {
    for (const name of rankedNames) {
      const fact = byName.get(name);
      if (fact) ordered.push(fact);
    }
  }

  for (const fact of directBranches) {
    if (!ordered.some((item) => item.id === fact.id)) ordered.push(fact);
  }

  if (!ordered.length) return null;

  return {
    type: "table",
    title: title || "تفاصيل الفروع",
    columns: [
      { key: "rank", label: "#", align: "number" },
      { key: "branch", label: "الفرع", align: "text" },
      { key: "grossSales", label: "المبيعات", align: "number" },
      { key: "platformCost", label: "تكلفة المنصة", align: "number" },
      { key: "platformCostRate", label: "نسبة التكلفة", align: "number" },
      { key: "orders", label: "الطلبات", align: "number" },
      { key: "commissionRate", label: "نسبة العمولة", align: "number" },
    ],
    rows: ordered.slice(0, 8).map((fact, index) => ({
      rank: String(index + 1),
      branch: text(fact.data["branch"]),
      grossSales: money(fact.data["grossSales"]),
      platformCost: money(fact.data["platformCost"]),
      platformCostRate: percent(fact.data["platformCostRatePct"]),
      orders: count(fact.data["orders"]),
      commissionRate: percent(fact.data["commissionRatePct"]),
    })),
  };
}

function exceptionTable(
  requestedFacts: AnalystFact[],
  title: string,
): AnalystTablePresentation | null {
  const exceptions = requestedFacts.filter((fact) => fact.kind === "exception");
  if (!exceptions.length) return null;

  return {
    type: "table",
    title: title || "الاستثناءات ذات الصلة",
    columns: [
      { key: "branch", label: "الفرع", align: "text" },
      { key: "exception", label: "الاستثناء", align: "text" },
      { key: "category", label: "الفئة", align: "text" },
      { key: "reviewAmount", label: "محل المراجعة", align: "number" },
      { key: "potentialRecovery", label: "استرداد محتمل", align: "number" },
      { key: "status", label: "الحالة", align: "text" },
    ],
    rows: exceptions.slice(0, 10).map((fact) => ({
      branch: text(fact.data["branch"]),
      exception: text(fact.data["label"]),
      category: text(fact.data["category"]),
      reviewAmount: money(fact.data["reviewAmount"]),
      potentialRecovery: money(fact.data["potentialRecovery"]),
      status: text(fact.data["status"]),
    })),
  };
}

function comparisonTable(
  requestedFacts: AnalystFact[],
  title: string,
): AnalystTablePresentation | null {
  const metrics = requestedFacts.filter(
    (fact) => fact.kind === "comparison" && typeof fact.data["metric"] === "string",
  );
  if (!metrics.length) return null;

  return {
    type: "table",
    title: title || "مقارنة الفترة",
    columns: [
      { key: "metric", label: "المؤشر", align: "text" },
      { key: "current", label: "الحالية", align: "number" },
      { key: "previous", label: "السابقة", align: "number" },
      { key: "delta", label: "التغير", align: "number" },
      { key: "relative", label: "التغير النسبي", align: "number" },
    ],
    rows: metrics.slice(0, 10).map((fact) => {
      const unit = fact.data["unit"];
      const formatter = unit === "sar" ? money : unit === "percent" ? percent : count;
      const delta =
        fact.data["deltaType"] === "percentage_points"
          ? percent(fact.data["delta"])
          : formatter(fact.data["delta"]);

      return {
        metric: text(fact.data["metric"]),
        current: formatter(fact.data["current"]),
        previous: formatter(fact.data["previous"]),
        delta,
        relative: percent(fact.data["relativeChangePct"]),
      };
    }),
  };
}

function platformLabel(value: unknown): string {
  return value === "hungerstation"
    ? "هنقرستيشن"
    : value === "keeta"
      ? "كيتا"
      : value === "jahez"
        ? "جاهز"
        : text(value);
}

function evidenceLabel(value: unknown): string {
  return value === "data"
    ? "بيانات"
    : value === "contract"
      ? "عقد"
      : value === "invoice_derived"
        ? "مشتق من الفاتورة"
        : value === "invoice_only"
          ? "فاتورة فقط"
          : value === "mixed"
            ? "مختلط"
            : text(value);
}

function invoiceTable(
  requestedFacts: AnalystFact[],
  title: string,
): AnalystTablePresentation | null {
  const rows = requestedFacts.filter((fact) => fact.kind === "invoice_check");
  if (!rows.length) return null;

  return {
    type: "table",
    title: title || "مطابقة الفاتورة",
    columns: [
      { key: "label", label: "البند", align: "text" },
      { key: "computed", label: "المحتسب", align: "number" },
      { key: "invoiced", label: "المستند الرسمي", align: "number" },
      { key: "difference", label: "الفرق", align: "number" },
      { key: "tolerance", label: "التسامح", align: "number" },
      { key: "evidence", label: "نوع الدليل", align: "text" },
      { key: "result", label: "النتيجة", align: "text" },
    ],
    rows: rows.slice(0, 40).map((fact) => ({
      label: text(fact.data["label"]),
      computed: money(fact.data["computed"]),
      invoiced: money(fact.data["invoiced"]),
      difference: money(fact.data["difference"]),
      tolerance: money(fact.data["tolerance"]),
      evidence: evidenceLabel(fact.data["evidence"]),
      result:
        fact.data["missing"] === true
          ? "لم يُقرأ من الفاتورة"
          : fact.data["withinTolerance"] === true
            ? "ضمن التسامح"
            : "يحتاج مراجعة",
    })),
  };
}

function dailyTable(
  requestedFacts: AnalystFact[],
  title: string,
): AnalystTablePresentation | null {
  const rows = requestedFacts.filter((fact) => fact.kind === "daily");
  if (!rows.length) return null;

  return {
    type: "table",
    title: title || "التقرير اليومي",
    columns: [
      { key: "date", label: "التاريخ", align: "text" },
      { key: "orders", label: "الطلبات", align: "number" },
      { key: "grossSales", label: "المبيعات", align: "number" },
      { key: "netSales", label: "صافي التسوية", align: "number" },
      { key: "commission", label: "العمولة", align: "number" },
      { key: "compensation", label: "صافي التعويضات", align: "number" },
    ],
    rows: rows.slice(0, 62).map((fact) => ({
      date: text(fact.data["date"]),
      orders: count(fact.data["orders"]),
      grossSales: money(fact.data["grossSales"]),
      netSales: money(fact.data["netSales"]),
      commission: money(fact.data["commission"]),
      compensation: money(fact.data["jahezCompensationNetImpact"]),
    })),
  };
}

function breakdownTable(
  requestedFacts: AnalystFact[],
  title: string,
): AnalystTablePresentation | null {
  const rows = requestedFacts.filter(
    (fact) => fact.kind === "breakdown" || fact.kind === "status",
  );
  if (!rows.length) return null;

  return {
    type: "table",
    title: title || "تفصيل البنود",
    columns: [
      { key: "group", label: "المجموعة", align: "text" },
      { key: "label", label: "البند", align: "text" },
      { key: "value", label: "القيمة", align: "number" },
    ],
    rows: rows.slice(0, 40).map((fact) => ({
      group:
        fact.kind === "status"
          ? "حالات الطلبات"
          : text(fact.data["group"]),
      label:
        fact.kind === "status"
          ? text(fact.data["status"])
          : text(fact.data["label"]),
      value:
        fact.kind === "status"
          ? count(fact.data["value"])
          : money(fact.data["value"]),
    })),
  };
}

function historyTable(
  requestedFacts: AnalystFact[],
  title: string,
): AnalystTablePresentation | null {
  const rows = requestedFacts.filter((fact) => fact.kind === "history");
  if (!rows.length) return null;

  return {
    type: "table",
    title: title || "الفترات المحفوظة",
    columns: [
      { key: "period", label: "الفترة", align: "text" },
      { key: "platform", label: "المنصة", align: "text" },
      { key: "orders", label: "الطلبات", align: "number" },
      { key: "sales", label: "المبيعات", align: "number" },
      { key: "commission", label: "العمولة", align: "number" },
      { key: "cost", label: "تكلفة المنصة", align: "number" },
      { key: "costRate", label: "نسبة التكلفة", align: "number" },
      { key: "exceptions", label: "استثناءات مفتوحة", align: "number" },
    ],
    rows: rows.slice(0, 24).map((fact) => ({
      period:
        text(fact.data["start"]) + " — " + text(fact.data["end"]),
      platform: platformLabel(fact.data["platform"]),
      orders: count(fact.data["orders"]),
      sales: money(fact.data["grossSales"]),
      commission: money(fact.data["commission"]),
      cost: money(fact.data["platformCost"]),
      costRate: percent(fact.data["platformCostRatePct"]),
      exceptions: count(fact.data["openExceptions"]),
    })),
  };
}

export function buildAnalystPresentation(
  context: AnalystContext,
  response: AnalystAiResponse,
): AnalystTablePresentation | null {
  if (response.presentation.type === "text") return null;

  const requestedIds = [...response.presentation.factIds, ...response.usedFactIds];
  const requestedFacts = factsByIds(context, requestedIds);
  const title = response.presentation.title.trim();

  if (response.presentation.type === "branch_table") {
    return branchTable(context, requestedFacts, title);
  }

  if (response.presentation.type === "exception_table") {
    return exceptionTable(requestedFacts, title);
  }

  if (response.presentation.type === "comparison_table") {
    return comparisonTable(requestedFacts, title);
  }

  if (response.presentation.type === "invoice_table") {
    return invoiceTable(requestedFacts, title);
  }

  if (response.presentation.type === "daily_table") {
    return dailyTable(requestedFacts, title);
  }

  if (response.presentation.type === "breakdown_table") {
    return breakdownTable(requestedFacts, title);
  }

  if (response.presentation.type === "history_table") {
    return historyTable(requestedFacts, title);
  }

  return null;
}
