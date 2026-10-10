import { PageHeader } from "@/components/workspace/PageKit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { arabicDate, count, money, percent } from "@/lib/format";
import { exportXlsx } from "@/lib/export";
import { deletePeriod } from "@/lib/periods";
import { platformCostPct, totalPlatformCharges } from "@/lib/reporting-metrics";
import { setSelectedPeriodId, useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";
import { PlatformName } from "@/components/brand/PlatformLogo";

const PLATFORM_LABELS = { hungerstation: "هنقرستيشن", keeta: "كيتا", jahez: "جاهز" } as const;

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "الفترات السابقة · تدقيق" },
      { name: "description", content: "أرشيف الفترات المحفوظة ومقارنة الأداء بينها." },
      { property: "og:title", content: "الفترات السابقة · تدقيق" },
      { property: "og:description", content: "أرشيف الفترات المحفوظة ومقارنة الأداء بينها." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { periods, selected, isLoading } = useSelectedPeriod();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: deletePeriod,
    onSuccess: async (deletedPeriodId) => {
      if (selected?.id === deletedPeriodId) {
        setSelectedPeriodId(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast.success("تم حذف الفترة");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (periods.length === 0) {
    return <EmptyState title="الأرشيف فارغ" body="كل فترة تحلّلها تُحفظ هنا للرجوع إليها لاحقاً." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التقارير" }, { label: "الفترات السابقة" }]}
        title="الفترات السابقة"
        subtitle="اضغط على أي فترة لعرضها في باقي التقارير."
        aside={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              exportXlsx(
                [
                  {
                    name: "الفترات",
                    rows: periods.map((period) => ({
                      label: period.label,
                      platform: PLATFORM_LABELS[period.platform],
                      start: period.period_start ?? "",
                      end: period.period_end ?? "",
                      orders: period.summary?.orders ?? 0,
                      sales: period.summary?.grossSales ?? 0,
                      commission: period.summary?.commission ?? 0,
                      commissionPct: period.summary?.commissionPct ?? 0,
                      charges: period.summary?.totalCharges ?? 0,
                      costPct: platformCostPct(totalPlatformCharges(period.platform, period.summary), period.summary?.grossSales) ?? 0,
                    })),
                    columns: [
                      { key: "label", header: "الفترة" },
                      { key: "platform", header: "المنصة" },
                      { key: "start", header: "من" },
                      { key: "end", header: "إلى" },
                      { key: "orders", header: "الطلبات", type: "number" },
                      { key: "sales", header: "المبيعات", type: "money" },
                      { key: "commission", header: "العمولة", type: "money" },
                      { key: "commissionPct", header: "نسبة العمولة %", type: "percent" },
                      { key: "charges", header: "إجمالي الخصومات", type: "money" },
                      { key: "costPct", header: "تكلفة المنصة %", type: "percent" },
                    ],
                  },
                ],
                "tadqeeq-periods",
              )
            }
          >
            <Download className="size-3.5" />
            تصدير Excel
          </Button>
        }
      />

      <section className="overflow-hidden rounded-[10px] border border-border bg-white">
        <div data-scroll className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[13.5px]">
            <thead className="bg-surface-raised">
              <tr className="text-[11.5px] font-semibold text-muted-foreground">
                <Th>الفترة</Th>
                <Th>المدة</Th>
                <Th>المنصة</Th>
                <Th>الطلبات</Th>
                <Th>المبيعات</Th>
                <Th>العمولة</Th>
                <Th>نسبة العمولة</Th>
                <Th>إجمالي الخصومات</Th>
                <Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period, index) => {
                const active = selected?.id === period.id;
                return (
                  <tr
                    key={period.id}
                    onClick={() => setSelectedPeriodId(period.id)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-secondary/55",
                      active ? "bg-secondary" : index % 2 ? "bg-background/55" : "bg-white",
                    )}
                  >
                    <Td className={cn("font-semibold", active && "text-secondary-foreground")}>
                      {period.label}
                      {active ? (
                        <span className="me-2 rounded-[5px] bg-white px-1.5 py-0.5 text-[10px] text-primary">
                          معروضة
                        </span>
                      ) : null}
                    </Td>
                    <Td mono>
                      {arabicDate(period.period_start)} — {arabicDate(period.period_end)}
                    </Td>
                    <Td><PlatformName platform={period.platform} /></Td>
                    <Td mono>{count(period.summary?.orders ?? 0)}</Td>
                    <Td mono>{money(period.summary?.grossSales ?? 0)}</Td>
                    <Td mono>{money(period.summary?.commission ?? 0)}</Td>
                    <Td mono>{percent(period.summary?.commissionPct ?? 0)}</Td>
                    <Td mono>{money(period.summary?.totalCharges ?? 0)}</Td>
                    <Td>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          remove.mutate(period.id);
                        }}
                        aria-label="حذف"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap border-b border-border px-3.5 py-2.5 text-start">{children}</th>;
}

function Td({
  children,
  mono = false,
  className,
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap border-b border-border/60 px-3.5 py-2.5",
        className,
      )}
    >
      {mono ? <span className="num">{children}</span> : children}
    </td>
  );
}
