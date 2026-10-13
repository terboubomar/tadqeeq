import { PageHeader } from "@/components/workspace/PageKit";
import { createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "@/components/AppShell";
import { ChartCard } from "@/components/dash/DashKit";
import { DailyHeatmap } from "@/components/dash/DailyHeatmap";
import { ReportTable, type Column } from "@/components/ReportTable";
import type { DailyRow } from "@/lib/analysis/types";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/daily")({
  head: () => ({
    meta: [
      { title: "التقرير اليومي · تدقيق" },
      { name: "description", content: "حركة الطلبات والمبيعات والعمولة يوماً بيوم." },
      { property: "og:title", content: "التقرير اليومي · تدقيق" },
      { property: "og:description", content: "حركة الطلبات والمبيعات والعمولة يوماً بيوم." },
    ],
  }),
  component: DailyPage,
});

const DEFAULT_COLUMNS: Column<DailyRow>[] = [
  { key: "date", header: "اليوم", type: "text" },
  { key: "orders", header: "الطلبات", type: "number" },
  { key: "grossSales", header: "المبيعات (شامل الضريبة)" },
  { key: "netSales", header: "الأساس / صافي التسوية" },
  { key: "commission", header: "العمولة" },
  { key: "ccSuccess", header: "مدفوعات البطاقات" },
];

const JAHEZ_COLUMNS: Column<DailyRow>[] = [
  { key: "date", header: "اليوم", type: "text" },
  { key: "orders", header: "طلبات جاهز", type: "number" },
  { key: "grossSales", header: "Order Amount" },
  { key: "netSales", header: "Restaurant Amount" },
  { key: "commission", header: "عمولة جاهز بدون الضريبة" },
  { key: "jahezCompensationDebit", header: "تعويضات مخصومة" },
  { key: "jahezCompensationCredit", header: "تعويضات مضافة" },
  { key: "jahezCompensationNetImpact", header: "صافي أثر التعويضات" },
];

function DailyPage() {
  const { selected, isLoading } = useSelectedPeriod();

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لعرض الحركة اليومية." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التقارير" }, { label: "التقرير اليومي" }]}
        title="التقرير اليومي"
        subtitle={
          selected.platform === "jahez"
            ? "حسب تاريخ الحركة."
            : "حسب يوم التشغيل."
        }
      />
      <ChartCard title="الفترة على التقويم" action={<span className="text-[11.5px] text-muted-foreground">الأغمق هو الأعلى</span>}>
        <DailyHeatmap
          salesLabel={selected.platform === "jahez" ? "Order Amount" : "المبيعات (شامل الضريبة)"}
          days={selected.daily
            .filter((day) => (!selected.period_start || day.date >= selected.period_start) && (!selected.period_end || day.date <= selected.period_end))
            .map((day) => ({ date: day.date, sales: day.grossSales, orders: day.orders }))}
        />
      </ChartCard>
      <ReportTable
        title={selected.label}
        rows={selected.daily as unknown as Record<string, unknown>[]}
        columns={
          (selected.platform === "jahez" ? JAHEZ_COLUMNS : DEFAULT_COLUMNS) as unknown as Column<
            Record<string, unknown>
          >[]
        }
        filename={`daily-${selected.period_start ?? "period"}`}
        searchKey="date"
      />
    </div>
  );
}
