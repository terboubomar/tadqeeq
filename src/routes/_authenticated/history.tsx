import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { arabicDate, count, money, percent } from "@/lib/format";
import { deletePeriod } from "@/lib/periods";
import { setSelectedPeriodId, useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";

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
    onSuccess: async () => {
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
      <header>
        <h1 className="text-2xl font-black">الفترات السابقة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اضغط على أي فترة لعرضها في باقي التقارير.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {periods.map((period) => {
          const active = selected?.id === period.id;
          return (
            <article
              key={period.id}
              className={cn(
                "panel cursor-pointer p-5 transition-colors",
                active ? "border-primary/60" : "hover:border-primary/30",
              )}
              onClick={() => setSelectedPeriodId(period.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold">{period.label}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {arabicDate(period.period_start)} — {arabicDate(period.period_end)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove.mutate(period.id);
                  }}
                  aria-label="حذف"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <Row label="الطلبات" value={count(period.summary?.orders ?? 0)} />
                <Row label="المبيعات" value={money(period.summary?.grossSales ?? 0)} />
                <Row label="العمولة" value={money(period.summary?.commission ?? 0)} />
                <Row label="نسبة العمولة" value={percent(period.summary?.commissionPct ?? 0)} />
                <Row label="إجمالي الخصومات" value={money(period.summary?.totalCharges ?? 0)} />
              </dl>

              {active ? (
                <p className="mt-4 text-xs font-semibold text-primary">الفترة المعروضة حالياً</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num font-semibold">{value}</dd>
    </div>
  );
}
