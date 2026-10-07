import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { PageHeader } from "@/components/workspace/PageKit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { count, sar } from "@/lib/format";
import {
  deleteOperationImport,
  getOperationMonth,
  importOperationFile,
} from "@/lib/operations/operations.functions";
import type {
  OperationImportHistoryItem,
  OperationPlatform,
  OperationPlatformMonth,
  OperationSourceKind,
} from "@/lib/operations/types";
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
    note: "ملف Orders اليومي",
    accept: ".csv,.xlsx,.xls",
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

const PLATFORMS: Array<{
  id: OperationPlatform;
  description: string;
}> = [
  { id: "hungerstation", description: "Orders والخصومات والأرباح والتحويلات" },
  { id: "keeta", description: "الطلبات والعروض والعمولات والمصروفات" },
  { id: "jahez", description: "الطلبات مع ملف الاستردادات المنفصل" },
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

type DetailMetric = { label: string; value: string; hint?: string };

function platformMetrics(row: OperationPlatformMonth): DetailMetric[] {
  const common: DetailMetric[] = [
    { label: "الطلبات", value: count(row.orderCount) },
    { label: "المبيعات", value: sar(row.grossSales) },
  ];
  const endingForecast: DetailMetric = {
    label: "توقع خصومات ورسوم الشهر",
    value: row.forecastCharges === null ? "غير متاح" : sar(row.forecastCharges),
    hint:
      row.forecastCharges === null && row.forecastMissingDays.length
        ? `الأيام الناقصة: ${dayRanges(row.forecastMissingDays)}`
        : undefined,
  };

  if (row.platform === "hungerstation")
    return [
      ...common,
      { label: "Discount Funded by you", value: sar(row.merchantFundedDiscountAmount) },
      { label: "Voucher Funded by you", value: sar(row.merchantFundedVoucherAmount) },
      { label: "العمولة", value: sar(row.commissionAmount) },
      { label: "رسوم الدفع", value: sar(row.paymentFeeAmount) },
      { label: "الأرباح التقديرية", value: sar(row.estimatedEarningsAmount) },
      { label: "إجمالي التحويل Payout", value: sar(row.settlementToDate) },
      {
        label: "الاستردادات",
        value: sar(row.refundAmount),
        hint: `${count(row.refundCount)} طلب`,
      },
      { label: "إجمالي الخصومات والرسوم", value: sar(row.chargesToDate) },
      endingForecast,
    ];

  if (row.platform === "keeta")
    return [
      ...common,
      { label: "Delivery fee", value: sar(row.deliveryAmount) },
      { label: "Promotion expense", value: sar(row.merchantFundedDiscountAmount) },
      { label: "العمولة", value: sar(row.commissionAmount) },
      { label: "Other expenses", value: sar(row.paymentFeeAmount) },
      { label: "Earnings", value: sar(row.settlementToDate) },
      {
        label: "الاستردادات",
        value: sar(row.refundAmount),
        hint: `${count(row.refundCount)} طلب — الملف لا يحدد المبلغ`,
      },
      { label: "إجمالي الخصومات والرسوم", value: sar(row.chargesToDate) },
      endingForecast,
    ];

  return [
    ...common,
    { label: "التوصيل", value: sar(row.deliveryAmount) },
    { label: "الخصومات", value: sar(row.discountAmount) },
    { label: "العمولة", value: sar(row.commissionAmount) },
    { label: "رسوم الدفع", value: sar(row.paymentFeeAmount) },
    { label: "إجمالي التحويل", value: sar(row.settlementToDate) },
    {
      label: "الاستردادات",
      value: sar(row.refundAmount),
      hint: `${count(row.refundCount)} حركة`,
    },
    { label: "إجمالي الخصومات والرسوم", value: sar(row.chargesToDate) },
    endingForecast,
  ];
}

function OperationsPage() {
  const { can } = useWorkspaceAccess();
  const canUpload = can("imports.create");
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(todayMonth);
  const [activePlatform, setActivePlatform] = useState<OperationPlatform | null>(null);
  const [activeUpload, setActiveUpload] = useState<OperationSourceKind | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OperationImportHistoryItem | null>(null);
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
  const removeImport = useMutation({
    mutationFn: (importId: string) => deleteOperationImport({ data: { importId } }),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["operation-month"] });
      toast.success("حُذف الملف وبياناته التشغيلية.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذّر حذف ملف العمليات."),
  });

  const overview = query.data;

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

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-ink px-5 py-4 text-ink-foreground">
          <div>
            <h2 className="font-display text-[16px] font-bold">ملفات المنصات</h2>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              افتح منصة واحدة لرفع ملفاتها ومراجعة أرقامها.
            </p>
          </div>
          <span className="text-[11.5px] text-ink-muted">الحد الأقصى {MAX_UPLOAD_SIZE_LABEL}</span>
        </div>

        <div className="divide-y divide-border">
          {PLATFORMS.map((platform) => {
            const row = overview?.platforms.find((item) => item.platform === platform.id);
            const isOpen = activePlatform === platform.id;
            const platformSources = SOURCES.filter((source) => source.platform === platform.id);
            const history = (overview?.imports ?? []).filter(
              (item) => item.platform === platform.id,
            );
            return (
              <div key={platform.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setActivePlatform(isOpen ? null : platform.id)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-start outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/45 sm:px-5"
                >
                  <span className="grid size-10 place-items-center rounded-xl border border-border bg-background">
                    <PlatformIcon platform={platform.id} className="size-6 rounded" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-display text-[15px] font-bold">
                        <PlatformName platform={platform.id} />
                      </span>
                      {row?.coveredDays ? (
                        <span className="num text-[11.5px] text-muted-foreground">
                          {count(row.coveredDays)} / {count(overview?.daysInMonth)} يوم ·{" "}
                          {count(row.orderCount)} طلب
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-muted-foreground">
                          لا توجد ملفات لهذا الشهر
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {platform.description}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                {isOpen ? (
                  <div className="border-t border-border bg-background/55">
                    <div className="px-4 py-5 sm:px-5">
                      <div className="mb-5">
                        <h3 className="text-[13px] font-semibold">رفع الملفات</h3>
                        <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                          {platformSources.map((source) => {
                            const busy = activeUpload === source.kind;
                            const latest = history.find((item) => item.sourceKind === source.kind);
                            return (
                              <div
                                key={source.kind}
                                className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto]"
                              >
                                <div className="min-w-0">
                                  <p className="text-[13px] font-medium">{source.title}</p>
                                  <p className="truncate text-[11.5px] text-muted-foreground">
                                    {source.note}
                                  </p>
                                </div>
                                {latest ? (
                                  <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-success">
                                    <CheckCircle2 className="size-4 shrink-0" />
                                    <span className="truncate">
                                      {latest.businessDate} · {count(latest.rowCount)} صف
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                                    <FileSpreadsheet className="size-4 shrink-0" />
                                    لم يرفع بعد
                                  </div>
                                )}
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
                                    {busy ? "جارٍ الحفظ" : latest ? "رفع نسخة جديدة" : "رفع الملف"}
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
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-[13px] font-semibold">تفاصيل الشهر</h3>
                          {query.isFetching ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          ) : null}
                        </div>
                        {row?.coveredDays ? (
                          <div className="mt-2 grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
                            {platformMetrics(row).map((metric) => (
                              <div
                                key={metric.label}
                                className="min-w-0 border-b border-border px-4 py-3.5 last:border-b-0 sm:border-e sm:[&:nth-child(even)]:border-e-0 lg:[&:nth-child(even)]:border-e lg:[&:nth-child(4n)]:border-e-0"
                              >
                                <p className="text-[11.5px] text-muted-foreground">
                                  {metric.label}
                                </p>
                                <p className="num mt-1 text-[15px] font-semibold">{metric.value}</p>
                                {metric.hint ? (
                                  <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                                    {metric.hint}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-xl border border-dashed border-border px-4 py-7 text-center text-[12.5px] text-muted-foreground">
                            ارفع أول ملف لعرض تفاصيل هذه المنصة.
                          </div>
                        )}
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          التوقع تشغيلي ويظهر فقط عند اكتمال الأيام من بداية الشهر.
                        </p>
                      </div>

                      {history.length ? (
                        <div className="mt-5">
                          <h3 className="text-[13px] font-semibold">سجل ملفات المنصة</h3>
                          <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                            {history.slice(0, 10).map((item) => (
                              <div
                                key={item.id}
                                className="grid grid-cols-[minmax(0,1fr)_auto] gap-1 px-4 py-3 text-[12px] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-4"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{item.originalName}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {sourceLabels[item.sourceKind]}
                                  </p>
                                </div>
                                <span className="num text-muted-foreground">
                                  {item.businessDate}
                                </span>
                                <span className="num text-muted-foreground">
                                  {count(item.rowCount)} صف
                                </span>
                                {canUpload ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    aria-label={`حذف ${item.originalName}`}
                                    title="حذف الملف"
                                    disabled={removeImport.isPending}
                                    onClick={() => setDeleteTarget(item)}
                                  >
                                    {removeImport.isPending &&
                                    removeImport.variables === item.id ? (
                                      <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="size-4" />
                                    )}
                                  </Button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !removeImport.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl" className="max-w-md">
          <AlertDialogHeader className="text-start">
            <AlertDialogTitle className="text-start">حذف ملف العمليات؟</AlertDialogTitle>
            <AlertDialogDescription className="text-start leading-6">
              سيُحذف ملف{" "}
              <span className="font-medium text-foreground">{deleteTarget?.originalName}</span>
              {deleteTarget ? ` وبيانات يوم ${deleteTarget.businessDate} المشتقة منه` : ""}. لا يؤثر
              ذلك في الفواتير أو المحاسبة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel disabled={removeImport.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteTarget || removeImport.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) removeImport.mutate(deleteTarget.id);
              }}
            >
              {removeImport.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              حذف الملف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
