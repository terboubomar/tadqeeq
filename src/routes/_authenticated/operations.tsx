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

function dayRanges(days: number[]): string {
  const ranges: string[] = [];
  for (const day of days) {
    const previous = ranges.at(-1);
    if (!previous) {
      ranges.push(String(day));
      continue;
    }
    const parts = previous.split("–");
    const start = Number(parts[0] ?? day);
    const end = Number(parts[1] ?? parts[0] ?? day);
    if (day === end + 1) ranges[ranges.length - 1] = `${start}–${day}`;
    else ranges.push(String(day));
  }
  return ranges.join("، ");
}

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
    const uploaded = platforms.filter((row) => row.coveredDays > 0);
    const forecastAvailable =
      uploaded.length > 0 && uploaded.every((row) => row.forecastCharges !== null);
    return {
      orders: platforms.reduce((sum, row) => sum + row.orderCount, 0),
      sales: platforms.reduce((sum, row) => sum + row.grossSales, 0),
      charges: platforms.reduce((sum, row) => sum + row.chargesToDate, 0),
      forecast: forecastAvailable
        ? uploaded.reduce((sum, row) => sum + (row.forecastCharges ?? 0), 0)
        : null,
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
          {
            label: "المبيعات حتى الآن",
            value: sar(totals.sales),
            hint: `${count(totals.orders)} طلب`,
          },
          { label: "الخصومات والرسوم حتى الآن", value: sar(totals.charges) },
          {
            label: "الاستردادات المسجلة",
            value: sar(totals.refunds),
            hint: "ملف كيتا يوفّر العدد دون مبلغ الاسترداد",
          },
          {
            label: "الرسوم المتوقعة لنهاية الشهر",
            value: totals.forecast === null ? "—" : sar(totals.forecast),
            hint:
              totals.forecast === null
                ? "أكمل الأيام الناقصة لاحتساب التوقع"
                : "متوسط مكتمل من بداية الشهر × أيام الشهر",
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
          <table className="w-full min-w-[1240px] text-[12.5px]">
            <thead className="bg-muted/55 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">المنصة</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">
                  أيام مرفوعة
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">الطلبات</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">المبيعات</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">التوصيل</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">الخصومات</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">الاسترداد</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">العمولة</th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">
                  رسوم الدفع
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">
                  إجمالي الخصومات والرسوم
                </th>
                <th className="whitespace-nowrap px-4 py-2.5 text-center font-medium">
                  توقع نهاية الشهر
                </th>
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
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="num">
                      {count(row.coveredDays)} / {count(overview?.daysInMonth)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="num">{count(row.orderCount)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="num">{sar(row.grossSales)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="num">{sar(row.deliveryAmount)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="num">{sar(row.discountAmount)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="num inline-flex flex-col items-center gap-0.5">
                      <span>{sar(row.refundAmount)}</span>
                      <span className="text-[10.5px] text-muted-foreground">
                        {count(row.refundCount)} طلب
                      </span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="num">{sar(row.commissionAmount)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="num">{sar(row.paymentFeeAmount)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <span className="num">{sar(row.chargesToDate)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center font-semibold">
                    <span className="num">
                      {row.forecastCharges !== null ? (
                        sar(row.forecastCharges)
                      ) : row.forecastMissingDays.length ? (
                        <span className="inline-flex flex-col items-center gap-0.5">
                          <span>غير متاح</span>
                          <span className="text-[10.5px] font-normal text-muted-foreground">
                            الأيام الناقصة: {dayRanges(row.forecastMissingDays)}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-border bg-muted/30 px-5 py-3 text-[11.5px] text-muted-foreground">
          <p>
            كيتا يجمع خصومات التوصيل والقسائم والعروض في حقل واحد؛ يظهر المبلغ ضمن الخصومات ولا
            يتكرر في التوصيل.
          </p>
          <p>ملف هنقرستيشن لا يتضمن مبلغ توصيل منفصلاً، وملف كيتا لا يتضمن مبلغ الاسترداد.</p>
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
