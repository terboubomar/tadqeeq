import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Upload } from "lucide-react";
import { useState } from "react";

import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { MonthPicker } from "@/components/operations/OperationsKit";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/workspace/PageKit";
import { count, percent, sar } from "@/lib/format";
import { currentOperationMonth, OPERATION_PLATFORMS } from "@/lib/operations/catalog";
import { operationCommissionRatio, operationCostRatio } from "@/lib/operations/details";
import { monthLabel } from "@/lib/operations/months";
import { getOperationMonth } from "@/lib/operations/operations.functions";

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
  const totalSales = overview?.platforms.reduce((sum, row) => sum + row.grossSales, 0) ?? 0;
  const totalCharges = overview?.platforms.reduce((sum, row) => sum + row.chargesToDate, 0) ?? 0;
  const totalOrders = overview?.platforms.reduce((sum, row) => sum + row.orderCount, 0) ?? 0;

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
        <div className="grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-y-0">
          <OverviewMetric label="إجمالي المبيعات" value={sar(totalSales)} highlighted />
          <OverviewMetric
            label="تكلفة المنصات"
            value={sar(totalCharges)}
            hint={`${percent(operationCostRatio(totalCharges, totalSales))} من المبيعات`}
          />
          <OverviewMetric label="الطلبات المسجلة" value={count(totalOrders)} />
        </div>
      </section>

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
                className="group grid gap-4 px-4 py-5 transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(220px,1.25fr)_repeat(4,minmax(100px,0.65fr))_auto] sm:items-center sm:px-5"
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
      {hint ? <p className="num mt-1 text-[11px] text-ink-muted">{hint}</p> : null}
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
