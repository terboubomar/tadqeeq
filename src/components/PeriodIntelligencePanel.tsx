import {
  ArrowDownRight,
  ArrowUpRight,
  GitCompareArrows,
  Loader2,
  Minus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AI_UI_ENABLED } from "@/lib/ai/config";
import { analyzePeriodIntelligenceWithAi } from "@/lib/ai/period-intelligence-ai.functions";
import type { PeriodIntelligenceAiResult } from "@/lib/ai/period-intelligence-ai";
import {
  buildPeriodComparison,
  findPreviousComparablePeriod,
  type ComparisonUnit,
  type MetricComparison,
  type PeriodComparison,
} from "@/lib/period-intelligence";
import type { StoredPeriod } from "@/lib/periods";
import { arabicDate, count, money, percent, sar } from "@/lib/format";

import { Button } from "./ui/button";

export function PeriodIntelligencePanel({
  current,
  periods,
}: {
  current: StoredPeriod;
  periods: StoredPeriod[];
}) {
  const previous = useMemo(
    () => findPreviousComparablePeriod(current, periods),
    [current, periods],
  );

  const built = useMemo(() => {
    if (!previous) return { comparison: null, error: null };
    try {
      return { comparison: buildPeriodComparison(current, previous), error: null };
    } catch (cause) {
      return {
        comparison: null,
        error:
          cause instanceof Error
            ? cause.message
            : "تعذّر إنشاء مقارنة موثوقة بين الفترتين.",
      };
    }
  }, [current, previous]);

  if (!previous) {
    return (
      <section className="panel p-5">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="size-4 text-primary-text" />
          <h2 className="text-sm font-bold">ذكاء الفترات</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            مقارنة حتمية
          </span>
        </div>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          لا توجد فترة سابقة محفوظة لنفس المنصة تنتهي قبل بداية الفترة الحالية. أضف فترة سابقة
          لتفعيل مقارنة المبيعات والتكلفة والاستثناءات والفروع.
        </p>
      </section>
    );
  }

  if (!built.comparison) {
    return (
      <section className="rounded-[14px] border border-destructive/20 bg-destructive/[0.03] p-5">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="size-4 text-destructive" />
          <h2 className="text-sm font-bold">ذكاء الفترات</h2>
        </div>
        <p className="mt-2 text-xs leading-6 text-destructive">
          {built.error ?? "تعذّر إنشاء المقارنة."}
        </p>
      </section>
    );
  }

  return (
    <PeriodComparisonView
      key={current.id + "-" + previous.id}
      current={current}
      previous={previous}
      comparison={built.comparison}
    />
  );
}

function PeriodComparisonView({
  current,
  previous,
  comparison,
}: {
  current: StoredPeriod;
  previous: StoredPeriod;
  comparison: PeriodComparison;
}) {
  const [aiResult, setAiResult] = useState<PeriodIntelligenceAiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const metrics = new Map(comparison.metrics.map((item) => [item.key, item]));
  const branchMovements = comparison.branchMovements.slice(0, 5);
  const categoryMovements = comparison.exceptionCategories.slice(0, 4);

  async function analyzeWithAi() {
    setAiLoading(true);
    setAiError(null);

    try {

      const response = await analyzePeriodIntelligenceWithAi({
        data: {
          currentPeriodId: current.id,
          previousPeriodId: previous.id,
        },
      });
      setAiResult(response);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "تعذّر إنشاء تفسير Tadqeeq AI لمقارنة الفترتين.";
      setAiError(message);
      toast.error(message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-secondary text-primary-text">
                <GitCompareArrows className="size-4" />
              </span>
              <h2 className="text-[15px] font-bold">ذكاء الفترات · مقارنة بالفترة السابقة</h2>
              <span className="rounded-full border border-primary/20 bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary-text">
                أرقام حتمية
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              الحالية: {arabicDate(current.period_start)} — {arabicDate(current.period_end)}
              {" · "}
              السابقة: {arabicDate(previous.period_start)} — {arabicDate(previous.period_end)}
            </p>
          </div>

          {AI_UI_ENABLED ? (
            <Button
              type="button"
              size="sm"
              variant={aiResult ? "outline" : "default"}
              onClick={analyzeWithAi}
              disabled={aiLoading}
              className="shrink-0"
              aria-busy={aiLoading}
            >
              {aiLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : aiResult ? (
                <RefreshCw className="size-3.5" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {aiLoading ? "جارٍ تفسير التغيّرات…" : aiResult ? "تحديث تفسير AI" : "فسّر التغيّرات بـ AI"}
            </Button>
          ) : null}
        </div>

        {comparison.warnings.length ? (
          <div className="mt-3 space-y-1 rounded-lg border border-warning/20 bg-warning/[0.04] px-3 py-2">
            {comparison.warnings.map((warning) => (
              <p key={warning} className="text-[11px] leading-5 text-muted-foreground">
                {warning}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard metric={metrics.get("gross_sales")} />
          <MetricCard metric={metrics.get("orders")} />
          <MetricCard metric={metrics.get("commission_rate")} />
          <MetricCard metric={metrics.get("platform_cost_rate")} />
          <ExposureCard
            label="المبلغ محل المراجعة"
            current={comparison.exceptions.current.underReview}
            previous={comparison.exceptions.previous.underReview}
            delta={comparison.exceptions.underReviewDelta}
            unit="sar"
          />
          <ExposureCard
            label="الاسترداد المحتمل"
            current={comparison.exceptions.current.potentialRecovery}
            previous={comparison.exceptions.previous.potentialRecovery}
            delta={comparison.exceptions.potentialRecoveryDelta}
            unit="sar"
          />
          <ExposureCard
            label="الاستثناءات المفتوحة"
            current={comparison.exceptions.current.openCount}
            previous={comparison.exceptions.previous.openCount}
            delta={comparison.exceptions.openCountDelta}
            unit="count"
          />
          <MetricCard metric={metrics.get("platform_cost")} />
        </div>

        {comparison.platformMetrics.length ? (
          <div>
            <h3 className="text-xs font-bold">مؤشرات خاصة بالمنصة</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {comparison.platformMetrics.map((item) => (
                <MetricCard key={item.key} metric={item} compact />
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-5">
          <div className="overflow-hidden rounded-xl border border-border xl:col-span-3">
            <div className="border-b border-border bg-muted/40 px-4 py-2.5">
              <h3 className="text-[13px] font-bold">أكبر تحركات الفروع</h3>
            </div>
            {branchMovements.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-xs">
                  <thead className="bg-secondary/15 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">الفرع</th>
                      <th className="px-3 py-2 text-end font-medium">المبيعات</th>
                      <th className="px-3 py-2 text-end font-medium">تكلفة المنصة</th>
                      <th className="px-3 py-2 text-end font-medium">نسبة التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchMovements.map((branch) => (
                      <tr key={branch.branch + branch.status} className="border-t border-border/70">
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{branch.branch}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {branch.status === "new"
                              ? "فرع جديد في الفترة الحالية"
                              : branch.status === "removed"
                                ? "غير موجود في الفترة الحالية"
                                : "مطابق بين الفترتين"}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          <SignedMoney value={branch.grossSalesDelta} />
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          <SignedMoney value={branch.platformCostDelta} />
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          <SignedPoints value={branch.platformCostRateDelta * 100} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-3 py-5 text-xs text-muted-foreground">لا توجد بيانات فروع قابلة للمقارنة.</p>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border xl:col-span-2">
            <div className="border-b border-border bg-muted/40 px-4 py-2.5">
              <h3 className="text-[13px] font-bold">تحرك الاستثناءات حسب الفئة</h3>
            </div>
            <div className="divide-y divide-border/70">
              {categoryMovements.length ? (
                categoryMovements.map((item) => (
                  <div key={item.category} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium">{item.category}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {item.previousCount} → {item.currentCount} حالة
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground">
                      <span>
                        محل المراجعة: <SignedMoney value={item.reviewAmountDelta} />
                      </span>
                      <span>
                        استرداد محتمل: <SignedMoney value={item.potentialRecoveryDelta} />
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-3 py-5 text-xs text-muted-foreground">
                  لا توجد استثناءات مفتوحة في الفترتين.
                </p>
              )}
            </div>
          </div>
        </div>

        {AI_UI_ENABLED && aiError && !aiResult ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2.5 text-xs leading-6 text-destructive">
            {aiError}
          </div>
        ) : null}

        {AI_UI_ENABLED && aiResult ? <AiInterpretation result={aiResult} /> : null}
      </div>
    </section>
  );
}

function MetricCard({
  metric,
  compact = false,
}: {
  metric: MetricComparison | undefined;
  compact?: boolean;
}) {
  if (!metric) return null;
  const positive = metric.delta > 0;
  const negative = metric.delta < 0;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-5 text-muted-foreground">{metric.label}</p>
        <span className={"grid size-6 shrink-0 place-items-center rounded-md " + (positive ? "bg-secondary text-primary-text" : negative ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground")}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className={"mt-1 whitespace-nowrap font-semibold " + (compact ? "text-[15px]" : "text-[19px]")}>
        <span className="num">{formatValue(metric.current, metric.unit)}</span>
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        السابق: <span className="num">{formatValue(metric.previous, metric.unit)}</span>
      </p>
      <p className="mt-1 text-[11px] font-medium">
        {metric.unit === "ratio" ? (
          <SignedPoints value={metric.percentagePointChange ?? metric.delta * 100} />
        ) : (
          <>
            {formatSignedValue(metric.delta, metric.unit)}
            {metric.relativeChange !== null ? (
              <span className="ms-1 text-muted-foreground">
                ({formatSignedPercent(metric.relativeChange)})
              </span>
            ) : null}
          </>
        )}
      </p>
    </div>
  );
}

function ExposureCard({
  label,
  current,
  previous,
  delta,
  unit,
}: {
  label: string;
  current: number;
  previous: number;
  delta: number;
  unit: "sar" | "count";
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-[12px] font-medium leading-5 text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-nowrap text-[19px] font-semibold"><span className="num">{formatValue(current, unit)}</span></p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        السابق: <span className="num">{formatValue(previous, unit)}</span>
      </p>
      <p className="mt-1 text-[11px] font-medium"><span className="num">{formatSignedValue(delta, unit)}</span></p>
    </div>
  );
}

function AiInterpretation({ result }: { result: PeriodIntelligenceAiResult }) {
  const confidenceLabel =
    result.explanation.confidence === "high"
      ? "ثقة عالية"
      : result.explanation.confidence === "medium"
        ? "ثقة متوسطة"
        : "ثقة منخفضة";

  return (
    <div className="rounded-lg border border-primary/20 bg-secondary/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-xs font-bold">تفسير Tadqeeq AI للتغيّرات</h3>
        <span className="rounded-full border border-primary/15 bg-white px-2 py-0.5 text-[10px] font-semibold text-primary">
          {confidenceLabel}
        </span>
        <span className="text-[10px] text-muted-foreground">
          تفسير فقط — المقارنة الحتمية أعلاه هي المرجع
        </span>
      </div>

      <p className="mt-3 text-sm font-medium leading-7">{result.explanation.executiveSummary}</p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <AiList title="أهم التغيّرات" items={result.explanation.keyChanges} />
        <AiList
          title="إشارات المخاطر"
          items={result.explanation.riskSignals}
          emptyText="لم يحدد التحليل إشارة مخاطر إضافية."
        />
        <AiList
          title="تحسّنات ملحوظة"
          items={result.explanation.improvements}
          emptyText="لم يحدد التحليل تحسناً مستقلاً."
        />
        <AiList title="إجراءات المراجعة المقترحة" items={result.explanation.recommendedActions} />
      </div>

      {result.explanation.limitations.length ? (
        <div className="mt-3">
          <AiList title="حدود التفسير" items={result.explanation.limitations} muted />
        </div>
      ) : null}
    </div>
  );
}

function AiList({
  title,
  items,
  emptyText,
  muted = false,
}: {
  title: string;
  items: string[];
  emptyText?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={
        muted
          ? "rounded-lg border border-border bg-background/50 p-3"
          : "rounded-lg border border-border/70 bg-white/70 p-3"
      }
    >
      <p className="text-[11px] font-semibold text-muted-foreground">{title}</p>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1.5 ps-5 text-xs leading-6">
          {items.map((item, index) => (
            <li key={index} className={muted ? "text-muted-foreground" : "text-foreground/90"}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{emptyText ?? "لا توجد بنود."}</p>
      )}
    </div>
  );
}

function formatValue(value: number, unit: ComparisonUnit): string {
  if (unit === "sar") return sar(value);
  if (unit === "count") return count(value);
  return percent(value);
}

function formatSignedValue(value: number, unit: "sar" | "count"): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  return sign + (unit === "sar" ? sar(absolute) : count(absolute));
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + (Math.abs(value) * 100).toFixed(1) + "%";
}

function SignedMoney({ value }: { value: number }) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return <span className="num">{sign + money(Math.abs(value)) + " ر.س"}</span>;
}

function SignedPoints({ value }: { value: number }) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return <span className="num">{sign + Math.abs(value).toFixed(2) + " نقطة مئوية"}</span>;
}
