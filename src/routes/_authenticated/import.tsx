import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Info,
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  FileText,
  Loader2,
  RotateCcw,
  Settings2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatPercentRateInterpretation,
  parsePercentRateInput,
} from "@/lib/analysis/rates";
import type { Platform } from "@/lib/analysis/types";
import { isPlatformKey } from "@/lib/platforms";
import type { HungerStationMappingReview } from "@/lib/hungerstation-branch-review";
import { importAuditPeriod } from "@/lib/import-audit.functions";
import { acquireImportRun, finishImportRun } from "@/lib/import-run-guard";
import { setSelectedPeriodId } from "@/lib/use-period";
import {
  MAX_UPLOAD_SIZE_LABEL,
  uploadSizeError,
} from "@/lib/upload-validation";
import { cn } from "@/lib/utils";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { ColumnReviewDialog } from "@/components/smart-columns/ColumnReviewDialog";
import type { ColumnAlias, ColumnReview } from "@/lib/smart-columns/match";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "رفع البيانات · تدقيق" },
      { name: "description", content: "ارفع ملف الطلبات وفاتورة المنصة لبدء التدقيق." },
      { property: "og:title", content: "رفع البيانات · تدقيق" },
      { property: "og:description", content: "ارفع ملف الطلبات وفاتورة المنصة لبدء التدقيق." },
    ],
  }),
  // ?platform=keeta opens the upload with that platform already chosen (from the top bar).
  // Links from an AI assistant (the MCP) also carry the bank fee, a label and the request id (?mcp=).
  validateSearch: (search: Record<string, unknown>): ImportSearch => {
    const text = (key: string, max: number) => {
      const value = search[key];
      const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
      return raw && raw.length <= max ? raw : undefined;
    };
    const mcp = text("mcp", 36);
    const bankRate = text("bankRate", 8);
    const label = text("label", 120);
    return {
      ...(isPlatformKey(search["platform"]) ? { platform: search["platform"] } : {}),
      ...(bankRate && /^\d+(\.\d+)?$/.test(bankRate) ? { bankRate } : {}),
      ...(label ? { label } : {}),
      ...(mcp && /^[0-9a-f-]{36}$/i.test(mcp) ? { mcp } : {}),
    };
  },
  component: ImportPage,
});

type ImportSearch = { platform?: Platform; bankRate?: string; label?: string; mcp?: string };

const STEPS = [
  { title: "المنصة والفترة", note: "اختر مصدر البيانات واسم الفترة" },
  { title: "ملف البيانات", note: "ارفع ملف Excel الأساسي" },
  { title: "المستندات والإعدادات", note: "الفاتورة والخيارات المساندة" },
  { title: "المراجعة والتحليل", note: "راجع المدخلات ثم ابدأ التدقيق" },
] as const;

function FileField({
  id,
  label,
  hint,
  accept,
  tag,
  file,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  tag: "مطلوب" | "موصى به" | "اختياري";
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-[15px] font-semibold">
            {label}
          </Label>
          <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-semibold",
            tag === "مطلوب" && "bg-destructive/10 text-destructive",
            tag === "موصى به" && "bg-secondary text-primary",
            tag === "اختياري" && "bg-muted text-muted-foreground",
          )}
        >
          {tag}
        </span>
      </div>

      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const nextFile = event.target.files?.[0] ?? null;
          if (!nextFile) {
            onChange(null);
            return;
          }

          const sizeError = uploadSizeError(nextFile.size);
          if (sizeError) {
            event.currentTarget.value = "";
            onChange(null);
            toast.error(sizeError);
            return;
          }

          onChange(nextFile);
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          "mt-4 flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed px-4 py-7 text-center transition-colors sm:min-h-[160px]",
          file
            ? "border-success/40 bg-success/[0.05]"
            : "border-input bg-background/70 hover:border-primary/50 hover:bg-secondary/40",
        )}
      >
        <span
          className={cn(
            "grid size-11 place-items-center rounded-full",
            file ? "bg-success/15 text-success" : "bg-secondary text-primary",
          )}
        >
          {file ? <Check className="size-5" /> : <Upload className="size-5" />}
        </span>
        <span
          className={cn(
            "max-w-full break-all text-[14px]",
            file ? "font-semibold text-foreground" : "font-medium text-foreground/80",
          )}
        >
          {file ? file.name : "اسحب الملف هنا أو اضغط للاختيار"}
        </span>
        <span className="num text-[11.5px] text-muted-foreground">
          {accept} · الحد الأقصى {MAX_UPLOAD_SIZE_LABEL}
        </span>
        <span className="mt-1 rounded-[8px] border border-input bg-white px-4 py-2 text-[13px] font-medium text-foreground">
          {file ? "تغيير الملف" : "اختر ملفاً"}
        </span>
      </label>
    </div>
  );
}

function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const search = Route.useSearch();
  const [platform, setPlatform] = useState<Platform>(search.platform ?? "hungerstation");
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [cpcFile, setCpcFile] = useState<File | null>(null);
  const [compensationFile, setCompensationFile] = useState<File | null>(null);
  const [bankRate, setBankRate] = useState(search.bankRate ?? "");
  const [label, setLabel] = useState(search.label ?? "");
  const [busy, setBusy] = useState(false);
  // Outcome of "run analysis" shown as a popup so it cannot be missed.
  const [notice, setNotice] = useState<RunNotice | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // While the server is analysing, show elapsed time and warn before the tab is closed or reloaded.
  useEffect(() => {
    if (!busy) return;
    const tick = window.setInterval(() => setElapsed(Math.floor((Date.now() - (startedAt ?? Date.now())) / 1000)), 1000);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("beforeunload", warn);
    };
  }, [busy, startedAt]);
  const [mappingReview, setMappingReview] =
    useState<HungerStationMappingReview | null>(null);
  const [mappingSelections, setMappingSelections] = useState<
    Record<string, string>
  >({});
  const [columnReview, setColumnReview] = useState<ColumnReview | null>(null);
  // Column matches confirmed for the current data file, resent with every later run of it.
  const [confirmedColumns, setConfirmedColumns] = useState<ColumnAlias[]>([]);
  const runLock = useRef(false);

  let bankRateInterpretation = "";
  let bankRateValidationError = "";
  if (platform === "hungerstation" && bankRate.trim()) {
    try {
      const parsed = parsePercentRateInput(bankRate);
      if (parsed) {
        bankRateInterpretation = formatPercentRateInterpretation(parsed);
      }
    } catch (error) {
      bankRateValidationError =
        error instanceof Error ? error.message : "نسبة رسوم الدفع غير صالحة.";
    }
  }

  // Choosing another platform from the top bar while already on this page switches the upload to it.
  useEffect(() => {
    if (search.platform && !busy) choosePlatform(search.platform);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.platform]);

  function choosePlatform(next: Platform) {
    if (next === platform) return;

    setPlatform(next);
    setDataFile(null);
    setConfirmedColumns([]);
    setInvoiceFile(null);
    setCpcFile(null);
    setCompensationFile(null);
    setBankRate("");
    setMappingReview(null);
    setMappingSelections({});
    setMaxStepReached(0);
    setStep(0);
  }

  function goToStep(next: number) {
    if (next < 0 || next >= STEPS.length) return;
    if (next > maxStepReached) return;
    setStep(next);
  }

  function nextStep() {
    if (step === 1 && !dataFile) {
      toast.error("ارفع ملف البيانات الأساسي قبل الانتقال للخطوة التالية.");
      return;
    }

    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setMaxStepReached((current) => Math.max(current, next));
  }

  function previousStep() {
    setStep((current) => Math.max(0, current - 1));
  }

  async function run(
    options: {
      approvedMappings?: Record<string, string>;
      skipMappingReview?: boolean;
      columnAliases?: ColumnAlias[];
    } = {},
  ) {
    if (!dataFile) {
      setNotice({ kind: "missing" });
      setStep(1);
      return;
    }

    if (!acquireImportRun(runLock)) return;

    setBusy(true);
    setNotice(null);
    setStartedAt(Date.now());
    setElapsed(0);
    setMappingReview(null);
    let savedSuccessfully = false;

    try {
      const form = new FormData();
      form.set("platform", platform);
      form.set("dataFile", dataFile);
      if (label.trim()) form.set("label", label.trim());
      if (invoiceFile) form.set("invoiceFile", invoiceFile);
      if (cpcFile) form.set("cpcFile", cpcFile);
      if (compensationFile) form.set("compensationFile", compensationFile);
      if (bankRate.trim()) form.set("bankRate", bankRate.trim());
      if (search.mcp) form.set("mcpRequest", search.mcp);
      if (options.approvedMappings) {
        form.set(
          "approvedMappings",
          JSON.stringify(options.approvedMappings),
        );
      }
      if (options.skipMappingReview) {
        form.set("skipMappingReview", "true");
      }
      const columnAliases = options.columnAliases ?? confirmedColumns;
      if (columnAliases.length) {
        form.set("columnAliases", JSON.stringify(columnAliases));
      }

      const response = await importAuditPeriod({ data: form });

      if (response.status === "column_review") {
        setColumnReview(response.review);
        return;
      }

      if (response.status === "mapping_review") {
        const suggestedSelections = Object.fromEntries(
          response.review.branches
            .filter((branch) => branch.suggestedInvoiceBranchName)
            .map((branch) => [
              branch.branchId,
              branch.suggestedInvoiceBranchName!,
            ]),
        );
        setMappingReview(response.review);
        setMappingSelections(suggestedSelections);
        setNotice({ kind: "mapping" });
        return;
      }

      if (response.status === "duplicate") {
        setNotice({ kind: "duplicate", periodId: response.existingPeriodId, fromAssistant: Boolean(search.mcp) });
        return;
      }

      savedSuccessfully = true;
      setSelectedPeriodId(response.periodId);
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      // Upload counts and trial limits live in the workspace context.
      await queryClient.invalidateQueries({ queryKey: ["workspace-context"] });
      toast.success(
        `تم تحليل ${response.branchCount} فرع و${response.dailyCount} يوم على الخادم.`,
        response.columnAliasesApplied
          ? { description: "استُخدمت مطابقة الأعمدة المؤكدة لأن المنصة غيّرت أسماء بعض الأعمدة." }
          : undefined,
      );
      if (response.columnChanges?.length) {
        toast.warning(`في الملف ${response.columnChanges.length} تغيير في أعمدة المبالغ مقارنة بملفاتك السابقة.`, {
          description: "راجعها في المراقب الذكي على اللوحة.",
          duration: 10_000,
        });
      }
      if (search.mcp) {
        // Started from an AI assistant: the result is waiting there, so say where to go next.
        setNotice({ kind: "assistant_done", periodId: response.periodId });
        return;
      }
      navigate({ to: "/dashboard" });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "تعذّر تحليل وحفظ الملفات";
      setNotice({ kind: "error", message });
    } finally {
      finishImportRun(runLock, savedSuccessfully);
      if (!savedSuccessfully) setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="audit-heading text-2xl sm:text-[28px]">رفع بيانات فترة جديدة</h1>
        <p className="mt-1.5 text-[14px] leading-7 text-muted-foreground">
          أكمل كل خطوة على حدة. لن ينتقل تدقيق للمرحلة التالية قبل اكتمال البيانات المطلوبة.
        </p>
        {search.mcp ? (
          <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-secondary p-3 text-[13.5px] leading-6">
            <Info className="mt-0.5 size-4 shrink-0 text-primary-text" />
            <span>
              هذا الرفع طلبه مساعدك الذكي (Claude أو ChatGPT). المنصة{search.bankRate ? " ونسبة رسوم الدفع" : ""} معبأة مسبقاً — ارفع الملفات
              واضغط «بدء التحليل»، ثم ارجع للمحادثة واكتب «خلصت».
            </span>
          </p>
        ) : null}
      </header>

      <WorkflowHeader
        step={step}
        maxStepReached={maxStepReached}
        onStepClick={goToStep}
      />

      <section className="rounded-[12px] border border-border bg-white">
        <div className="border-b border-border/80 px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex items-center gap-3">
            <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-semibold text-white">
              {step + 1}
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold">{STEPS[step]?.title}</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{STEPS[step]?.note}</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {step === 0 ? (
            <PlatformStep
              platform={platform}
              label={label}
              onPlatformChange={choosePlatform}
              onLabelChange={setLabel}
            />
          ) : null}

          {step === 1 ? (
            <DataFileStep
              platform={platform}
              dataFile={dataFile}
              onChange={(file) => {
                setDataFile(file);
                setConfirmedColumns([]);
                setMappingReview(null);
                setMappingSelections({});
              }}
            />
          ) : null}

          {step === 2 ? (
            <DocumentsStep
              platform={platform}
              invoiceFile={invoiceFile}
              cpcFile={cpcFile}
              compensationFile={compensationFile}
              bankRate={bankRate}
              bankRateInterpretation={bankRateInterpretation}
              bankRateValidationError={bankRateValidationError}
              onInvoiceChange={(file) => {
                setInvoiceFile(file);
                setMappingReview(null);
                setMappingSelections({});
              }}
              onCpcChange={(file) => {
                setCpcFile(file);
                setMappingReview(null);
                setMappingSelections({});
              }}
              onCompensationChange={(file) => {
                setCompensationFile(file);
                setMappingReview(null);
                setMappingSelections({});
              }}
              onBankRateChange={setBankRate}
            />
          ) : null}

          {step === 3 ? (
            mappingReview ? (
              <HungerStationBranchMappingReviewPanel
                review={mappingReview}
                selections={mappingSelections}
                onSelectionChange={(branchId, invoiceBranchName) =>
                  setMappingSelections((current) => ({
                    ...current,
                    [branchId]: invoiceBranchName,
                  }))
                }
              />
            ) : (
            <ReviewStep
              platform={platform}
              label={label}
              dataFile={dataFile}
              invoiceFile={invoiceFile}
              cpcFile={cpcFile}
              compensationFile={compensationFile}
              bankRate={bankRate}
              onEdit={setStep}
            />
            )
          ) : null}
        </div>

        <ColumnReviewDialog
          review={columnReview}
          onCancel={() => setColumnReview(null)}
          onConfirm={(aliases) => {
            setColumnReview(null);
            setConfirmedColumns(aliases);
            void run({ columnAliases: aliases });
          }}
        />

        <RunDialog
          busy={busy}
          elapsed={elapsed}
          notice={notice}
          canRetry={step === STEPS.length - 1 && !mappingReview}
          onClose={() => setNotice(null)}
          onRetry={() => void run()}
          onOpenPeriod={(periodId) => {
            setNotice(null);
            setSelectedPeriodId(periodId);
            navigate({ to: "/dashboard" });
          }}
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-border/80 bg-background/45 px-5 py-3.5">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={previousStep}
              disabled={busy}
            >
              <ArrowRight className="size-4" />
              السابق
            </Button>
          ) : (
            <span />
          )}

          <span className="flex-1" />

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={nextStep} disabled={busy}>
              التالي
              <ArrowLeft className="size-4" />
            </Button>
          ) : mappingReview ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void run({ skipMappingReview: true })}
              >
                متابعة بدون ربط
              </Button>
              <Button
                type="button"
                disabled={
                  busy ||
                  mappingReview.branches.some(
                    (branch) => !mappingSelections[branch.branchId]?.trim(),
                  ) ||
                  new Set(
                    mappingReview.branches.map(
                      (branch) => mappingSelections[branch.branchId]?.trim(),
                    ),
                  ).size !== mappingReview.branches.length
                }
                onClick={() =>
                  void run({
                    approvedMappings: Object.fromEntries(
                      mappingReview.branches.map((branch) => [
                        branch.branchId,
                        mappingSelections[branch.branchId]!.trim(),
                      ]),
                    ),
                  })
                }
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {busy ? "جارٍ إعادة التحليل…" : "تأكيد الربط وإعادة التحليل"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={() => void run()}
              disabled={busy || !dataFile}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {busy ? "جارٍ التحليل…" : "بدء التحليل وحفظ الفترة"}
            </Button>
          )}
        </div>
      </section>

      <p className="px-1 text-[11.5px] leading-6 text-muted-foreground">
        تُرفع ملفات المصدر إلى خادم Tadqeeq الخاص، ثم ينفّذ الخادم التحليل الحتمي ويحفظ النتيجة
        والملفات الأصلية مع بصمة SHA-256. ملفات المصدر لا تُرسل إلى Tadqeeq AI.
      </p>
    </div>
  );
}

function HungerStationBranchMappingReviewPanel({
  review,
  selections,
  onSelectionChange,
}: {
  review: HungerStationMappingReview;
  selections: Record<string, string>;
  onSelectionChange: (branchId: string, invoiceBranchName: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-warning/30 bg-warning/[0.06] p-4">
        <h3 className="text-[15px] font-semibold">
          خطوة أخيرة: اربط فروع الفاتورة بفروع ملف الطلبات
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-6 text-muted-foreground">
          هنقرستيشن كتبت أسماء {review.branches.length === 1 ? "فرع" : "بعض الفروع"} في الفاتورة بشكل مختلف عن ملف الطلبات. اختر لكل فرع
          اسمه في الفاتورة ثم «تأكيد الربط وإعادة التحليل». هذه الخطوة مرة واحدة فقط: نحفظ اختيارك ولن نسألك عنه في الأشهر القادمة.
        </p>
      </div>

      <div className="space-y-3">
        {review.branches.map((branch) => (
          <div
            key={branch.branchId}
            className="grid gap-3 rounded-[10px] border border-border bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(240px,1fr)] sm:items-center"
          >
            <div>
              <p className="text-[11.5px] text-muted-foreground">الفرع في ملف الطلبات</p>
              <p className="text-sm font-semibold">{branch.branch}</p>
              <p className="num mt-1 text-[11.5px] text-muted-foreground">
                HS Branch ID: {branch.branchId}
              </p>
              {branch.suggestedInvoiceBranchName ? (
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  اقتراح حتمي من الفرع المتبقي:{" "}
                  <span className="font-medium text-foreground">
                    {branch.suggestedInvoiceBranchName}
                  </span>
                </p>
              ) : null}
            </div>

            <label>
              <span className="mb-1.5 block text-[12px] font-semibold">
                اسم الفرع في الفاتورة
              </span>
              <select
                value={selections[branch.branchId] ?? ""}
                onChange={(event) =>
                  onSelectionChange(branch.branchId, event.target.value)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">اختر الفرع…</option>
                {review.invoiceBranchNames.map((invoiceBranchName) => {
                  const usedByOtherBranch = review.branches.some(
                    (candidate) =>
                      candidate.branchId !== branch.branchId &&
                      selections[candidate.branchId] === invoiceBranchName,
                  );
                  return (
                    <option
                      key={invoiceBranchName}
                      value={invoiceBranchName}
                      disabled={usedByOtherBranch}
                    >
                      {invoiceBranchName}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        ))}
      </div>

      <p className="text-[11.5px] leading-6 text-muted-foreground">
        غير متأكد؟ اضغط «متابعة بدون ربط» لحفظ الفترة الآن. يظهر الفرع «غير مطابق» في تقرير الفروع بدلاً من أن يخمّن تدقيق، وباقي الأرقام كما هي.
      </p>
    </div>
  );
}

function WorkflowHeader({
  step,
  maxStepReached,
  onStepClick,
}: {
  step: number;
  maxStepReached: number;
  onStepClick: (step: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-white">
      <div className="grid sm:grid-cols-4">
        {STEPS.map((item, index) => {
          const active = index === step;
          const complete = index < step || index < maxStepReached;
          const available = index <= maxStepReached;

          return (
            <button
              key={item.title}
              type="button"
              disabled={!available}
              onClick={() => onStepClick(index)}
              className={cn(
                "relative flex min-w-0 items-center gap-2.5 border-b border-border px-3.5 py-3 text-start transition-colors sm:border-b-0 sm:border-s",
                index === 0 && "sm:border-s-0",
                active && "bg-secondary",
                !active && available && "hover:bg-muted",
                !available && "cursor-not-allowed opacity-45",
              )}
            >
              <span
                className={cn(
                  "num grid size-[24px] shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                  active && "border-primary bg-primary text-white",
                  complete && !active && "border-success bg-success text-white",
                  !active && !complete && "border-input bg-white text-muted-foreground",
                )}
              >
                {complete && !active ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-[12.5px] font-semibold",
                    active ? "text-secondary-foreground" : "text-foreground/85",
                  )}
                >
                  {item.title}
                </span>
                <span className="mt-0.5 hidden truncate text-[10.5px] text-muted-foreground lg:block">
                  {item.note}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

function PlatformStep({
  platform,
  label,
  onPlatformChange,
  onLabelChange,
}: {
  platform: Platform;
  label: string;
  onPlatformChange: (platform: Platform) => void;
  onLabelChange: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[13px] font-semibold">اختر المنصة</p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {[
            {
              id: "hungerstation" as Platform,
              label: "هنقرستيشن",
              note: "ملف الطلبات الشهري، فاتورة PDF، وCPC اختياري.",
            },
            {
              id: "keeta" as Platform,
              label: "كيتا",
              note: "ملف Excel الشهري؛ Invoice Details وBilling data summary تُستخدم تلقائياً، وPDF يضيف طبقة أعمق.",
            },
            {
              id: "jahez" as Platform,
              label: "جاهز",
              note: "Restaurant Financial Report بصيغة CSV مع الفاتورة الضريبية PDF.",
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPlatformChange(item.id)}
              className={cn(
                "rounded-[9px] border px-4 py-4 text-start transition-colors",
                platform === item.id
                  ? "border-primary/45 bg-secondary"
                  : "border-border bg-white hover:border-input hover:bg-background/50",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <PlatformName platform={item.id} className="text-sm font-semibold" iconClassName="size-6 rounded-md" />
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-full border",
                    platform === item.id
                      ? "border-primary bg-primary"
                      : "border-input bg-white",
                  )}
                >
                  {platform === item.id ? <Check className="size-2.5 text-white" /> : null}
                </span>
              </span>
              <span className="mt-1.5 block text-[11.5px] leading-5 text-muted-foreground">
                {item.note}
              </span>
            </button>
          ))}
        </div>
      </div>

      <label className="block max-w-[420px]">
        <span className="mb-1.5 block text-[13px] font-semibold">
          اسم الفترة <span className="font-normal text-muted-foreground">(اختياري)</span>
        </span>
        <Input
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          placeholder="مثال: فاتورة سبتمبر ٢٠٢٦"
        />
        <span className="mt-1.5 block text-[11.5px] text-muted-foreground">
          إذا تركته فارغاً سيستخدم تدقيق اسم الفترة المستخرج من الملف.
        </span>
      </label>
    </div>
  );
}

function DataFileStep({
  platform,
  dataFile,
  onChange,
}: {
  platform: Platform;
  dataFile: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="space-y-4">
      <FileField
        id="data"
        label={
          platform === "hungerstation"
            ? "ملف الطلبات (Excel)"
            : platform === "keeta"
              ? "ملف كيتا الشهري (Excel)"
              : "Restaurant Financial Report (CSV)"
        }
        hint={
          platform === "hungerstation"
            ? "ارفع الملف الشهري من هنقرستيشن بأوراق الطلبات والتوصيل المجاني والتعويضات والتعديلات والمرتجعات ووقت الانتظار."
            : platform === "keeta"
              ? "ارفع ملف كيتا الشهري الذي يحتوي على ورقة Order Summary."
              : "ارفع تقرير جاهز المالي الشهري بصيغة CSV؛ سيقرأ Tadqeeq ملخص التاجر وجدول الطلبات التفصيلي."
        }
        accept={platform === "jahez" ? ".csv" : ".xlsx,.xls"}
        tag="مطلوب"
        file={dataFile}
        onChange={onChange}
      />

      <div className="rounded-[9px] border border-primary/15 bg-secondary/55 px-4 py-3 text-[12px] leading-6 text-foreground/80">
        <span className="font-semibold">هذه هي قاعدة التدقيق.</span>{" "}
        سيعيد Tadqeeq بناء المبيعات والعمولات والرسوم والتسوية من هذا الملف قبل مقارنة الفاتورة.
      </div>
    </div>
  );
}

function DocumentsStep({
  platform,
  invoiceFile,
  cpcFile,
  compensationFile,
  bankRate,
  bankRateInterpretation,
  bankRateValidationError,
  onInvoiceChange,
  onCpcChange,
  onCompensationChange,
  onBankRateChange,
}: {
  platform: Platform;
  invoiceFile: File | null;
  cpcFile: File | null;
  compensationFile: File | null;
  bankRate: string;
  bankRateInterpretation: string;
  bankRateValidationError: string;
  onInvoiceChange: (file: File | null) => void;
  onCpcChange: (file: File | null) => void;
  onCompensationChange: (file: File | null) => void;
  onBankRateChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <FileField
        id="invoice"
        label="فاتورة المنصة (PDF)"
        hint={
          platform === "hungerstation"
            ? "موصى بها لإجراء المطابقة الرسمية على مستوى الإجمالي والفروع."
            : platform === "keeta"
              ? "اختيارية للمطابقة المتقدمة. إذا كان Excel يحتوي Invoice Details فسيجري Tadqeeq المطابقة الرسمية من Excel حتى بدون PDF."
              : "موصى بها لمطابقة عمولة جاهز وعروض التوصيل ورسوم المدفوعات والإجمالي والضريبة مع CSV."
        }
        accept=".pdf"
        tag="موصى به"
        file={invoiceFile}
        onChange={onInvoiceChange}
      />

      {platform === "jahez" ? (
        <FileField
          id="compensation"
          label="ملف التعويضات (Compensation Report CSV)"
          hint="أرفق تقرير تعويضات جاهز لمطابقة الخصومات والإضافات مع الطلبات، كشف التكرار، وتحديد الطلبات غير المعروفة أو المرتبطة بفترات سابقة."
          accept=".csv"
          tag="موصى به"
          file={compensationFile}
          onChange={onCompensationChange}
        />
      ) : null}

      {platform === "hungerstation" ? (
        <>
          <FileField
            id="cpc"
            label="فاتورة الإعلانات CPC (PDF)"
            hint="أرفقها إذا كانت موجودة لإدخال تكلفة الإعلانات ضمن ملخص الفترة."
            accept=".pdf"
            tag="اختياري"
            file={cpcFile}
            onChange={onCpcChange}
          />

          <div className="rounded-[10px] border border-border bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-secondary text-primary">
                <Settings2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Label htmlFor="rate" className="text-[13.5px] font-semibold">
                  نسبة رسوم الدفع الإلكتروني (%)
                </Label>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  أدخل نسبة العقد لإجراء تحقق مستقل. إذا تركتها فارغة مع الفاتورة، سيستخدم Tadqeeq
                  النسبة المستنتجة للتسوية فقط ويصنفها كغير مستقلة.
                </p>
                <Input
                  id="rate"
                  dir="ltr"
                  value={bankRate}
                  onChange={(event) => onBankRateChange(event.target.value)}
                  placeholder="2.5"
                  aria-invalid={Boolean(bankRateValidationError)}
                  className="num mt-3 max-w-[120px]"
                />
                {bankRateValidationError ? (
                  <p className="mt-2 text-[11.5px] leading-5 text-destructive">
                    {bankRateValidationError}
                  </p>
                ) : bankRateInterpretation ? (
                  <p className="num mt-2 text-[11.5px] font-medium text-success">
                    سيتم استخدام: {bankRateInterpretation}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-[9px] border border-primary/15 bg-secondary/55 px-4 py-3 text-[12px] leading-6 text-foreground/80">
          {platform === "keeta"
            ? "لا توجد إعدادات إضافية مطلوبة لكيتا. سيستخدم Tadqeeq Invoice Details وBilling data summary تلقائياً إذا كانتا موجودتين داخل Excel، ويستخدم PDF كطبقة مطابقة إضافية عند إرفاقه."
            : "لا توجد إعدادات إضافية مطلوبة لجاهز. سيعيد Tadqeeq بناء صافي المطعم والفاتورة من CSV، ثم يطابق PDF عند إرفاقه."}
        </div>
      )}
    </div>
  );
}

function ReviewStep({
  platform,
  label,
  dataFile,
  invoiceFile,
  cpcFile,
  compensationFile,
  bankRate,
  onEdit,
}: {
  platform: Platform;
  label: string;
  dataFile: File | null;
  invoiceFile: File | null;
  cpcFile: File | null;
  compensationFile: File | null;
  bankRate: string;
  onEdit: (step: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[9px] border border-success/25 bg-success/[0.035] px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Check className="mt-0.5 size-4 text-success" />
          <div>
            <p className="text-[13px] font-semibold">جاهز لبدء التحليل</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              راجع الملفات أدناه. لن يغيّر Tadqeeq قواعد المحاسبة أو بيانات المصدر أثناء التحليل.
            </p>
          </div>
        </div>
      </div>

      <ReviewSection title="المنصة والفترة" icon={Settings2} onEdit={() => onEdit(0)}>
        <ReviewRow
          label="المنصة"
          value={
            platform === "hungerstation" ? "هنقرستيشن" : platform === "keeta" ? "كيتا" : "جاهز"
          }
        />
        <ReviewRow label="اسم الفترة" value={label.trim() || "سيُستخرج من الملف"} />
      </ReviewSection>

      <ReviewSection title="ملف البيانات" icon={FileSpreadsheet} onEdit={() => onEdit(1)}>
        <ReviewRow
          label={
            platform === "hungerstation"
              ? "ملف الطلبات"
              : platform === "keeta"
                ? "Order Summary"
                : "Restaurant Financial Report"
          }
          value={dataFile?.name ?? "غير مرفق"}
          required
          ready={Boolean(dataFile)}
        />
      </ReviewSection>

      <ReviewSection title="المستندات والإعدادات" icon={FileText} onEdit={() => onEdit(2)}>
        <ReviewRow
          label="فاتورة المنصة"
          value={
            invoiceFile?.name ??
            (platform === "keeta"
              ? "غير مرفقة — سيستخدم Tadqeeq ضوابط Excel الرسمية إذا كانت موجودة"
              : "غير مرفقة — سيعمل التحليل بدون المطابقة الرسمية")
          }
          ready={Boolean(invoiceFile)}
        />
        {platform === "jahez" ? (
          <ReviewRow
            label="ملف التعويضات"
            value={compensationFile?.name ?? "غير مرفق — لن يتم تدقيق التعويضات"}
            ready={Boolean(compensationFile)}
          />
        ) : null}
        {platform === "hungerstation" ? (
          <>
            <ReviewRow label="فاتورة CPC" value={cpcFile?.name ?? "غير مرفقة"} ready={Boolean(cpcFile)} />
            <ReviewRow
              label="نسبة رسوم الدفع"
              value={bankRate.trim() ? bankRate.trim() + "%" : "لم تُدخل"}
              ready={Boolean(bankRate.trim())}
            />
          </>
        ) : null}
      </ReviewSection>

      <div className="rounded-[9px] border border-border bg-background/60 px-4 py-3">
        <p className="text-[12.5px] font-semibold">بعد الضغط على بدء التحليل</p>
        <ol className="mt-2 list-decimal space-y-1 ps-5 text-[12px] leading-6 text-foreground/75">
          <li>إعادة احتساب بنود المنصة من ملف البيانات الخام.</li>
          <li>قراءة الفاتورة والمطابقة الرسمية إذا تم إرفاق PDF.</li>
          <li>حفظ الفترة وتحديث التقارير ومركز الاستثناءات تلقائياً.</li>
        </ol>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  icon: Icon,
  onEdit,
  children,
}: {
  title: string;
  icon: typeof FileText;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[9px] border border-border">
      <div className="flex items-center gap-2.5 border-b border-border/70 bg-background/55 px-3.5 py-2.5">
        <Icon className="size-4 text-primary" />
        <h3 className="text-[12.5px] font-semibold">{title}</h3>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onEdit}
          className="text-[11.5px] font-medium text-primary hover:underline"
        >
          تعديل
        </button>
      </div>
      <dl className="px-3.5">{children}</dl>
    </section>
  );
}

function ReviewRow({
  label,
  value,
  required = false,
  ready = true,
}: {
  label: string;
  value: string;
  required?: boolean;
  ready?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-border/60 py-2.5 last:border-b-0 sm:grid-cols-[180px_1fr] sm:items-center">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-[12.5px] font-medium",
          required && !ready && "text-destructive",
          !required && !ready && "text-muted-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

type RunNotice =
  | { kind: "missing" }
  | { kind: "mapping" }
  | { kind: "duplicate"; periodId: string; fromAssistant?: boolean }
  | { kind: "assistant_done"; periodId: string }
  | { kind: "error"; message: string };

function RunDialog({
  busy,
  elapsed,
  notice,
  canRetry,
  onClose,
  onRetry,
  onOpenPeriod,
}: {
  busy: boolean;
  elapsed: number;
  notice: RunNotice | null;
  canRetry: boolean;
  onClose: () => void;
  onRetry: () => void;
  onOpenPeriod: (periodId: string) => void;
}) {
  const open = busy || notice !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        dir="rtl"
        className={cn("max-w-md text-right [&>button]:left-4 [&>button]:right-auto", busy && "[&>button]:hidden")}
        onEscapeKeyDown={(event) => busy && event.preventDefault()}
        onInteractOutside={(event) => busy && event.preventDefault()}
      >
        {busy ? (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-2 text-center">
            <Loader2 className="size-10 animate-spin text-primary-text" />
            <DialogTitle className="text-base">جارٍ تحليل الملفات على الخادم</DialogTitle>
            <p className="text-sm text-muted-foreground">
              الوقت المنقضي: <span className="num">{elapsed}</span> ث
            </p>
            <DialogDescription className="text-[13px] leading-6">
              قراءة الطلبات ثم مطابقتها مع الفاتورة وحفظ الفترة. يستغرق عادة أقل من دقيقة، وقد يطول مع ملفات PDF الكبيرة. لا تغلق الصفحة حتى ينتهي.
            </DialogDescription>
          </div>
        ) : notice?.kind === "error" ? (
          <>
            <div className="flex items-start gap-3 pt-2">
              <AlertTriangle className="mt-0.5 size-6 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <DialogTitle className="text-base text-destructive">لم يكتمل التحليل</DialogTitle>
                <DialogDescription className="text-sm leading-6 text-foreground/85">{notice.message}</DialogDescription>
                <p className="text-[12.5px] text-muted-foreground">لم يُحفظ شيء. صحّح الملف إن لزم ثم أعد المحاولة.</p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              {canRetry ? (
                <Button type="button" onClick={onRetry}>
                  <RotateCcw className="size-4" />
                  إعادة المحاولة
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={onClose}>
                إغلاق
              </Button>
            </DialogFooter>
          </>
        ) : notice?.kind === "assistant_done" ? (
          <>
            <div className="flex items-start gap-3 pt-2">
              <Check className="mt-0.5 size-6 shrink-0 text-success" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <DialogTitle className="text-base">اكتمل التدقيق</DialogTitle>
                <DialogDescription className="text-sm leading-6">
                  النتيجة جاهزة لمساعدك الذكي. ارجع للمحادثة في Claude أو ChatGPT واكتب «خلصت» ليشرح لك النتيجة ويجيب عن أسئلتك.
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="button" onClick={() => onOpenPeriod(notice.periodId)}>
                عرض النتيجة في تدقيق
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                إغلاق
              </Button>
            </DialogFooter>
          </>
        ) : notice?.kind === "duplicate" ? (
          <>
            <div className="flex items-start gap-3 pt-2">
              <AlertTriangle className="mt-0.5 size-6 shrink-0 text-primary-text" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <DialogTitle className="text-base">هذه الفترة محفوظة مسبقاً</DialogTitle>
                <DialogDescription className="text-sm leading-6">
                  {notice.fromAssistant
                    ? "أرسلنا الفترة المحفوظة لمساعدك الذكي. ارجع للمحادثة واكتب «خلصت» ليشرح لك النتيجة."
                    : "يمكنك فتح الفترة المحفوظة بدلاً من إنشاء نسخة مكررة."}
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="button" onClick={() => onOpenPeriod(notice.periodId)}>
                فتح الفترة
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                إغلاق
              </Button>
            </DialogFooter>
          </>
        ) : notice ? (
          <>
            <div className="flex items-start gap-3 pt-2">
              <Info className="mt-0.5 size-6 shrink-0 text-primary-text" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <DialogTitle className="text-base">
                  {notice.kind === "missing" ? "ملف البيانات مطلوب" : "راجع مطابقة الفروع"}
                </DialogTitle>
                <DialogDescription className="text-sm leading-6">
                  {notice.kind === "missing"
                    ? "اختر ملف بيانات الطلبات أولاً ثم اضغط بدء التحليل."
                    : "خطوة أخيرة قبل الحفظ: اختر اسم كل فرع كما يظهر في فاتورة هنقرستيشن ثم «تأكيد الربط وإعادة التحليل»، أو «متابعة بدون ربط» لحفظ الفترة الآن. نحفظ اختيارك فلا نسألك عنه مرة أخرى."}
                </DialogDescription>
              </div>
            </div>
            <DialogFooter className="sm:justify-start">
              <Button type="button" onClick={onClose}>
                حسناً
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
