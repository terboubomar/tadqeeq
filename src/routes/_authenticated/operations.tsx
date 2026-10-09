import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, Upload } from "lucide-react";
import { useState } from "react";

import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { MonthPicker } from "@/components/operations/OperationsKit";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/workspace/PageKit";
import { count, percent, sar } from "@/lib/format";
import { currentOperationMonth, OPERATION_PLATFORMS, operationPlatformLabel } from "@/lib/operations/catalog";
import { operationCommissionRatio, operationCostRatio } from "@/lib/operations/details";
import { monthLabel } from "@/lib/operations/months";
import { getOperationMonth } from "@/lib/operations/operations.functions";
import {
  operationBranchWatchlist,
  operationCostPerOrder,
  operationDataHealth,
  operationOverviewTotals,
  operationSalesShares,
  WATCHLIST_MIN_ORDERS,
} from "@/lib/operations/overview";
import type { OperationPlatform, OperationPlatformMonth } from "@/lib/operations/types";

export const Route = createFileRoute("/_authenticated/operations")({
  head: () => ({
    meta: [
      { title: "العمليات اليومية · تدقيق" },
      { name: "description", content: "متابعة أداء منصات التوصيل وفتح ملفات الطلبات اليومية." },
    ],
  }),
  component: OperationsPage,
});

function OperationsPage() {
  const [month, setMonth] = useState(currentOperationMonth);
  const query = useQuery({
    queryKey: ["operation-month", month],
    queryFn: () => getOperationMonth({ data: { month } }),
  });
  const overview = query.data;
  const platforms = overview?.platforms ?? [];
  const totals = operationOverviewTotals(platforms);
  const hasData = totals.orderCount > 0 || totals.grossSales > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "العمليات اليومية" }]}
        title="العمليات اليومية"
        subtitle="نظرة سريعة على تكلفة كل منصة. افتح المنصة لمراجعة الملفات والطلبات بالتفصيل."
        aside={<MonthPicker month={month} onChange={setMonth} />}
      />

      {query.isError ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive-soft p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            {query.error instanceof Error ? query.error.message : "تعذّر تحميل العمليات."}
          </div>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            <RefreshCw className="size-3.5" /> إعادة المحاولة
          </Button>
        </div>
      ) : null}

      {overview && overview.imports.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border bg-card px-5 py-6">
          <h2 className="font-display text-[15px] font-bold">لا توجد ملفات في {monthLabel(month)}</h2>
          <ol className="mt-3 list-inside list-decimal space-y-1.5 text-[12.5px] leading-6 text-muted-foreground">
            <li>صدّر ملف الطلبات اليومي من بوابة كل منصة (يوم لكل ملف).</li>
            <li>افتح المنصة أدناه واسحب ملفات الأيام دفعة واحدة؛ يُقرأ تاريخ كل ملف تلقائياً.</li>
            <li>تابع التغطية في التقويم، والمؤشرات والفروع والطلبات بعد الرفع.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            {OPERATION_PLATFORMS.map((platform) => (
              <Button key={platform.id} asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/operations/$platform" params={{ platform: platform.id }} search={{ month }}>
                  <Upload className="size-3.5" />
                  <PlatformName platform={platform.id} />
                </Link>
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-ink text-ink-foreground">
        <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <OverviewMetric label="إجمالي المبيعات" value={sar(totals.grossSales)} highlighted />
          <OverviewMetric
            label="تكلفة المنصات"
            value={sar(totals.charges)}
            hint={`${percent(operationCostRatio(totals.charges, totals.grossSales))} من المبيعات`}
          />
          <OverviewMetric
            label="صافي التحويل حتى الآن"
            value={sar(totals.settlement)}
            hint={
              !hasData
                ? undefined
                : totals.forecastSettlement != null
                  ? `المتوقع لنهاية الشهر ${sar(totals.forecastSettlement)}`
                  : "التوقع لنهاية الشهر يظهر بعد رفع الأيام الناقصة"
            }
          />
          <OverviewMetric
            label="الطلبات المسجلة"
            value={count(totals.orderCount)}
            hint={hasData ? `تكلفة الطلب ${sar(operationCostPerOrder(totals.charges, totals.orderCount))}` : undefined}
          />
        </div>
      </section>

      {hasData ? <DataHealth platforms={platforms} month={month} /> : null}

      {hasData ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <SalesShare platforms={platforms} />
          <BranchWatchlist platforms={platforms} month={month} />
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-[16px] font-bold">المنصات</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              كل منصة لها مساحة مستقلة للرفع والمراجعة.
            </p>
          </div>
          {query.isFetching ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="divide-y divide-border">
          {OPERATION_PLATFORMS.map((platform) => {
            const row = overview?.platforms.find((item) => item.platform === platform.id);
            const costRatio = operationCostRatio(row?.chargesToDate ?? 0, row?.grossSales ?? 0);
            const commissionRatio = operationCommissionRatio(
              row?.commissionAmount ?? 0,
              row?.grossSales ?? 0,
            );
            return (
              <Link
                key={platform.id}
                to="/operations/$platform"
                params={{ platform: platform.id }}
                search={{ month }}
                className="group grid gap-4 px-4 py-5 transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(220px,1.25fr)_repeat(5,minmax(96px,0.6fr))_auto] sm:items-center sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-background">
                    <PlatformIcon platform={platform.id} className="size-7 rounded-lg" />
                  </span>
                  <span className="min-w-0">
                    <span className="font-display text-[15px] font-bold">
                      <PlatformName platform={platform.id} />
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                      {platform.description}
                    </span>
                  </span>
                </div>
                <Metric label="المبيعات" value={row?.coveredDays ? sar(row.grossSales) : "—"} />
                <Metric label="تكلفة المنصة" value={row?.coveredDays ? percent(costRatio) : "—"} />
                <Metric
                  label="التكلفة لكل طلب"
                  value={row?.orderCount ? sar(operationCostPerOrder(row.chargesToDate, row.orderCount)) : "—"}
                />
                <Metric
                  label="نسبة العمولة"
                  value={row?.coveredDays ? percent(commissionRatio) : "—"}
                />
                <Metric
                  label="التغطية"
                  value={
                    row?.coveredDays
                      ? `${count(row.coveredDays)} / ${count(overview?.daysInMonth)}`
                      : "—"
                  }
                  hint={row?.coveredDays ? `${count(row.orderCount)} طلب` : "لا توجد ملفات"}
                />
                <ArrowLeft className="hidden size-4 text-muted-foreground transition-transform group-hover:-translate-x-1 sm:block" />
              </Link>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] text-muted-foreground">
        مؤشرات تشغيلية مبنية على الملفات المرفوعة وليست بديلاً عن الفاتورة الرسمية.
      </p>
    </div>
  );
}

const PLATFORM_COLORS: Record<OperationPlatform, string> = {
  hungerstation: "var(--color-chart-1)",
  keeta: "var(--color-chart-2)",
  jahez: "var(--color-chart-3)",
};

const shortDate = (date: string) => date.slice(8, 10) + "/" + date.slice(5, 7);

/** Gaps and incomplete files that make this month's numbers lower than they really are. */
function DataHealth({ platforms, month }: { platforms: OperationPlatformMonth[]; month: string }) {
  const rows = operationDataHealth(platforms);
  if (!rows.length) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 px-5 py-3 text-[12px]">
        <CheckCircle2 className="size-4 shrink-0 text-success" />
        ملفات الشهر مكتملة: لا أيام ناقصة ولا ملفات صُدّرت قبل التسوية.
      </p>
    );
  }
  return (
    <section className="rounded-2xl border border-warning/40 bg-warning/15 px-5 py-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold">
        <AlertTriangle className="size-4 shrink-0 text-warning" />
        بيانات تحتاج استكمال قبل الاعتماد على الأرقام
      </h2>
      <ul className="mt-2 space-y-1.5 text-[12px] leading-6">
        {rows.map((row) => (
          <li key={row.platform}>
            <Link
              to="/operations/$platform"
              params={{ platform: row.platform }}
              search={{ month }}
              className="font-semibold underline-offset-4 hover:underline"
            >
              {operationPlatformLabel(row.platform)}
            </Link>
            {row.missingDays.length ? (
              <span>
                {" · "}
                {row.missingDays.length === 1 ? "يوم ناقص" : `${count(row.missingDays.length)} أيام ناقصة`}:{" "}
                <span dir="ltr">{row.missingDays.join("، ")}</span>
              </span>
            ) : null}
            {row.incompleteDays.length ? (
              <span>
                {" · "}
                {row.incompleteDays.length === 1 ? "ملف غير مكتمل" : `${count(row.incompleteDays.length)} ملفات غير مكتملة`}:{" "}
                <span dir="ltr">{row.incompleteDays.map(shortDate).join("، ")}</span>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        الأيام الناقصة توقف التوقع لنهاية الشهر، والملفات غير المكتملة تُظهر التكلفة أقل من الحقيقة. أعد تصديرها وارفعها من صفحة المنصة.
      </p>
    </section>
  );
}

/** One stacked bar of the month's sales by platform, with each share spelled out. */
function SalesShare({ platforms }: { platforms: OperationPlatformMonth[] }) {
  const shares = operationSalesShares(platforms);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="font-display text-[15px] font-bold">حصة كل منصة من المبيعات</h2>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="حصة كل منصة من المبيعات">
        {shares.map((row) => (
          <span
            key={row.platform}
            title={`${operationPlatformLabel(row.platform)} · ${percent(row.share, 1)}`}
            style={{ width: `${row.share * 100}%`, background: PLATFORM_COLORS[row.platform] }}
            className="h-full border-s-2 border-card first:border-s-0"
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {shares.map((row) => (
          <li key={row.platform} className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: PLATFORM_COLORS[row.platform] }} />
              {operationPlatformLabel(row.platform)}
            </span>
            <span className="flex items-baseline gap-3">
              <span className="num text-muted-foreground">{sar(row.grossSales)}</span>
              <span className="num w-14 text-end font-semibold">{percent(row.share, 1)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The branches where platforms take the largest share of sales this month. */
function BranchWatchlist({ platforms, month }: { platforms: OperationPlatformMonth[]; month: string }) {
  const rows = operationBranchWatchlist(platforms);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="font-display text-[15px] font-bold">فروع تحت المراقبة</h2>
      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
        أعلى نسبة تكلفة منصة من مبيعات الفرع، للفروع التي لديها {count(WATCHLIST_MIN_ORDERS)} طلب أو أكثر.
      </p>
      {rows.length ? (
        <ol className="mt-3 divide-y divide-border">
          {rows.map((row, index) => (
            <li key={row.platform + row.key}>
              <Link
                to="/operations/$platform"
                params={{ platform: row.platform }}
                search={{ month }}
                className="flex items-center gap-3 py-2.5 hover:bg-muted/35"
              >
                <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold">{index + 1}</span>
                <PlatformIcon platform={row.platform} className="size-6 shrink-0 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold">{row.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {operationPlatformLabel(row.platform)} · {count(row.orderCount)} طلب · {sar(row.grossSales)}
                  </span>
                </span>
                <span className="num text-[14px] font-semibold text-destructive">{percent(row.costRatio, 1)}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground">
          لا توجد فروع كافية للمقارنة بعد. تفصيل الفروع يظهر للملفات المرفوعة بعد إضافته؛ أعد رفع ملفات الشهر لعرضه.
        </p>
      )}
    </section>
  );
}

function OverviewMetric({
  label,
  value,
  hint,
  highlighted,
}: {
  label: string;
  value: string;
  hint?: string;
  highlighted?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11.5px] text-ink-muted">{label}</p>
      <p className={`num mt-1 text-[25px] font-semibold ${highlighted ? "text-primary" : ""}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-2 sm:block">
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
      <p className="num mt-1 text-[14px] font-semibold">{value}</p>
      {hint ? <p className="mt-0.5 text-[10.5px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
