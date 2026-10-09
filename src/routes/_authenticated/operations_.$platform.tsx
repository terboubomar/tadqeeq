import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  FileSpreadsheet,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { BranchBreakdown, CoverageCalendar, DailyTrend, MonthPicker } from "@/components/operations/OperationsKit";
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
import { monthLabel } from "@/lib/operations/months";
import {
  deleteOperationImport,
  getOperationImportDetail,
  getOperationMonth,
  importOperationFile,
} from "@/lib/operations/operations.functions";
import type {
  OperationBranchSummary,
  OperationImportHistoryItem,
  OperationOrderDetail,
  OperationOrderFilter,
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

type UploadState = "pending" | "uploading" | "saved" | "duplicate" | "error";
interface UploadItem {
  id: string;
  name: string;
  state: UploadState;
  message?: string;
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
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OperationImportHistoryItem | null>(null);
  const [uploads, setUploads] = useState<Partial<Record<OperationSourceKind, UploadItem[]>>>({});
  const detailAnchor = useRef<HTMLDivElement>(null);

  function changeMonth(next: string) {
    setMonth(next);
    setSelectedImportId(null);
  }

  function openImport(importId: string) {
    setSelectedImportId(importId);
    window.requestAnimationFrame(() =>
      detailAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const monthQuery = useQuery({
    queryKey: ["operation-month", month],
    queryFn: () => getOperationMonth({ data: { month } }),
  });
  const row = monthQuery.data?.platforms.find((item) => item.platform === platform);
  const daysInMonth = monthQuery.data?.daysInMonth ?? 30;
  const history = useMemo(
    () => (monthQuery.data?.imports ?? []).filter((item) => item.platform === platform),
    [monthQuery.data?.imports, platform],
  );
  const sources = OPERATION_SOURCES.filter((source) => source.platform === platform);
  const selected = history.find((item) => item.id === selectedImportId) ?? null;
  const busy = Object.values(uploads).some((items) =>
    items?.some((item) => item.state === "pending" || item.state === "uploading"),
  );

  /** Uploads the chosen files one after another, so each day is read, dated and saved in turn. */
  async function uploadFiles(sourceKind: OperationSourceKind, files: File[]) {
    if (!files.length) return;
    const items: UploadItem[] = files.map((file, index) => ({ id: `${Date.now()}-${index}`, name: file.name, state: "pending" }));
    setUploads((current) => ({ ...current, [sourceKind]: items }));
    const update = (id: string, patch: Partial<UploadItem>) =>
      setUploads((current) => ({
        ...current,
        [sourceKind]: (current[sourceKind] ?? []).map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }));
    let lastImport: string | null = null;
    for (const [index, file] of files.entries()) {
      const item = items[index]!;
      const sizeError = uploadSizeError(file.size);
      if (sizeError) {
        update(item.id, { state: "error", message: sizeError });
        continue;
      }
      update(item.id, { state: "uploading" });
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("sourceKind", sourceKind);
        const result = await importOperationFile({ data: form });
        lastImport = result.importId;
        const facts =
          sourceKind === "jahez_adjustments"
            ? `${result.businessDate} · ${count(result.rows)} حركة${result.unmatchedAdjustments ? ` · ${count(result.unmatchedAdjustments)} بلا طلب مطابق` : ""}`
            : `${result.businessDate} · ${count(result.orderCount)} طلب · ${sar(result.grossSales)}`;
        update(item.id, {
          state: result.status === "duplicate" ? "duplicate" : "saved",
          message: result.status === "duplicate" ? facts + " · مرفوع مسبقاً وتم تحديثه" : facts,
        });
      } catch (error) {
        update(item.id, { state: "error", message: error instanceof Error ? error.message : "تعذّر رفع الملف." });
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["operation-month"] });
    await queryClient.invalidateQueries({ queryKey: ["operation-import-detail"] });
    if (lastImport) openImport(lastImport);
  }

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
  const commissionRatio = operationCommissionRatio(row?.commissionAmount ?? 0, row?.grossSales ?? 0);
  const hasData = history.length > 0;

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
        subtitle="ارفع ملفات الأيام، راجع التغطية والمؤشرات، ثم افتح أي يوم لتدقيق طلباته."
        aside={<MonthPicker month={month} onChange={changeMonth} />}
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

      {hasData ? (
        <section className="grid overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-2 xl:grid-cols-5">
          <Kpi
            label="المبيعات"
            value={sar(row?.grossSales)}
            hint={`${count(row?.orderCount)} طلب${row?.cancellationCount ? ` · ${count(row.cancellationCount)} ملغى` : ""}`}
            strong
          />
          <Kpi label="تكلفة المنصة" value={percent(costRatio)} hint={sar(row?.chargesToDate)} />
          <Kpi label="نسبة العمولة" value={percent(commissionRatio)} hint={sar(row?.commissionAmount)} />
          <Kpi
            label="صافي التحويل"
            value={sar(row?.settlementToDate)}
            hint={`حتى ${count(row?.coveredDays)} يوم${row?.cancelledEarningsAmount ? ` · منه ${sar(row.cancelledEarningsAmount)} من طلبات ملغاة` : ""}`}
          />
          <Kpi
            label="توقع نهاية الشهر"
            value={row?.forecastSettlement == null ? "غير متاح بعد" : sar(row.forecastSettlement)}
            hint={forecastHint(row?.forecastMissingDays ?? [], row?.coveredDays ?? 0)}
          />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-ink px-5 py-4 text-ink-foreground">
          <div>
            <h2 className="font-display text-[15px] font-bold">ملفات {monthLabel(month)}</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              ملف لكل يوم · يمكنك اختيار أو سحب عدة أيام معاً · الحد الأقصى {MAX_UPLOAD_SIZE_LABEL} للملف
            </p>
          </div>
          {monthQuery.isFetching ? <Loader2 className="size-4 animate-spin text-ink-muted" /> : null}
        </div>
        {!hasData && !monthQuery.isLoading ? (
          <div className="flex items-start gap-3 border-b border-border bg-primary/5 px-5 py-4 text-[12.5px] leading-6">
            <Info className="mt-1 size-4 shrink-0 text-primary-text" />
            <p>
              لا توجد ملفات {platformLabel(platform)} في {monthLabel(month)}.
              {canUpload
                ? " صدّر ملف الطلبات اليومي من بوابة المنصة لكل يوم، ثم اسحب الملفات هنا دفعة واحدة؛ يُقرأ تاريخ كل ملف تلقائياً."
                : " اطلب من مالك الحساب أو المدقق رفع ملفات الأيام."}
            </p>
          </div>
        ) : null}
        <div className="divide-y divide-border">
          {sources.map((source) => {
            const uploaded = new Map<number, string>();
            for (const item of history) {
              if (item.sourceKind === source.kind && item.current) uploaded.set(Number(item.businessDate.slice(8, 10)), item.id);
            }
            return (
              <div key={source.kind} className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="min-w-0 space-y-3">
                  <div>
                    <p className="text-[13px] font-semibold">{source.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {source.note} · {count(uploaded.size)} من {count(daysInMonth)} يوم مرفوع
                    </p>
                  </div>
                  {canUpload ? (
                    <DropZone accept={source.accept} disabled={busy} onFiles={(files) => void uploadFiles(source.kind, files)} />
                  ) : null}
                  <UploadResults
                    items={uploads[source.kind] ?? []}
                    onClear={() => setUploads((current) => ({ ...current, [source.kind]: [] }))}
                  />
                </div>
                <CoverageCalendar month={month} daysInMonth={daysInMonth} uploaded={uploaded} onOpen={openImport} />
              </div>
            );
          })}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-5 py-2.5 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success/30" /> مرفوع</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-dashed border-destructive/60" /> ناقص قبل آخر يوم مرفوع</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-muted" /> لم يُرفع بعد</span>
        </p>
      </section>

      {row?.days.length ? (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-3 font-display text-[15px] font-bold">الأداء اليومي</h2>
          <DailyTrend days={row.days} />
        </section>
      ) : null}

      {row?.branches.length ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-display text-[15px] font-bold">الفروع</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              مجموع أيام {monthLabel(month)} المرفوعة لكل فرع. اضغط على عنوان العمود للترتيب.
            </p>
          </div>
          {!row.branchesComplete ? (
            <p className="flex items-start gap-2 border-b border-border bg-warning/15 px-5 py-2.5 text-[11.5px] leading-5">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              بعض أيام الشهر رُفعت قبل إضافة تفصيل الفروع فلا تدخل هنا. أعد رفع ملفاتها لتكتمل الأرقام.
            </p>
          ) : null}
          <BranchBreakdown branches={row.branches} />
        </section>
      ) : row && !row.branchesComplete && row.orderCount > 0 ? (
        <p className="flex items-start gap-2 rounded-2xl border border-border bg-card px-5 py-4 text-[12px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          تفصيل الفروع يظهر للملفات المرفوعة من الآن؛ أعد رفع ملفات هذا الشهر لعرضه.
        </p>
      ) : null}

      <FileHistory
        history={history}
        selectedImportId={selectedImportId}
        canDelete={canUpload}
        onOpen={openImport}
        onDelete={setDeleteTarget}
      />

      <div ref={detailAnchor} className="scroll-mt-4">
        {selectedImportId ? (
          <OrderLedger key={selectedImportId} importId={selectedImportId} selected={selected} platform={platform} />
        ) : hasData ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-10 text-center">
            <FileSpreadsheet className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-[13px] font-medium">اختر يوماً من التقويم أو من سجل الملفات</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              تظهر طلبات اليوم مع البحث والتصفية حسب الفرع والملغاة والشكاوى.
            </p>
          </div>
        ) : null}
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
              سيُحذف «{deleteTarget?.originalName}» وكل صفوفه التشغيلية
              {deleteTarget?.current ? "، ويصبح يوم " + deleteTarget.businessDate + " بلا ملف" : ""}. لا يؤثر ذلك في
              محرك المحاسبة.
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
              {removeImport.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} حذف الملف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function forecastHint(missingDays: number[], coveredDays: number): string {
  if (missingDays.length) {
    const shown = missingDays.slice(0, 4).join("، ");
    return `ينقص يوم ${shown}${missingDays.length > 4 ? " و" + count(missingDays.length - 4) + " غيرها" : ""} قبل آخر يوم مرفوع`;
  }
  if (!coveredDays) return "يظهر بعد رفع أول يوم";
  return "توقع تشغيلي بمعدل الأيام المرفوعة";
}

/** Click or drop several daily files at once. */
function DropZone({ accept, disabled, onFiles }: { accept: string; disabled: boolean; onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) onFiles([...event.dataTransfer.files]);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input bg-background px-4 py-5 text-center transition-colors hover:bg-muted/50",
        over && "border-primary bg-primary/5",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      {disabled ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Upload className="size-5 text-primary-text" />}
      <span className="text-[12.5px] font-medium">{disabled ? "جارٍ رفع الملفات…" : "اسحب ملفات الأيام هنا أو اضغط للاختيار"}</span>
      <span className="text-[11px] text-muted-foreground">يمكن اختيار عدة ملفات · {accept.replaceAll(",", " ")}</span>
      <input
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          onFiles(files);
        }}
      />
    </label>
  );
}

function UploadResults({ items, onClear }: { items: UploadItem[]; onClear: () => void }) {
  if (!items.length) return null;
  const finished = items.filter((item) => item.state !== "pending" && item.state !== "uploading").length;
  const done = finished === items.length;
  const failed = items.filter((item) => item.state === "error").length;
  return (
    <div className="rounded-xl border border-border" aria-live="polite">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11.5px]">
        <span className="font-medium">
          {done
            ? failed
              ? `اكتمل الرفع · ${count(items.length - failed)} نجح · ${count(failed)} تعذّر`
              : `اكتمل رفع ${count(items.length)} ${items.length === 1 ? "ملف" : "ملفات"}`
            : `جارٍ الرفع ${count(finished)} من ${count(items.length)}`}
        </span>
        {done ? (
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-foreground">
            إخفاء
          </button>
        ) : null}
      </div>
      <ul className="max-h-56 divide-y divide-border overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 px-3 py-2 text-[11.5px]">
            {item.state === "saved" || item.state === "duplicate" ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
            ) : item.state === "error" ? (
              <CircleX className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            ) : (
              <Loader2 className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground", item.state === "uploading" && "animate-spin")} />
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.name}</span>
              <span className={cn("block text-muted-foreground", item.state === "error" && "text-destructive")}>
                {item.message ?? (item.state === "uploading" ? "جارٍ القراءة والحفظ…" : "في الانتظار")}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The month's uploads by day: the file that counts first, replaced uploads folded under it. */
function FileHistory({
  history,
  selectedImportId,
  canDelete,
  onOpen,
  onDelete,
}: {
  history: OperationImportHistoryItem[];
  selectedImportId: string | null;
  canDelete: boolean;
  onOpen: (importId: string) => void;
  onDelete: (item: OperationImportHistoryItem) => void;
}) {
  const days = useMemo(() => {
    const byDay = new Map<string, OperationImportHistoryItem[]>();
    for (const item of history) byDay.set(item.businessDate, [...(byDay.get(item.businessDate) ?? []), item]);
    return [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [history]);
  if (!history.length) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-display text-[15px] font-bold">سجل الملفات</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          يوم بيوم. الملف المعتمد لكل يوم هو ما يدخل في المؤشرات؛ الملفات المستبدلة مطوية تحته.
        </p>
      </div>
      <div className="divide-y divide-border">
        {days.map(([date, items]) => {
          const current = items.filter((item) => item.current);
          const replaced = items.filter((item) => !item.current);
          return (
            <div key={date} className="px-4 py-3 sm:px-5">
              <p className="num mb-1.5 text-[11.5px] font-semibold text-muted-foreground">{date}</p>
              <div className="space-y-1.5">
                {current.map((item) => (
                  <HistoryRow key={item.id} item={item} active={selectedImportId === item.id} canDelete={canDelete} onOpen={onOpen} onDelete={onDelete} />
                ))}
                {!current.length ? (
                  <p className="text-[11.5px] text-muted-foreground">لا يوجد ملف معتمد لهذا اليوم (حُذف الملف الأحدث).</p>
                ) : null}
                {replaced.length ? (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                      {count(replaced.length)} {replaced.length === 1 ? "ملف مستبدل" : "ملفات مستبدلة"} لا تدخل في المؤشرات
                    </summary>
                    <div className="mt-1.5 space-y-1.5 opacity-75">
                      {replaced.map((item) => (
                        <HistoryRow key={item.id} item={item} active={selectedImportId === item.id} canDelete={canDelete} onOpen={onOpen} onDelete={onDelete} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HistoryRow({
  item,
  active,
  canDelete,
  onOpen,
  onDelete,
}: {
  item: OperationImportHistoryItem;
  active: boolean;
  canDelete: boolean;
  onOpen: (importId: string) => void;
  onDelete: (item: OperationImportHistoryItem) => void;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-border px-3 py-2", active && "border-primary/50 bg-primary/5")}>
      <button type="button" onClick={() => onOpen(item.id)} className="min-w-0 flex-1 text-start">
        <span className="block truncate text-[12.5px] font-medium">{item.originalName}</span>
        <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
          {operationSourceLabels[item.sourceKind]} ·{" "}
          {item.sourceKind === "jahez_adjustments"
            ? `${count(item.rowCount)} حركة`
            : `${count(item.summary.orderCount)} طلب · ${sar(item.summary.grossSales)}`}
        </span>
      </button>
      <Button variant="outline" size="sm" onClick={() => onOpen(item.id)}>
        فتح <ArrowLeft className="size-3.5" />
      </Button>
      {canDelete ? (
        <Button variant="ghost" size="icon-sm" aria-label={`حذف ${item.originalName}`} onClick={() => onDelete(item)}>
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      ) : null}
    </div>
  );
}

const FILTERS: Array<{ id: OperationOrderFilter; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "cancelled", label: "ملغاة" },
  { id: "complaints", label: "شكاوى" },
  { id: "refunds", label: "استردادات" },
];

function OrderLedger({
  importId,
  selected,
  platform,
}: {
  importId: string;
  selected: OperationImportHistoryItem | null;
  platform: OperationPlatform;
}) {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OperationOrderFilter>("all");
  const [branchKey, setBranchKey] = useState("");
  const branches: OperationBranchSummary[] = selected?.summary.branches ?? [];
  const branch = branches.find((item) => item.key === branchKey);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchText.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const query = useQuery({
    queryKey: ["operation-import-detail", importId, platform, page, search, filter, branchKey],
    queryFn: () =>
      getOperationImportDetail({
        data: {
          importId,
          platform,
          page,
          pageSize: PAGE_SIZE,
          ...(search ? { search } : {}),
          ...(filter !== "all" ? { filter } : {}),
          ...(branch?.branchId ? { branchId: branch.branchId } : branch?.branchName ? { branchName: branch.branchName } : {}),
        },
      }),
    placeholderData: keepPreviousData,
  });
  const detail = query.data;
  const totalPages = Math.max(1, Math.ceil((detail?.totalRows ?? 0) / PAGE_SIZE));
  const isAdjustments = selected?.sourceKind === "jahez_adjustments";
  const narrowed = Boolean(search || filter !== "all" || branchKey);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-display text-[15px] font-bold">
            {selected ? `${isAdjustments ? "حركات" : "طلبات"} ${selected.businessDate}` : "تفاصيل الملف"}
          </h2>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {selected ? `${selected.originalName} · ${operationSourceLabels[selected.sourceKind]}${selected.current ? "" : " · مستبدل"}` : ""}
          </p>
        </div>
        {query.isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {!isAdjustments ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <label className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ابحث برقم الطلب أو اسم الفرع"
              aria-label="بحث في الطلبات"
              className="h-9 ps-9"
            />
          </label>
          {branches.length > 1 ? (
            <select
              value={branchKey}
              onChange={(event) => {
                setBranchKey(event.target.value);
                setPage(1);
              }}
              aria-label="الفرع"
              className="h-9 max-w-56 rounded-md border border-input bg-background px-2 text-[12.5px]"
            >
              <option value="">كل الفروع</option>
              {branches.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.branchName ?? item.branchId}
                </option>
              ))}
            </select>
          ) : null}
          <div role="group" aria-label="تصفية الطلبات" className="flex gap-1 rounded-lg bg-muted/60 p-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => {
                  setFilter(item.id);
                  setPage(1);
                }}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                  filter === item.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {query.isError ? <ErrorNotice error={query.error} retry={() => void query.refetch()} /> : null}

      {detail?.totals && detail.totalRows > 0 ? (
        <div className="grid grid-cols-2 gap-3 border-b border-border bg-muted/30 px-5 py-3 text-[11.5px] sm:grid-cols-4">
          <TotalCell label={narrowed ? "الطلبات المطابقة" : "طلبات اليوم"} value={count(detail.totalRows)} />
          <TotalCell label="المبيعات" value={sar(detail.totals.grossSales)} />
          <TotalCell
            label="تكلفة المنصة"
            value={`${sar(detail.totals.chargesTotal)} · ${percent(operationCostRatio(detail.totals.chargesTotal, detail.totals.grossSales))}`}
          />
          <TotalCell label="صافي التحويل" value={sar(detail.totals.settlementAmount)} />
        </div>
      ) : null}

      {detail?.orders.length ? <OrdersTable rows={detail.orders} platform={platform} /> : null}
      {detail?.adjustments.length ? <AdjustmentsTable rows={detail.adjustments} /> : null}
      {!query.isLoading && detail && detail.totalRows === 0 ? (
        <div className="px-5 py-10 text-center text-[12.5px] text-muted-foreground">
          {narrowed ? "لا توجد طلبات تطابق البحث أو التصفية." : "لا توجد صفوف مرتبطة بهذا الملف؛ استُبدل بملف أحدث لليوم نفسه."}
        </div>
      ) : null}
      {query.isLoading ? (
        <div className="grid min-h-48 place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {detail && detail.totalRows > PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-[11.5px] text-muted-foreground">
            صفحة {count(page)} من {count(totalPages)} · {count(detail.totalRows)} صف
          </p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon-sm" aria-label="الصفحة السابقة" disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}>
              <ChevronRight />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="الصفحة التالية" disabled={page >= totalPages || query.isFetching} onClick={() => setPage(page + 1)}>
              <ChevronLeft />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TotalCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className="num mt-0.5 truncate font-semibold">{value}</p>
    </div>
  );
}

function OrdersTable({ rows, platform }: { rows: OperationOrderDetail[]; platform: OperationPlatform }) {
  const columns = orderMoneyColumns(platform);
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1500px] border-collapse text-start text-[11.5px]">
          <thead className="bg-muted/55 text-muted-foreground">
            <tr>
              {["رقم الطلب", "التاريخ", "الفرع", "الحالة", ...columns.map((column) => column.label)].map((label) => (
                <th key={label} className="whitespace-nowrap border-b border-border px-3 py-2.5 text-start font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.orderId} className="hover:bg-muted/25">
                <td className="whitespace-nowrap px-3 py-3 font-medium"><span className="num">{row.orderId}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground"><span className="num">{row.businessDate}</span></td>
                <td className="max-w-44 truncate px-3 py-3" title={row.branchName ?? row.branchId ?? undefined}>
                  {row.branchName ?? row.branchId ?? "—"}
                </td>
                <td className="max-w-36 truncate px-3 py-3 text-muted-foreground" title={row.status ?? undefined}>
                  {row.status ?? "—"}
                </td>
                {columns.map((column) => (
                  <MoneyCell
                    key={column.key}
                    value={row[column.key]}
                    strong={column.strong}
                    warning={column.key === "refundAmount" && (row.refundAmount !== 0 || row.complaint)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <OrderCard key={row.orderId} row={row} />
        ))}
      </ul>
      <p className="border-t border-border px-4 py-2.5 text-[10.5px] text-muted-foreground">
        القيم مأخوذة من صفوف ملف {platformLabel(platform)} المحفوظة؛ صفر يعني أن الحقل غير موجود أو بلا قيمة في المصدر.
      </p>
    </>
  );
}

/** Phone view of one order: the figures that matter, the rest one tap away. */
function OrderCard({ row }: { row: OperationOrderDetail }) {
  const cancelled = /cancel/i.test(row.status ?? "");
  const details: Array<[string, number]> = [
    ["العمولة", row.commissionAmount],
    ["رسوم الدفع", row.paymentFeeAmount],
    ["خصم ممول منك", row.merchantFundedDiscountAmount],
    ["قسيمة ممولة منك", row.merchantFundedVoucherAmount],
    ["رسوم أخرى", row.otherFeeAmount],
    ["التوصيل", row.deliveryAmount],
    ["الاسترداد", row.refundAmount],
  ];
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num truncate text-[13px] font-semibold">{row.orderId}</p>
          <p className="truncate text-[11px] text-muted-foreground">{row.branchName ?? row.branchId ?? "—"}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10.5px]",
            cancelled ? "bg-destructive-soft text-destructive" : row.complaint ? "bg-warning/15" : "bg-muted text-muted-foreground",
          )}
        >
          {row.status ?? "—"}
          {row.complaint ? " · شكوى" : ""}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-muted-foreground">المبيعات</dt>
          <dd className="num font-semibold">{sar(row.grossSales)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">التكلفة</dt>
          <dd className="num">{sar(row.chargesTotal)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">التحويل</dt>
          <dd className="num font-semibold">{sar(row.settlementAmount)}</dd>
        </div>
      </dl>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[11px] text-primary-text">التفاصيل</summary>
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {details
            .filter(([, value]) => value !== 0)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="num">{sar(value)}</dd>
              </div>
            ))}
        </dl>
        {row.complaintReason ? <p className="mt-1 text-[11px] text-muted-foreground">السبب: {row.complaintReason}</p> : null}
      </details>
    </li>
  );
}

type MoneyKey = {
  [Key in keyof OperationOrderDetail]: OperationOrderDetail[Key] extends number ? Key : never;
}[keyof OperationOrderDetail];

function orderMoneyColumns(platform: OperationPlatform): Array<{ key: MoneyKey; label: string; strong?: boolean }> {
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
            {["رقم الطلب", "التاريخ", "الفرع", "نوع الحركة", "السبب", "المبلغ", "التعليق"].map((label) => (
              <th key={label} className="border-b border-border px-3 py-2.5 text-start font-medium">
                {label}
              </th>
            ))}
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

function MoneyCell({ value, strong, warning }: { value: number; strong?: boolean; warning?: boolean }) {
  return (
    <td className={cn("whitespace-nowrap px-3 py-3", strong && "font-semibold", warning && "text-destructive")}>
      <span className="num">{sar(value)}</span>
    </td>
  );
}

function Kpi({ label, value, hint, strong }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className="min-w-0 border-b border-border px-4 py-4 last:border-b-0 sm:border-e sm:[&:nth-child(even)]:border-e-0 xl:border-b-0 xl:[&:nth-child(even)]:border-e xl:last:border-e-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 truncate text-[20px] font-semibold", strong && "text-primary")}>{value}</p>
      <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}

function ErrorNotice({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-destructive/20 bg-destructive-soft p-4 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{error instanceof Error ? error.message : "تعذّر تحميل البيانات."}</div>
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
