import { createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "@/components/AppShell";
import { ReportTable, type Column } from "@/components/ReportTable";
import type { BranchRow } from "@/lib/analysis/types";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/branches")({
  head: () => ({
    meta: [
      { title: "تقرير الفروع · تدقيق" },
      { name: "description", content: "مبيعات وعمولات ورسوم كل فرع خلال الفترة." },
      { property: "og:title", content: "تقرير الفروع · تدقيق" },
      { property: "og:description", content: "مبيعات وعمولات ورسوم كل فرع خلال الفترة." },
    ],
  }),
  component: BranchesPage,
});

const HUNGER_COLUMNS: Column<BranchRow>[] = [
  { key: "branch", header: "الفرع", type: "text" },
  { key: "orders", header: "الطلبات", type: "number" },
  { key: "grossSales", header: "المبيعات (شامل الضريبة)" },
  { key: "netSales", header: "الأساس الخاضع للعمولة" },
  { key: "commission", header: "العمولة" },
  { key: "commissionPct", header: "نسبة العمولة", type: "percent" },
  { key: "bankFeeSuccess", header: "رسوم الدفع" },
  { key: "bankFeeRefunded", header: "رسوم دفع مرتجعة" },
  { key: "rdfCampaigns", header: "حملات التوصيل المجاني" },
  { key: "compensation", header: "تعويضات العملاء" },
  { key: "jokerFees", header: "رسوم العروض" },
  { key: "waitingTimeFees", header: "وقت الانتظار" },
  { key: "totalCharges", header: "إجمالي الخصومات" },
  { key: "walletAmount", header: "محافظ العملاء" },
  { key: "partialRefund", header: "مرتجعات جزئية" },
];

const KEETA_COLUMNS: Column<BranchRow>[] = [
  { key: "branch", header: "المتجر", type: "text" },
  { key: "orders", header: "عدد الفواتير", type: "number" },
  { key: "grossSales", header: "قيمة الفواتير" },
  { key: "netSales", header: "المستحق للتاجر" },
  { key: "commission", header: "خصومات المنصة" },
  { key: "commissionPct", header: "نسبة الخصم", type: "percent" },
];

function BranchesPage() {
  const { selected, isLoading } = useSelectedPeriod();

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لعرض تقرير الفروع." />;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">تقرير الفروع</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اضغط على عنوان أي عمود للترتيب تصاعدياً أو تنازلياً.
        </p>
      </header>
      <ReportTable
        title={selected.label}
        rows={selected.branches as unknown as Record<string, unknown>[]}
        columns={
          (selected.platform === "hungerstation"
            ? HUNGER_COLUMNS
            : KEETA_COLUMNS) as unknown as Column<Record<string, unknown>>[]
        }
        filename={`branches-${selected.period_start ?? "period"}`}
        searchKey="branch"
      />
    </div>
  );
}
