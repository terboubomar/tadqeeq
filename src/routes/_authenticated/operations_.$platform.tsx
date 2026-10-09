import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
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
import { PageHeader } from "@/components/workspace/PageKit";
import { count, percent, sar } from "@/lib/format";
import {
  currentOperationMonth,
  OPERATION_PLATFORMS,
  OPERATION_SOURCES,
  operationSourceLabels,
} from "@/lib/operations/catalog";
import { operationCommissionRatio, operationCostRatio } from "@/lib/operations/details";
import {
  deleteOperationImport,
  getOperationImportDetail,
  getOperationMonth,
  importOperationFile,
} from "@/lib/operations/operations.functions";
import type {
  OperationImportHistoryItem,
  OperationOrderDetail,
  OperationPlatform,
  OperationSourceKind,
} from "@/lib/operations/types";
import { MAX_UPLOAD_SIZE_LABEL, uploadSizeError } from "@/lib/upload-validation";
import { cn } from "@/lib/utils";

const PLATFORM_IDS = new Set<OperationPlatform>(["hungerstation", "keeta", "jahez"]);
const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/operations_/$platform")({
  validateSearch: (search: Record<string, unknown>): { month?: string } => ({
    month:
      typeof search["month"] === "string" && /^\d{4}-\d{2}$/.test(search["month"])
        ? search["month"]
        : undefined,
  }),
  head: () => ({ meta: [{ title: "تفاصيل المنصة · العمليات اليومية · تدقيق" }] }),
  component: PlatformOperationsPage,
});

function PlatformOperationsPage() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const platform = PLATFORM_IDS.has(params.platform as OperationPlatform)
    ? (params.platform as OperationPlatform)
    : null;
  if (!platform) return <InvalidPlatform />;
  return <PlatformWorkspace platform={platform} initialMonth={search.month} />;
}

function PlatformWorkspace({
  platform,
  initialMonth,
}: {
  platform: OperationPlatform;
  initialMonth?: string;
}) {
  const { can } = useWorkspaceAccess();
  const canUpload = can("imports.create");
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(initialMonth ?? currentOperationMonth());
  const [activeUpload, setActiveUpload] = useState<OperationSourceKind | null>(null);
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<OperationImportHistoryItem | null>(null);
  const detailAnchor = useRef<HTMLDivElement>(null);

  function openImport(importId: string) {
    setSelectedImportId(importId);
    setPage(1);
    window.requestAnimationFrame(() =>
      detailAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const monthQuery = useQuery({
    queryKey: ["operation-month", month],
    queryFn: () => getOperationMonth({ data: { month } }),
  });
  const row = monthQuery.data?.platforms.find((item) => item.platform === platform);
  const history = useMemo(
    () => (monthQuery.data?.imports ?? []).filter((item) => item.platform === platform),
    [monthQuery.data?.imports, platform],
  );
  const sources = OPERATION_SOURCES.filter((source) => source.platform === platform);
  const selected = history.find((item) => item.id === selectedImportId) ?? null;

  const detailQuery = useQuery({
    queryKey: ["operation-import-detail", selectedImportId, platform, page],
    queryFn: () =>
      getOperationImportDetail({
        data: { importId: selectedImportId!, platform, page, pageSize: PAGE_SIZE },
      }),
    enabled: Boolean(selectedImportId),
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
      if (result.status === "duplicate") toast.info("هذا الملف مرفوع مسبقاً وتم تحديث ملخصه.");
      else if (result.unmatchedAdjustments > 0)
        toast.warning(
          `حُفظ الملف مع ${count(result.unmatchedAdjustments)} حركة لم تجد طلباً مطابقاً.`,
        );
      else toast.success(`حُفظت بيانات ${result.businessDate} بنجاح.`);
      openImport(result.importId);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذّر رفع ملف العمليات."),
    onSettled: () => setActiveUpload(null),
  });

  const removeImport = useMutation({
    mutationFn: (importId: string) => deleteOperationImport({ data: { importId } }),
    onSuccess: async (_, importId) => {
      if (selectedImportId === importId) setSelectedImportId(null);
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["operation-month"] });
      toast.success("حُذف الملف وبياناته التشغيلية.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "تعذّر حذف ملف العمليات."),
  });

  const costRatio = operationCostRatio(row?.chargesToDate ?? 0, row?.grossSales ?? 0);
  const commissionRatio = operationCommissionRatio(
    row?.commissionAmount ?? 0,
    row?.grossSales ?? 0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[
          { label: "الرئيسية", to: "/dashboard" },
          { label: "العمليات اليومية", to: "/operations" },
          { label: platformLabel(platform) },
        ]}
        title={
          <span className="inline-flex items-center gap-2.5">
            <PlatformIcon platform={platform} className="size-8 rounded-lg" />
            <PlatformName platform={platform} />
          </span>
        }
        subtitle="ارفع الملف اليومي، راجع مؤشرات التكلفة، ثم افتح أي ملف لتدقيق الطلبات المستخدمة."
        aside={
          <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            الشهر
            <Input
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setSelectedImportId(null);
                setPage(1);
              }}
              className="num h-9 w-[152px] bg-card"
            />
          </label>
        }
      />

      <nav
        aria-label="منصات التوصيل"
        className="flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-card p-1.5"
      >
        {OPERATION_PLATFORMS.map((item) => (
          <Link
            key={item.id}
            to="/operations/$platform"
            params={{ platform: item.id }}
            search={{ month }}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[12.5px] font-medium transition-colors",
              item.id === platform
                ? "bg-ink text-ink-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <PlatformIcon platform={item.id} /> {platformLabel(item.id)}
          </Link>
        ))}
      </nav>

      {monthQuery.isError ? (
        <ErrorNotice error={monthQuery.error} retry={() => void monthQuery.refetch()} />
      ) : null}

      <section className="grid overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="المبيعات"
          value={sar(row?.grossSales)}
          hint={`${count(row?.orderCount)} طلب${row?.cancellationCount ? ` · ${count(row.cancellationCount)} ملغى` : ""}`}
          strong
        />
        <Kpi label="تكلفة المنصة" value={percent(costRatio)} hint={sar(row?.chargesToDate)} />
        <Kpi
          label="نسبة العمولة"
          value={percent(commissionRatio)}
          hint={sar(row?.commissionAmount)}
        />
        <Kpi
          label="صافي التحويل"
          value={sar(row?.settlementToDate)}
          hint={`حتى ${count(row?.coveredDays)} يوم${row?.cancelledEarningsAmount ? ` · منه ${sar(row.cancelledEarningsAmount)} من طلبات ملغاة` : ""}`}
        />
        <Kpi
          label="توقع نهاية الشهر"
          value={row?.forecastSettlement == null ? "غير متاح" : sar(row.forecastSettlement)}
          hint="توقع تشغيلي"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-ink px-5 py-4 text-ink-foreground">
          <div>
            <h2 className="font-display text-[15px] font-bold">رفع الملفات اليومية</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              ملف مستقل لكل يوم · الحد الأقصى {MAX_UPLOAD_SIZE_LABEL}
            </p>
          </div>
          {monthQuery.isFetching ? (
            <Loader2 className="size-4 animate-spin text-ink-muted" />
          ) : null}
        </div>
        <div className="divide-y divide-border">
          {sources.map((source) => {
            const latest = history.find((item) => item.sourceKind === source.kind && item.current);
            const busy = activeUpload === source.kind;
            return (
              <div
                key={source.kind}
                className="grid items-center gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(170px,0.65fr)_auto] sm:px-5"
              >
                <div>
                  <p className="text-[13px] font-semibold">{source.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{source.note}</p>
                </div>
                {latest ? (
                  <button
                    type="button"
                    onClick={() => openImport(latest.id)}
                    className="flex min-w-0 items-center gap-2 text-start text-[11.5px] text-success hover:underline"
                  >
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span className="truncate">
                      آخر ملف {latest.businessDate} · {count(latest.rowCount)} صف
                    </span>
                  </button>
                ) : (
                  <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <FileSpreadsheet className="size-4" />
                    لم يرفع بعد
                  </span>
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
                    {busy ? "جارٍ الحفظ" : "رفع ملف"}
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

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-display text-[15px] font-bold">سجل الملفات</h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            اضغط على الملف لفتح الطلبات والقيم التي دخلت في المؤشرات.
          </p>
        </div>
        {history.length ? (
          <div className="divide-y divide-border">
            {history.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "grid items-center gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.5fr)_140px_110px_auto] sm:px-5",
                  selectedImportId === item.id && "bg-primary/5",
                )}
              >
                <button
                  type="button"
                  onClick={() => openImport(item.id)}
                  className="min-w-0 text-start"
                >
                  <span className="block truncate text-[12.5px] font-medium">
                    {item.originalName}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                    {operationSourceLabels[item.sourceKind]}
                    {item.current ? "" : " · مستبدل بملف أحدث لليوم نفسه، لا يدخل في المؤشرات"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openImport(item.id)}
                  className="num text-start text-[12px] text-muted-foreground"
                >
                  {item.businessDate}
                </button>
                <button
                  type="button"
                  onClick={() => openImport(item.id)}
                  className="num text-start text-[12px] text-muted-foreground"
                >
                  {count(item.rowCount)} صف
                </button>
                <div className="flex items-center justify-end gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => openImport(item.id)}>
                    فتح التفاصيل <ArrowLeft className="size-3.5" />
                  </Button>
                  {canUpload ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`حذف ${item.originalName}`}
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-[12.5px] text-muted-foreground">
            لا توجد ملفات لهذه المنصة خلال الشهر المحدد.
          </div>
        )}
      </section>

      <div ref={detailAnchor} className="scroll-mt-4">
        {selectedImportId ? (
          <OrderLedger
            selected={selected}
            platform={platform}
            query={detailQuery}
            page={page}
            setPage={setPage}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-10 text-center">
            <FileSpreadsheet className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-[13px] font-medium">اختر ملفاً لعرض الطلبات</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              ستظهر تفاصيل المبيعات والتوصيل والخصومات والعمولات والرسوم لكل طلب.
            </p>
          </div>
        )}
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !removeImport.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف ملف العمليات؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحذف «{deleteTarget?.originalName}» وكل صفوفه التشغيلية. لا يؤثر ذلك في محرك
              المحاسبة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeImport.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeImport.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) removeImport.mutate(deleteTarget.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeImport.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}{" "}
              حذف الملف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrderLedger({
  selected,
  platform,
  query,
  page,
  setPage,
}: {
  selected: OperationImportHistoryItem | null;
  platform: OperationPlatform;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getOperationImportDetail>>>>;
  page: number;
  setPage: (page: number) => void;
}) {
  const detail = query.data;
  const totalPages = Math.max(1, Math.ceil((detail?.totalRows ?? 0) / PAGE_SIZE));
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-display text-[15px] font-bold">
            {selected?.originalName ?? "تفاصيل الملف"}
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {selected
              ? `${selected.businessDate} · ${operationSourceLabels[selected.sourceKind]} · ${count(selected.rowCount)} صف`
              : ""}
          </p>
        </div>
        {query.isFetching ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {query.isError ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : null}
      {detail?.orders.length ? <OrdersTable rows={detail.orders} platform={platform} /> : null}
      {detail?.adjustments.length ? <AdjustmentsTable rows={detail.adjustments} /> : null}
      {!query.isLoading && detail && detail.totalRows === 0 ? (
        <div className="px-5 py-10 text-center text-[12.5px] text-muted-foreground">
          لا توجد صفوف مرتبطة بهذه النسخة. قد تكون نسخة أقدم استُبدلت بملف أحدث لليوم نفسه.
        </div>
      ) : null}
      {query.isLoading ? (
        <div className="grid min-h-48 place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {detail && detail.totalRows > PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="num text-[11.5px] text-muted-foreground">
            صفحة {count(page)} من {count(totalPages)} · {count(detail.totalRows)} صف
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="الصفحة السابقة"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage(page - 1)}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="الصفحة التالية"
              disabled={page >= totalPages || query.isFetching}
              onClick={() => setPage(page + 1)}
            >
              <ChevronLeft />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function OrdersTable({
  rows,
  platform,
}: {
  rows: OperationOrderDetail[];
  platform: OperationPlatform;
}) {
  const columns = orderMoneyColumns(platform);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1500px] border-collapse text-start text-[11.5px]">
        <thead className="bg-muted/55 text-muted-foreground">
          <tr>
            {[
              "رقم الطلب",
              "التاريخ",
              "الفرع",
              "الحالة",
              ...columns.map((column) => column.label),
            ].map((label) => (
              <th
                key={label}
                className="whitespace-nowrap border-b border-border px-3 py-2.5 text-start font-medium"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.orderId} className="hover:bg-muted/25">
              <td className="whitespace-nowrap px-3 py-3 font-medium"><span className="num">{row.orderId}</span></td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                <span className="num">{row.businessDate}</span>
              </td>
              <td
                className="max-w-44 truncate px-3 py-3"
                title={row.branchName ?? row.branchId ?? undefined}
              >
                {row.branchName ?? row.branchId ?? "—"}
              </td>
              <td
                className="max-w-36 truncate px-3 py-3 text-muted-foreground"
                title={row.status ?? undefined}
              >
                {row.status ?? "—"}
              </td>
              {columns.map((column) => (
                <MoneyCell
                  key={column.key}
                  value={row[column.key]}
                  strong={column.strong}
                  warning={
                    column.key === "refundAmount" && (row.refundAmount !== 0 || row.complaint)
                  }
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-4 py-2.5 text-[10.5px] text-muted-foreground">
        القيم أعلاه مأخوذة من صفوف ملف {platformLabel(platform)} المحفوظة؛ صفر يعني أن الحقل غير
        موجود أو بلا قيمة في المصدر.
      </p>
    </div>
  );
}

type MoneyKey = {
  [Key in keyof OperationOrderDetail]: OperationOrderDetail[Key] extends number ? Key : never;
}[keyof OperationOrderDetail];

function orderMoneyColumns(platform: OperationPlatform): Array<{
  key: MoneyKey;
  label: string;
  strong?: boolean;
}> {
  const ending: Array<{ key: MoneyKey; label: string; strong?: boolean }> = [
    { key: "refundAmount", label: "الاسترداد" },
    { key: "chargesTotal", label: "إجمالي التكلفة", strong: true },
    { key: "estimatedEarningsAmount", label: "الأرباح المقدرة" },
    { key: "settlementAmount", label: "التحويل", strong: true },
  ];
  if (platform === "hungerstation")
    return [
      { key: "subtotalAmount", label: "Subtotal" },
      { key: "packagingAmount", label: "التغليف" },
      { key: "grossSales", label: "المبيعات", strong: true },
      { key: "deliveryAmount", label: "توصيل ممول منك" },
      { key: "merchantFundedDiscountAmount", label: "خصم ممول منك" },
      { key: "merchantFundedVoucherAmount", label: "قسيمة ممولة منك" },
      { key: "commissionAmount", label: "العمولة" },
      { key: "paymentFeeAmount", label: "رسوم الدفع" },
      { key: "otherFeeAmount", label: "رسوم أخرى" },
      ...ending,
    ];
  if (platform === "keeta")
    return [
      { key: "subtotalAmount", label: "المبيعات الأصلية" },
      { key: "grossSales", label: "المبيعات", strong: true },
      { key: "deliveryAmount", label: "رسوم التوصيل" },
      { key: "merchantFundedDiscountAmount", label: "Promotion expense" },
      { key: "commissionAmount", label: "العمولة" },
      { key: "paymentFeeAmount", label: "رسوم الدفع" },
      { key: "otherFeeAmount", label: "Other expenses" },
      ...ending,
    ];
  return [
    { key: "subtotalAmount", label: "قيمة الطلب" },
    { key: "grossSales", label: "المبيعات", strong: true },
    { key: "deliveryAmount", label: "صافي التوصيل" },
    { key: "merchantFundedDiscountAmount", label: "عرض المطعم" },
    { key: "merchantFundedVoucherAmount", label: "قسيمة التوصيل" },
    { key: "commissionAmount", label: "العمولة" },
    { key: "paymentFeeAmount", label: "رسوم الدفع" },
    ...ending,
  ];
}

function AdjustmentsTable({
  rows,
}: {
  rows: NonNullable<Awaited<ReturnType<typeof getOperationImportDetail>>["adjustments"]>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-start text-[11.5px]">
        <thead className="bg-muted/55 text-muted-foreground">
          <tr>
            {["رقم الطلب", "التاريخ", "الفرع", "نوع الحركة", "السبب", "المبلغ", "التعليق"].map(
              (label) => (
                <th
                  key={label}
                  className="border-b border-border px-3 py-2.5 text-start font-medium"
                >
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.fingerprint} className="hover:bg-muted/25">
              <td className="px-3 py-3 font-medium"><span className="num">{row.orderId}</span></td>
              <td className="px-3 py-3"><span className="num">{row.businessDate}</span></td>
              <td className="px-3 py-3">{row.branchName ?? "—"}</td>
              <td className="px-3 py-3">{row.transactionType === "debit" ? "خصم" : "إضافة"}</td>
              <td className="px-3 py-3">{row.reason ?? "—"}</td>
              <MoneyCell value={row.amount} warning={row.transactionType === "debit"} />
              <td className="px-3 py-3 text-muted-foreground">{row.comment ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoneyCell({
  value,
  strong,
  warning,
}: {
  value: number;
  strong?: boolean;
  warning?: boolean;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3 py-3",
        strong && "font-semibold",
        warning && "text-destructive",
      )}
    >
      <span className="num">{sar(value)}</span>
    </td>
  );
}

function Kpi({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-border px-4 py-4 last:border-b-0 sm:border-e sm:[&:nth-child(even)]:border-e-0 xl:border-b-0 xl:[&:nth-child(even)]:border-e xl:last:border-e-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 truncate text-[20px] font-semibold", strong && "text-primary")}>
        {value}
      </p>
      <p className="num mt-1 text-[10.5px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ErrorNotice({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-destructive/20 bg-destructive-soft p-4 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        {error instanceof Error ? error.message : "تعذّر تحميل البيانات."}
      </div>
      <Button variant="outline" size="sm" onClick={retry}>
        <RefreshCw className="size-3.5" />
        إعادة المحاولة
      </Button>
    </div>
  );
}

function InvalidPlatform() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <p className="text-sm">المنصة المطلوبة غير موجودة.</p>
      <Link to="/operations" className="mt-3 inline-block text-sm font-semibold text-primary">
        العودة إلى العمليات اليومية
      </Link>
    </div>
  );
}

function platformLabel(platform: OperationPlatform): string {
  if (platform === "hungerstation") return "هنقرستيشن";
  if (platform === "keeta") return "كيتا";
  return "جاهز";
}
