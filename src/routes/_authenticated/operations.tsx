import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { NumberTiles, PageHeader } from "@/components/workspace/PageKit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { count, sar } from "@/lib/format";
import { getOperationMonth, importOperationFile } from "@/lib/operations/operations.functions";
import type { OperationSourceKind } from "@/lib/operations/types";
import { MAX_UPLOAD_SIZE_LABEL, uploadSizeError } from "@/lib/upload-validation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/operations")({
  head: () => ({
    meta: [
      { title: "العمليات اليومية · تدقيق" },
      {
        name: "description",
        content: "رفع الطلبات اليومية ومتابعة المصروفات والتسوية الشهرية المتوقعة.",
      },
    ],
  }),
  component: OperationsPage,
});

const todayMonth = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
};

const SOURCES: Array<{
  kind: OperationSourceKind;
  platform: "hungerstation" | "keeta" | "jahez";
  title: string;
  note: string;
  accept: string;
}> = [
  {
    kind: "hungerstation_orders",
    platform: "hungerstation",
    title: "طلبات هنقرستيشن",
    note: "ملف Order history اليومي",
    accept: ".xlsx,.xls",
  },
  {
    kind: "keeta_orders",
    platform: "keeta",
    title: "طلبات كيتا",
    note: "ملف Recent Orders اليومي",
    accept: ".xlsx,.xls",
  },
  {
    kind: "jahez_orders",
    platform: "jahez",
    title: "طلبات جاهز",
    note: "تقرير الطلبات المالي اليومي",
    accept: ".csv",
  },
  {
    kind: "jahez_adjustments",
    platform: "jahez",
    title: "استردادات جاهز",
    note: "ملف الخصومات والتعويضات المنفصل",
    accept: ".csv",
  },
];

const sourceLabels = Object.fromEntries(
  SOURCES.map((source) => [source.kind, source.title]),
) as Record<OperationSourceKind, string>;

function OperationsPage() {
  const { can } = useWorkspaceAccess();
  const canUpload = can("imports.create");
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(todayMonth);
  const [activeUpload, setActiveUpload] = useState<OperationSourceKind | null>(null);
  const query = useQuery({
    queryKey: ["operation-month", month],
    queryFn: () => getOperationMonth({ data: { month } }),
  });
  const upload = useMutation({
    mutationFn: async ({ file, sourceKind }: { file: File; sourceKind: OperationSourceKind }) => {
      const error = uploadSizeError(file.size);
      if (error) throw new Error(error);
      const form = new FormData();
      form.set("file", file);
      form.set("sourceKind", sourceKind);
      setActiveUpload(sourceKind);
      return importOperationFile({ data: form });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["operation-month"] });
      if (result.status === "duplicate") toast.info("هذا الملف مرفوع مسبقاً ولم تُكرر بياناته.");
      else if (result.unmatchedAdjustments > 0)
        toast.warning(
          `حُفظ الملف مع ${count(result.unmatchedAdjustments)} حركة جاهز لم تجد طلباً مطابقاً.`,
        );
      else toast.success(`حُفظت بيانات ${result.businessDate} بنجاح.`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذّر رفع ملف العمليات."),
    onSettled: () => setActiveUpload(null),
  });

  const overview = query.data;
  const totals = useMemo(() => {
    const platforms = overview?.platforms ?? [];
    return {
      orders: platforms.reduce((sum, row) => sum + row.orderCount, 0),
      charges: platforms.reduce((sum, row) => sum + row.chargesToDate, 0),
      forecast: platforms.reduce((sum, row) => sum + row.forecastCharges, 0),
      refunds: platforms.reduce((sum, row) => sum + row.refundAmount, 0),
    };
  }, [overview]);

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "العمليات اليومية" }]}
        title="العمليات اليومية"
        subtitle="ارفع ملفات يوم واحد. يعاد احتساب الشهر من أحدث نسخة لكل منصة وتاريخ دون تكرار الطلبات."
        aside={
          <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            الشهر
            <Input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="num h-9 w-[152px] bg-card"
            />
          </label>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border bg-ink px-5 py-4 text-ink-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-[16px] font-bold">سجل الرفع اليومي</h2>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                أربع مصادر مستقلة. ملف استردادات جاهز اختياري.
              </p>
            </div>
            <span className="text-[11.5px] text-ink-muted">
              الحد الأقصى للملف {MAX_UPLOAD_SIZE_LABEL}
            </span>
          </div>
        </div>
        <div className="divide-y divide-border">
          {SOURCES.map((source) => {
            const busy = activeUpload === source.kind;
            const latest = overview?.imports.find((item) => item.sourceKind === source.kind);
            return (
              <div
                key={source.kind}
                className="grid items-center gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)_auto] sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background">
                    <PlatformIcon platform={source.platform} className="size-5 rounded" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[14px] font-bold">{source.title}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{source.note}</p>
                  </div>
                </div>
                <div className="min-w-0 text-[12px]">
                  {latest ? (
                    <div className="flex items-center gap-2 text-success">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span className="truncate">
                        آخر رفع {latest.businessDate} · {count(latest.rowCount)} صف
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <FileSpreadsheet className="size-4 shrink-0" />
                      لم يرفع هذا المصدر في الشهر
                    </div>
                  )}
                </div>
                {canUpload ? (
                  <label
                    className={cn(
                      "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 text-[12.5px] font-medium hover:bg-muted",
                      busy && "pointer-events-none opacity-60",
                    )}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    {busy ? "جارٍ الحفظ" : "رفع الملف"}
                    <input
                      type="file"
                      accept={source.accept}
                      className="sr-only"
                      disabled={upload.isPending}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) upload.mutate({ file, sourceKind: source.kind });
                      }}
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {query.isError ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive-soft p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            {query.error instanceof Error ? query.error.message : "تعذّر تحميل العمليات."}
          </div>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            <RefreshCw className="size-3.5" />
            إعادة المحاولة
          </Button>
        </div>
      ) : null}

      <NumberTiles
        items={[
          { label: "طلبات الشهر حتى الآن", value: count(totals.orders) },
          { label: "الخصومات والرسوم حتى الآن", value: sar(totals.charges) },
          { label: "الاستردادات المسجلة", value: sar(totals.refunds) },
          {
            label: "الرسوم المتوقعة لنهاية الشهر",
            value: sar(totals.forecast),
            hint: "متوسط الأيام المرفوعة × أيام الشهر",
            tone: "gold",
          },
        ]}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="font-display text-[15px] font-bold">ملخص الشهر حسب المنصة</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              التوقع تشغيلي وغير بديل عن مطابقة الفاتورة الرسمية.
            </p>
          </div>
          {query.isFetching ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-[12.5px]">
            <thead className="bg-muted/55 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">المنصة</th>
                <th className="px-4 py-2.5 text-end font-medium">أيام مرفوعة</th>
                <th className="px-4 py-2.5 text-end font-medium">الطلبات</th>
                <th className="px-4 py-2.5 text-end font-medium">التوصيل</th>
                <th className="px-4 py-2.5 text-end font-medium">شكاوى / استردادات</th>
                <th className="px-4 py-2.5 text-end font-medium">الرسوم الحالية</th>
                <th className="px-4 py-2.5 text-end font-medium">توقع نهاية الشهر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(overview?.platforms ?? []).map((row) => (
                <tr key={row.platform}>
                  <td className="px-4 py-3 font-semibold">
                    <span className="inline-flex items-center gap-2">
                      <PlatformIcon platform={row.platform} className="size-4 rounded" />
                      <PlatformName platform={row.platform} />
                    </span>
                  </td>
                  <td className="num px-4 py-3 text-end">
                    {count(row.coveredDays)} / {count(overview?.daysInMonth)}
                  </td>
                  <td className="num px-4 py-3 text-end">{count(row.orderCount)}</td>
                  <td className="num px-4 py-3 text-end">{sar(row.deliveryAmount)}</td>
                  <td className="num px-4 py-3 text-end">
                    {count(row.complaintCount)} / {count(row.refundCount)}
                  </td>
                  <td className="num px-4 py-3 text-end">{sar(row.chargesToDate)}</td>
                  <td className="num px-4 py-3 text-end font-semibold">
                    {row.coveredDays ? sar(row.forecastCharges) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="font-display text-[15px] font-bold">سجل الملفات</h2>
        </div>
        {overview?.imports.length ? (
          <div className="divide-y divide-border">
            {overview.imports.slice(0, 20).map((item) => (
              <div
                key={item.id}
                className="grid gap-1 px-5 py-3 text-[12.5px] sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.originalName}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {sourceLabels[item.sourceKind]}
                  </p>
                </div>
                <span className="num text-muted-foreground">{item.businessDate}</span>
                <span className="num text-muted-foreground">{count(item.rowCount)} صف</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            لا توجد ملفات مرفوعة لهذا الشهر.
          </p>
        )}
      </section>
    </div>
  );
}
