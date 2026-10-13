import { PageHeader } from "@/components/workspace/PageKit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Download, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { arabicDate, count, money, percent } from "@/lib/format";
import { exportXlsx } from "@/lib/export";
import { periodLabelMismatch } from "@/lib/period-label-check";
import { listPeriodRenames, renamePeriod } from "@/lib/period-rename.functions";
import { deletePeriod, type StoredPeriod } from "@/lib/periods";
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
  const { can } = useWorkspaceAccess();
  const canRename = can("periods.reanalyze");
  const [renaming, setRenaming] = useState<StoredPeriod | null>(null);

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
        subtitle="اختر فترة لعرضها."
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
                    <Td className={cn("min-w-36 max-w-56 whitespace-normal font-semibold", active && "text-secondary-foreground")}>
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
                    <Td className="px-1">
                      <div className="flex items-center">
                        {canRename ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRenaming(period);
                            }}
                            aria-label="تغيير الاسم"
                            title="تغيير الاسم"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        ) : null}
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
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <RenamePeriodDialog period={renaming} onClose={() => setRenaming(null)} />
    </div>
  );
}

/** Rename a saved period: only its name changes, and each change is kept with who made it and when. */
function RenamePeriodDialog({ period, onClose }: { period: StoredPeriod | null; onClose: () => void }) {
  return (
    <Dialog open={period !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent dir="rtl" className="max-w-md text-right [&>button]:left-4 [&>button]:right-auto">
        {period ? <RenamePeriodForm key={period.id} period={period} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RenamePeriodForm({ period, onClose }: { period: StoredPeriod; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(period.label);
  const history = useQuery({
    queryKey: ["period-renames", period.id],
    queryFn: () => listPeriodRenames({ data: { periodId: period.id } }),
  });
  const save = useMutation({
    mutationFn: (label: string) => renamePeriod({ data: { periodId: period.id, label } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      await queryClient.invalidateQueries({ queryKey: ["period-renames", period.id] });
      toast.success("تم تغيير اسم الفترة");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const next = value.trim();
  const mismatch = next ? periodLabelMismatch(next, period.period_start, period.period_end) : null;
  const unchanged = next === period.label;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (next && !unchanged) save.mutate(next);
      }}
    >
      <div className="space-y-1.5 pt-2">
        <DialogTitle className="text-base">تغيير اسم الفترة</DialogTitle>
        <DialogDescription className="text-[13px] leading-6">
          يتغيّر الاسم فقط؛ الأرقام والتواريخ والملفات كما هي. نحفظ كل تغيير مع من غيّره ومتى.
        </DialogDescription>
      </div>
      <label className="block space-y-1.5">
        <span className="text-[12.5px] font-semibold">الاسم</span>
        <Input value={value} maxLength={120} onChange={(event) => setValue(event.target.value)} autoFocus />
        <span className="block text-[11.5px] text-muted-foreground">
          تواريخ الملف: {arabicDate(period.period_start)} — {arabicDate(period.period_end)}
        </span>
      </label>
      {mismatch ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-[12.5px] leading-5 text-secondary-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            الاسم يذكر {mismatch.labelMonths.join(" و")} والملف يغطي {mismatch.fileMonths.join(" و")}.
          </span>
        </p>
      ) : null}

      <div className="space-y-1.5">
        <h3 className="text-[12.5px] font-semibold">سجل الاسم</h3>
        {history.isLoading ? (
          <p className="text-[12px] text-muted-foreground">جارٍ التحميل…</p>
        ) : history.isError ? (
          <p className="text-[12px] text-muted-foreground">تعذّر تحميل السجل.</p>
        ) : history.data?.length ? (
          <ol className="max-h-40 space-y-1.5 overflow-y-auto text-[12px]">
            {history.data.map((entry) => (
              <li key={`${entry.at}-${entry.to}`} className="rounded-md border border-border px-2.5 py-1.5">
                <span className="text-muted-foreground">«{entry.from}»</span> ← <span className="font-semibold">«{entry.to}»</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {entry.by} · {arabicDate(entry.at)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[12px] text-muted-foreground">لم يتغيّر الاسم منذ الرفع.</p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:justify-start">
        <Button type="submit" disabled={!next || unchanged || save.isPending}>
          {save.isPending ? "جارٍ الحفظ…" : "حفظ الاسم"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          إلغاء
        </Button>
      </DialogFooter>
    </form>
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
