import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeDollarSign,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Eye,
  FileSearch,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { AI_UI_ENABLED } from "@/lib/ai/config";
import { explainExceptionWithAi } from "@/lib/ai/exception-ai.functions";
import type { ExceptionAiResult } from "@/lib/ai/exception-ai";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildExceptionEvidence,
  buildPeriodExceptions,
  EXCEPTION_SEVERITY_LABELS,
  EXCEPTION_STATUS_LABELS,
  summarizeExceptions,
  type AuditException,
  type ExceptionSeverity,
  type ExceptionStatus,
  type ExceptionWorkflowEntry,
} from "@/lib/exceptions";
import { arabicDate, sar } from "@/lib/format";
import { updateExceptionWorkflow } from "@/lib/periods";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/exceptions")({
  head: () => ({
    meta: [
      { title: "مركز الاستثناءات · تدقيق" },
      {
        name: "description",
        content: "مركز موحد لمتابعة فروقات فواتير منصات التوصيل والمبالغ محل المراجعة.",
      },
    ],
  }),
  component: ExceptionsPage,
});

type WorkflowMutation = {
  periodId: string;
  exceptionId: string;
  patch: Partial<ExceptionWorkflowEntry>;
};

function ExceptionsPage() {
  const { selected, isLoading } = useSelectedPeriod();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("all");
  const [selectedException, setSelectedException] = useState<AuditException | null>(null);

  const updateWorkflow = useMutation({
    mutationFn: ({ periodId, exceptionId, patch }: WorkflowMutation) =>
      updateExceptionWorkflow(periodId, exceptionId, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exceptions = useMemo(
    () => (selected ? buildPeriodExceptions(selected) : []),
    [selected],
  );
  const summary = useMemo(() => summarizeExceptions(exceptions), [exceptions]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exceptions.filter((item) => {
      if (
        status === "open" &&
        (item.status === "closed" || item.status === "recovered")
      ) {
        return false;
      }
      if (status !== "all" && status !== "open" && item.status !== status) return false;
      if (severity !== "all" && item.severity !== severity) return false;
      if (!needle) return true;

      return [
        item.periodLabel,
        item.branch,
        item.branchId,
        item.categoryLabel,
        item.label,
        item.note,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [exceptions, query, severity, status]);

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (!selected) {
    return (
      <EmptyState
        title="لا توجد فترات تدقيق"
        body="ارفع بيانات منصة أولاً، وسيتم إنشاء الاستثناءات تلقائياً من نتائج المطابقة."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="audit-heading">مركز الاستثناءات</h1>
          <p className="audit-subtitle">
            {selected.label} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)} ·{" "}
            {selected.platform === "hungerstation" ? "هنقرستيشن" : selected.platform === "keeta" ? "كيتا" : "جاهز"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            يعرض فقط الفروقات المستقلة القابلة للإجراء في الملف المحدد؛ المجاميع الرقابية والبنود غير القابلة للتحقق تبقى في مطابقة الفاتورة.
          </p>
        </div>
        <span className="rounded-[6px] border border-border bg-white px-2.5 py-1 text-[11.5px] text-muted-foreground">
          {exceptions.length} استثناء في الملف المحدد
        </span>
      </header>

      <section className="audit-kpi-strip grid gap-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:rounded-none [&>*]:border-0 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0">
        <StatCard
          label="الاستثناءات المفتوحة"
          value={String(summary.openCount)}
          hint={summary.criticalCount + " حرجة"}
          icon={ShieldAlert}
          tone={summary.openCount ? "negative" : "default"}
        />
        <StatCard
          label="المبالغ محل المراجعة"
          value={sar(summary.underReview)}
          hint="بعد منع التكرار بين الإجمالي والفروع"
          icon={AlertTriangle}
          tone={summary.underReview > 0 ? "negative" : "default"}
        />
        <StatCard
          label="قابلية الاسترداد المحتملة"
          value={sar(summary.potentialRecovery)}
          hint="فقط الفروقات المستقلة ذات اتجاه مالي واضح"
          icon={CircleDollarSign}
          tone="gold"
        />
        <StatCard
          label="تم استرداده"
          value={sar(summary.recovered)}
          hint="حسب المبالغ المسجلة في سير العمل"
          icon={BadgeDollarSign}
        />
      </section>

      <section className="rounded-[10px] border border-border bg-white p-3.5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative xl:col-span-2">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="بحث بالفترة أو الفرع أو البند…"
              className="ps-9"
            />
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">المفتوحة فقط</SelectItem>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(EXCEPTION_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger>
              <SelectValue placeholder="الأهمية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل مستويات الأهمية</SelectItem>
              {Object.entries(EXCEPTION_SEVERITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {exceptions.length === 0 ? (
        <section className="panel px-6 py-14 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-9 text-success" />
          <h2 className="text-lg font-bold">الملف نظيف</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            لا توجد فروقات مستقلة تتجاوز حدود التقريب ولا توجد مشكلة مطابقة فروع في هذا الملف.
          </p>
        </section>
      ) : (
      <section className="overflow-hidden rounded-[10px] border border-border bg-white">
        <div data-scroll className="max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[1600px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface-raised">
              <tr className="text-xs text-muted-foreground">
                <Th>الأهمية</Th>
                <Th>الفترة</Th>
                <Th>المنصة</Th>
                <Th>الفرع</Th>
                <Th>الفئة</Th>
                <Th>الاستثناء</Th>
                <Th>المحتسب</Th>
                <Th>المنصة</Th>
                <Th>الفرق</Th>
                <Th>محل المراجعة</Th>
                <Th>استرداد محتمل</Th>
                <Th>الحالة</Th>
                <Th>المسترد فعلياً</Th>
                <Th>ملاحظة</Th>
                <Th>الأدلة</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <ExceptionRow
                  key={item.id}
                  item={item}
                  saving={updateWorkflow.isPending}
                  onUpdate={(patch) =>
                    updateWorkflow.mutate({
                      periodId: item.periodId,
                      exceptionId: item.id,
                      patch,
                    })
                  }
                  onDetails={() => setSelectedException(item)}
                />
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-5 py-16 text-center text-muted-foreground">
                    <CheckCircle2 className="mx-auto mb-3 size-7 text-success" />
                    لا توجد استثناءات مطابقة للفلاتر الحالية.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      )}

      <EvidenceSheet
        open={Boolean(selectedException)}
        onOpenChange={(open) => {
          if (!open) setSelectedException(null);
        }}
        item={selectedException}
        period={selected}
      />
    </div>
  );
}

function ExceptionRow({
  item,
  saving,
  onUpdate,
  onDetails,
}: {
  item: AuditException;
  saving: boolean;
  onUpdate: (patch: Partial<ExceptionWorkflowEntry>) => void;
  onDetails: () => void;
}) {
  const [note, setNote] = useState(item.note ?? "");
  const [recovered, setRecovered] = useState(
    item.recoveredAmount ? String(item.recoveredAmount) : "",
  );

  useEffect(() => {
    setNote(item.note ?? "");
    setRecovered(item.recoveredAmount ? String(item.recoveredAmount) : "");
  }, [item.id, item.note, item.recoveredAmount]);

  return (
    <tr className="align-top hover:bg-secondary/35">
      <Td>
        <SeverityBadge severity={item.severity} />
      </Td>
      <Td>
        <div className="max-w-52">
          <p className="font-semibold">{item.periodLabel}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {arabicDate(item.periodStart)} — {arabicDate(item.periodEnd)}
          </p>
        </div>
      </Td>
      <Td>{item.platform === "hungerstation" ? "هنقرستيشن" : item.platform === "keeta" ? "كيتا" : "جاهز"}</Td>
      <Td>
        {item.branch ? (
          <div className="max-w-48">
            <p className="font-medium">{item.branch}</p>
            {item.branchId ? (
              <p className="text-[11px] text-muted-foreground">{item.branchId}</p>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">إجمالي الفترة</span>
        )}
      </Td>
      <Td>{item.categoryLabel}</Td>
      <Td>
        <div className="max-w-72">
          <p className="font-medium">{item.label}</p>
          {item.hint ? (
            <p className="mt-1 whitespace-normal text-[11px] leading-5 text-muted-foreground">
              {item.hint}
            </p>
          ) : null}
          {item.rollup ? (
            <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
              إجمالي رقابي — لا يدخل في جمع الأثر المالي
            </span>
          ) : null}
        </div>
      </Td>
      <MoneyCell value={item.computed} />
      <MoneyCell value={item.invoiced} />
      <MoneyCell value={item.difference} signed />
      <MoneyCell value={item.reviewAmount} />
      <MoneyCell value={item.potentialRecovery} />
      <Td>
        <Select
          value={item.status}
          disabled={saving}
          onValueChange={(value) => onUpdate({ status: value as ExceptionStatus })}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(EXCEPTION_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Td>
      <Td>
        <Input
          inputMode="decimal"
          value={recovered}
          onChange={(event) => setRecovered(event.target.value)}
          disabled={saving}
          onBlur={() => {
            const value = Number(recovered.replace(/,/g, ""));
            if (!Number.isFinite(value)) return;
            const capped = Math.min(Math.max(0, value), item.reviewAmount);
            if (value > item.reviewAmount) {
              toast.warning("المبلغ المسترد لا يمكن أن يتجاوز المبلغ محل المراجعة.");
              setRecovered(String(capped));
            }
            if (capped !== item.recoveredAmount) {
              onUpdate({ recoveredAmount: capped });
            }
          }}
          placeholder="0.00"
          className="h-8 w-28 text-xs"
        />
      </Td>
      <Td>
        <Input
          disabled={saving}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            const trimmed = note.trim();
            if (trimmed !== (item.note ?? "")) onUpdate({ note: trimmed || undefined });
          }}
          placeholder="ملاحظة المتابعة…"
          className="h-8 w-52 text-xs"
        />
      </Td>
      <Td>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onDetails}>
          <Eye className="size-3.5" />
          التفاصيل
        </Button>
      </Td>
    </tr>
  );
}



function EvidenceSheet({
  open,
  onOpenChange,
  item,
  period,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: AuditException | null;
  period: NonNullable<ReturnType<typeof useSelectedPeriod>["selected"]>;
}) {
  if (!item) return null;

  const evidence = buildExceptionEvidence(period, item);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-2xl" dir="rtl">
        <SheetHeader className="pe-7 text-start">
          <SheetTitle>مسار الأدلة</SheetTitle>
          <SheetDescription>
            {item.periodLabel}
            {item.branch ? " · " + item.branch : " · إجمالي الفترة"}
            {item.branchId ? " · " + item.branchId : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <EvidenceMetric label="المحتسب" value={item.computed} />
            <EvidenceMetric label="المنصة" value={item.invoiced} />
            <EvidenceMetric
              label="الفرق"
              value={item.difference}
              signed
              hint={"حد المطابقة: " + sar(item.tolerance)}
            />
          </section>

          <section className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="flex items-center gap-2">
              <FileSearch className="size-4 text-primary" />
              <h3 className="font-bold">سبب الاستثناء</h3>
            </div>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{evidence.reason}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-background px-2.5 py-1">
                {item.categoryLabel}
              </span>
              <span className="rounded-full bg-background px-2.5 py-1">
                {evidence.evidenceLabel}
              </span>
              <span className="rounded-full bg-background px-2.5 py-1">
                {item.sourceLevel === "branch" ? "مطابقة فرع" : "مطابقة إجمالية"}
              </span>
            </div>
          </section>

          <section className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2">
              <Calculator className="size-4 text-primary" />
              <h3 className="font-bold">طريقة الاحتساب</h3>
            </div>
            <p className="mt-3 rounded-lg bg-secondary px-3 py-3 text-sm leading-7">
              {evidence.formula}
            </p>
          </section>

          <EvidenceSourceSection
            title="مصادر Tadqeeq"
            icon={<Database className="size-4 text-primary" />}
            rows={evidence.calculatedSources}
          />

          <EvidenceSourceSection
            title="مصدر المنصة"
            icon={<FileSearch className="size-4 text-primary" />}
            rows={evidence.platformSources}
          />

          <section className="rounded-xl border border-border p-4">
            <h3 className="font-bold">النتيجة الرقابية</h3>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {evidence.conclusion}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <EvidenceMetric label="المبلغ محل المراجعة" value={item.reviewAmount} />
              <EvidenceMetric
                label="استرداد محتمل"
                value={item.potentialRecovery}
                hint="لا يعد مطالبة مؤكدة قبل المراجعة البشرية"
              />
            </div>
          </section>

          <AiExplanationPanel key={item.id} item={item} />

          <section className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2">
              <History className="size-4 text-primary" />
              <h3 className="font-bold">سير العمل</h3>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">الحالة الحالية</span>
              <span className="font-bold">{EXCEPTION_STATUS_LABELS[item.status]}</span>
            </div>
            {item.note ? (
              <div className="mt-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">الملاحظة: </span>
                {item.note}
              </div>
            ) : null}
            {item.recoveredAmount > 0 ? (
              <div className="mt-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">المسترد فعلياً: </span>
                <span className="num font-semibold">{sar(item.recoveredAmount)}</span>
              </div>
            ) : null}

            {evidence.workflow.length ? (
              <ol className="mt-4 space-y-3">
                {[...evidence.workflow].reverse().map((event, index) => (
                  <li
                    key={event.at + "-" + index}
                    className="border-s-2 border-border ps-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        {EXCEPTION_STATUS_LABELS[event.status]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {auditTimestamp(event.at)}
                      </span>
                    </div>
                    {event.note ? (
                      <p className="mt-1 text-muted-foreground">{event.note}</p>
                    ) : null}
                    {(event.recoveredAmount ?? 0) > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        المسترد: {sar(event.recoveredAmount)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                لا يوجد سجل تغييرات سابق لهذا الاستثناء حتى الآن.
              </p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AiExplanationPanel({ item }: { item: AuditException }) {
  const [result, setResult] = useState<ExceptionAiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!AI_UI_ENABLED) return null;

  async function explain() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى لاستخدام Tadqeeq AI.");
      }

      const response = await explainExceptionWithAi({
        data: {
          periodId: item.periodId,
          exceptionId: item.id,
          accessToken,
        },
      });
      setResult(response);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "تعذّر إنشاء شرح Tadqeeq AI لهذا الاستثناء.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const confidenceLabel =
    result?.explanation.confidence === "high"
      ? "ثقة عالية"
      : result?.explanation.confidence === "medium"
        ? "ثقة متوسطة"
        : "ثقة منخفضة";

  return (
    <section className="rounded-xl border border-primary/20 bg-secondary/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="font-bold">Tadqeeq AI</h3>
            <span className="rounded-full border border-primary/15 bg-white px-2 py-0.5 text-[10px] font-semibold text-primary">
              شرح فقط
            </span>
          </div>
          <p className="mt-1.5 max-w-xl text-xs leading-6 text-muted-foreground">
            يفسّر الاستثناء اعتماداً على الأدلة المنظمة التي حسبها Tadqeeq. لا يغيّر الأرقام أو
            حالة التدقيق، ولا تُرسل ملفات Excel أو CSV أو PDF الخام.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant={result ? "outline" : "default"}
          onClick={explain}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : result ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {loading ? "جارٍ التفسير…" : result ? "إعادة التفسير" : "فسّر هذا الاستثناء"}
        </Button>
      </div>

      {error && !result ? (
        <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2.5 text-xs leading-6 text-destructive">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-4 border-t border-primary/10 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-1 text-[10.5px] font-semibold",
                result.explanation.confidence === "high" && "bg-success/10 text-success",
                result.explanation.confidence === "medium" && "bg-warning/10 text-warning",
                result.explanation.confidence === "low" && "bg-destructive/10 text-destructive",
              )}
            >
              {confidenceLabel}
            </span>
            <span className="text-[10.5px] text-muted-foreground">
              تحليل مساعد — نتيجة Tadqeeq الأصلية تبقى المرجع
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground">الخلاصة</p>
            <p className="mt-1 text-sm font-medium leading-7">{result.explanation.summary}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AiTextBlock title="لماذا يهم؟" text={result.explanation.whyItMatters} />
            <AiTextBlock
              title="القراءة المالية"
              text={result.explanation.financialInterpretation}
            />
          </div>

          <AiList title="الأدلة التي اعتمد عليها الشرح" items={result.explanation.evidence} />
          <AiList title="الخطوات المقترحة للمراجعة" items={result.explanation.nextSteps} />

          {result.explanation.limitations.length ? (
            <AiList
              title="حدود هذا التفسير"
              items={result.explanation.limitations}
              muted
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AiTextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-white/70 p-3">
      <p className="text-[11px] font-semibold text-muted-foreground">{title}</p>
      <p className="mt-1.5 text-xs leading-6 text-foreground/90">{text}</p>
    </div>
  );
}

function AiList({
  title,
  items,
  muted = false,
}: {
  title: string;
  items: string[];
  muted?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", muted ? "border-border bg-background/50" : "border-border/70 bg-white/70")}>
      <p className="text-[11px] font-semibold text-muted-foreground">{title}</p>
      <ul className="mt-2 list-disc space-y-1.5 ps-5 text-xs leading-6">
        {items.map((item, index) => (
          <li key={index} className={muted ? "text-muted-foreground" : "text-foreground/90"}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceSourceSection({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: ReactNode;
  rows: Array<{ label: string; source: string; value?: number | string }>;
}) {
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-bold">{title}</h3>
      </div>
      {rows.length ? (
        <dl className="mt-3 divide-y divide-border/60">
          {rows.map((row, index) => (
            <div
              key={row.label + "-" + index}
              className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
            >
              <div>
                <dt className="text-sm font-medium">{row.label}</dt>
                <dd className="mt-0.5 text-xs text-muted-foreground">{row.source}</dd>
              </div>
              <dd className="num text-sm font-semibold">
                {typeof row.value === "number" ? sar(row.value) : row.value ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          لا توجد حقول مصدر إضافية محفوظة لهذا الاستثناء.
        </p>
      )}
    </section>
  );
}

function EvidenceMetric({
  label,
  value,
  signed = false,
  hint,
}: {
  label: string;
  value?: number;
  signed?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num mt-1 text-base font-bold",
          signed && (value ?? 0) > 0 && "text-destructive",
          signed && (value ?? 0) < 0 && "text-success",
        )}
      >
        {value === undefined ? "—" : sar(value)}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function auditTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function SeverityBadge({ severity }: { severity: ExceptionSeverity }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold",
        severity === "critical" && "bg-destructive/15 text-destructive",
        severity === "high" && "bg-warning/15 text-warning",
        severity === "medium" && "bg-primary/15 text-primary",
        severity === "low" && "bg-secondary text-muted-foreground",
      )}
    >
      {EXCEPTION_SEVERITY_LABELS[severity]}
    </span>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return <td className="whitespace-nowrap border-b border-border/60 px-3.5 py-2.5">{children}</td>;
}

function MoneyCell({ value, signed = false }: { value?: number; signed?: boolean }) {
  if (value === undefined) {
    return (
      <Td>
        <span className="text-muted-foreground">—</span>
      </Td>
    );
  }
  return (
    <Td>
      <span
        className={cn(
          "num font-medium",
          signed && value > 0 && "text-destructive",
          signed && value < 0 && "text-success",
        )}
      >
        {sar(value)}
      </span>
    </Td>
  );
}
