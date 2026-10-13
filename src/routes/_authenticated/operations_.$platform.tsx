import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CircleX, Info, Loader2, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { ErrorNotice } from "@/components/operations/DayLedger";
import { SalesByHour } from "@/components/operations/SalesByHour";
import { BranchBreakdown, CoverageCalendar, DailyTrend, MonthPicker } from "@/components/operations/OperationsKit";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { PageHeader } from "@/components/workspace/PageKit";
import { count, percent, sar } from "@/lib/format";
import {
  currentOperationMonth,
  OPERATION_PLATFORMS,
  OPERATION_SOURCES,
  operationPlatformLabel as platformLabel,
} from "@/lib/operations/catalog";
import { operationCommissionRatio, operationCostRatio } from "@/lib/operations/details";
import { monthLabel } from "@/lib/operations/months";
import { getOperationMonth, importOperationFile } from "@/lib/operations/operations.functions";
import { PRODUCTS } from "@/lib/products";
import type { OperationImportHistoryItem, OperationPlatform, OperationSourceKind } from "@/lib/operations/types";
import { MAX_UPLOAD_SIZE_LABEL, uploadSizeError } from "@/lib/upload-validation";
import { cn } from "@/lib/utils";

const PLATFORM_IDS = new Set<OperationPlatform>(["hungerstation", "keeta", "jahez"]);

export const Route = createFileRoute("/_authenticated/operations_/$platform")({
  validateSearch: (search: Record<string, unknown>): { month?: string } => ({
    month:
      typeof search["month"] === "string" && /^\d{4}-\d{2}$/.test(search["month"])
        ? search["month"]
        : undefined,
  }),
  head: () => ({ meta: [{ title: `تفاصيل المنصة · ${PRODUCTS.nabd.name} · تدقيق` }] }),
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

type UploadState = "pending" | "uploading" | "saved" | "duplicate" | "incomplete" | "error";
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
  const [uploads, setUploads] = useState<Partial<Record<OperationSourceKind, UploadItem[]>>>({});
  const navigate = useNavigate();

  /** A day's files and orders open on their own page. */
  function openDay(date: string) {
    void navigate({ to: "/operations/$platform/$date", params: { platform, date } });
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
        const facts =
          sourceKind === "jahez_adjustments"
            ? `${result.businessDate} · ${count(result.rows)} حركة${result.unmatchedAdjustments ? ` · ${count(result.unmatchedAdjustments)} بلا طلب مطابق` : ""}`
            : `${result.businessDate} · ${count(result.orderCount)} طلب · ${sar(result.grossSales)}`;
        const stored = result.status === "duplicate" ? facts + " · مرفوع مسبقاً وتم تحديثه" : facts;
        update(item.id, result.incomplete
          ? {
              state: "incomplete",
              message: `${stored} · الملف يبدو غير مكتمل: ${count(result.unsettledOrderCount)} طلب بلا عمولة أو أرباح، أعد تصديره لاحقاً`,
            }
          : { state: result.status === "duplicate" ? "duplicate" : "saved", message: stored });
      } catch (error) {
        update(item.id, { state: "error", message: error instanceof Error ? error.message : "تعذّر رفع الملف." });
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["operation-month"] });
    await queryClient.invalidateQueries({ queryKey: ["operation-import-detail"] });
  }


  const costRatio = operationCostRatio(row?.chargesToDate ?? 0, row?.grossSales ?? 0);
  const commissionRatio = operationCommissionRatio(row?.commissionAmount ?? 0, row?.grossSales ?? 0);
  const hasData = history.length > 0;
  const incompleteDays = (row?.days ?? []).filter((day) => day.incomplete);

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[
          { label: "الرئيسية", to: "/dashboard" },
          { label: PRODUCTS.nabd.name, to: "/operations" },
          { label: platformLabel(platform) },
        ]}
        title={
          <span className="inline-flex items-center gap-2.5">
            <PlatformIcon platform={platform} className="size-8 rounded-lg" />
            <PlatformName platform={platform} />
          </span>
        }
        subtitle="ارفع ملفات الأيام، راجع التغطية والمؤشرات، ثم افتح أي يوم لتدقيق طلباته."
        aside={<MonthPicker month={month} onChange={setMonth} />}
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
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border xl:grid-cols-5">
          <Kpi
            wide
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
            value={row?.forecastSettlement == null ? null : sar(row.forecastSettlement)}
            empty="غير متاح بعد"
            hint={forecastHint(row?.forecastMissingDays ?? [], row?.coveredDays ?? 0)}
          />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-ink px-5 py-4 text-ink-foreground">
          <div>
            <h2 className="font-display text-[15px] font-bold">ملفات {monthLabel(month)}</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              ملف لكل يوم · يمكنك اختيار أو سحب عدة أيام معاً · الحد الأقصى <bdi dir="ltr">{MAX_UPLOAD_SIZE_LABEL}</bdi> للملف
            </p>
          </div>
          {monthQuery.isFetching ? <Loader2 className="size-4 animate-spin text-ink-muted" /> : null}
        </div>
        {incompleteDays.length ? (
          <div className="flex items-start gap-3 border-b border-border bg-warning/15 px-5 py-3 text-[12px] leading-6">
            <AlertTriangle className="mt-1 size-4 shrink-0 text-warning" />
            <p className="max-w-[80ch]">
              {incompleteDays.length === 1 ? "ملف يوم " : "ملفات أيام "}
              <span dir="ltr">{incompleteDays.map((day) => day.date.slice(8, 10) + "/" + day.date.slice(5, 7)).join("، ")}</span>{" "}
              تبدو غير مكتملة: فيها {count(incompleteDays.reduce((sum, day) => sum + day.unsettledOrderCount, 0))} طلب مُسلَّم بلا عمولة أو أرباح،
              غالباً لأنها صُدّرت قبل أن تحسبها المنصة، فتظهر تكلفة المنصة أقل من الحقيقة. أعد تصديرها من بوابة المنصة بعد يوم أو يومين
              وارفعها هنا؛ تحل محل القديمة تلقائياً.
            </p>
          </div>
        ) : null}
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
            const incomplete = new Set(source.kind === "jahez_adjustments" ? [] : incompleteDays.map((day) => Number(day.date.slice(8, 10))));
            for (const item of history) {
              if (item.sourceKind === source.kind && item.current) uploaded.set(Number(item.businessDate.slice(8, 10)), item.businessDate);
            }
            return (
              <div key={source.kind} className="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6">
                <div className="min-w-0 space-y-3">
                  <div>
                    <p className="text-[13.5px] font-semibold">{source.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {source.note} · {count(uploaded.size)} من {count(daysInMonth)} يوم مرفوع
                    </p>
                    <CoverageBar uploaded={uploaded.size} incomplete={[...uploaded.keys()].filter((day) => incomplete.has(day)).length} days={daysInMonth} />
                  </div>
                  {canUpload ? (
                    <DropZone accept={source.accept} disabled={busy} onFiles={(files) => void uploadFiles(source.kind, files)} />
                  ) : null}
                  <UploadResults
                    items={uploads[source.kind] ?? []}
                    onClear={() => setUploads((current) => ({ ...current, [source.kind]: [] }))}
                  />
                </div>
                <div className="lg:border-s lg:border-border lg:ps-6">
                  <CoverageCalendar month={month} daysInMonth={daysInMonth} uploaded={uploaded} incomplete={incomplete} onOpen={openDay} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-5 py-2.5 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success/30" /> مرفوع</span>
          {incompleteDays.length ? (
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warning/30 ring-1 ring-warning" /> ملف غير مكتمل</span>
          ) : null}
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

      {row?.days.length ? <SalesByHour platform={platform} month={month} /> : null}

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

      {hasData ? <DayPicker platform={platform} history={history} onOpen={openDay} /> : null}
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

/** How much of the month this source covers; incomplete days show in the warning colour. */
function CoverageBar({ uploaded, incomplete, days }: { uploaded: number; incomplete: number; days: number }) {
  const share = (value: number) => `${Math.min(100, (value / Math.max(days, 1)) * 100)}%`;
  return (
    <div aria-hidden className="mt-2.5 flex h-1 overflow-hidden rounded-full bg-muted">
      <span className="h-full bg-success/70 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: share(uploaded - incomplete) }} />
      <span className="h-full bg-warning transition-[width] duration-500 motion-reduce:transition-none" style={{ width: share(incomplete) }} />
    </div>
  );
}

/** Click or drop several daily files at once. */
function DropZone({ accept, disabled, onFiles }: { accept: string; disabled: boolean; onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const formats = accept.split(",").map((format) => format.replace(".", "").toUpperCase());
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
        "group flex cursor-pointer items-center gap-3.5 rounded-xl border border-dashed border-input bg-background px-4 py-4 transition-[background-color,border-color,transform] duration-200 hover:border-primary/50 hover:bg-primary/[0.03] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-card active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 sm:py-5",
        over && "border-solid border-primary bg-primary/5",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary-text transition-transform duration-200 motion-reduce:transition-none",
          over ? "-translate-y-0.5" : "group-hover:-translate-y-0.5",
        )}
      >
        {disabled ? <Loader2 className="size-[18px] animate-spin" /> : <Upload className="size-[18px]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{disabled ? "جارٍ رفع الملفات…" : "اسحب ملفات الأيام هنا أو اضغط للاختيار"}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          يمكن اختيار عدة ملفات
          {formats.map((format) => (
            <span key={format} dir="ltr" className="rounded border border-border bg-card px-1.5 py-px font-mono text-[10px] font-medium tracking-wide text-foreground/75">
              {format}
            </span>
          ))}
        </span>
      </span>
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
    <div className="overflow-hidden rounded-xl border border-border bg-background" aria-live="polite">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-[12px]">
        <span className="font-semibold">
          {done
            ? failed
              ? `اكتمل الرفع · ${count(items.length - failed)} نجح · ${count(failed)} تعذّر`
              : `اكتمل رفع ${count(items.length)} ${items.length === 1 ? "ملف" : "ملفات"}`
            : `جارٍ الرفع ${count(finished)} من ${count(items.length)}`}
        </span>
        {done ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            إخفاء
          </button>
        ) : null}
      </div>
      <div aria-hidden className="h-0.5 bg-border">
        <span
          className={cn(
            "block h-full transition-[width] duration-300 motion-reduce:transition-none",
            done ? (failed ? "bg-warning" : "bg-success") : "bg-primary",
          )}
          style={{ width: `${(finished / items.length) * 100}%` }}
        />
      </div>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2.5 text-[11.5px]",
              item.state === "error" && "bg-destructive/[0.04]",
              item.state === "incomplete" && "bg-warning/10",
              item.state === "pending" && "opacity-60",
            )}
          >
            {item.state === "saved" || item.state === "duplicate" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            ) : item.state === "incomplete" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            ) : item.state === "error" ? (
              <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <Loader2 className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", item.state === "uploading" && "animate-spin text-primary-text")} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium" title={item.name}>{item.name}</span>
              <span className={cn("mt-0.5 block leading-5 text-muted-foreground", item.state === "error" && "text-destructive")}>
                {item.message ?? (item.state === "uploading" ? "جارٍ القراءة والحفظ…" : "في الانتظار")}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}


/** One month figure. A missing value shows `empty` in body type, so Arabic words never sit in the number font. */
function Kpi({
  label,
  value,
  empty,
  hint,
  strong,
  wide,
}: {
  label: string;
  value: string | null;
  empty?: string;
  hint: string;
  strong?: boolean;
  /** Spans both columns on phones (the lead figure). */
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0 bg-card px-4 py-4", wide && "col-span-2 xl:col-span-1")}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {value == null ? (
        <p className="mt-1.5 text-[15px] font-semibold text-muted-foreground">{empty}</p>
      ) : (
        <p className={cn("num mt-1 truncate text-[18px] font-semibold sm:text-[20px]", strong && "text-primary")}>{value}</p>
      )}
      <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}

function InvalidPlatform() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <p className="text-sm">المنصة المطلوبة غير موجودة.</p>
      <Link to="/operations" className="mt-3 inline-block text-sm font-semibold text-primary">
        العودة إلى {PRODUCTS.nabd.name}
      </Link>
    </div>
  );
}

/** Pick a day to open its files and orders on their own page. */
function DayPicker({
  platform,
  history,
  onOpen,
}: {
  platform: OperationPlatform;
  history: OperationImportHistoryItem[];
  onOpen: (date: string) => void;
}) {
  const days = useMemo(() => {
    const byDay = new Map<string, OperationImportHistoryItem>();
    for (const item of history) {
      if (!item.current) continue;
      const kept = byDay.get(item.businessDate);
      // The orders file describes the day; Jahez compensations alone still make the day selectable.
      if (!kept || (kept.sourceKind === "jahez_adjustments" && item.sourceKind !== "jahez_adjustments")) byDay.set(item.businessDate, item);
    }
    return [...byDay.values()].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  }, [history]);
  if (!days.length) return null;
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
      <div>
        <h2 className="font-display text-[15px] font-bold">طلبات يوم</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          اختر يوماً لفتح ملفه وطلباته في صفحة مستقلة، أو اضغط على اليوم في التقويم.
        </p>
      </div>
      <select
        value=""
        onChange={(event) => event.target.value && onOpen(event.target.value)}
        aria-label={"اختر يوماً من أيام " + platformLabel(platform)}
        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-[13px] sm:w-80"
      >
        <option value="">اختر اليوم…</option>
        {days.map((item) => (
          <option key={item.businessDate} value={item.businessDate}>
            {item.businessDate}
            {item.sourceKind === "jahez_adjustments"
              ? ` · ${count(item.rowCount)} حركة`
              : ` · ${count(item.summary.orderCount)} طلب · ${sar(item.summary.grossSales)}`}
          </option>
        ))}
      </select>
    </section>
  );
}
