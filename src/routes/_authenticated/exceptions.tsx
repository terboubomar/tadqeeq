import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PRODUCTS, productPageTitle } from "@/lib/products";
import { ProductName } from "@/components/ProductName";
import { createFileRoute } from "@tanstack/react-router";
import {
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Database,
  Eye,
  FileSearch,
  History,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/AppShell";
import { AI_UI_ENABLED } from "@/lib/ai/config";
import { explainExceptionWithAi } from "@/lib/ai/exception-ai.functions";
import type { ExceptionAiResult } from "@/lib/ai/exception-ai";
import { ActionBar, ActionDivider, DetailPanel, ListDetail, PageHeader } from "@/components/workspace/PageKit";
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
import { arabicDate, money, sar } from "@/lib/format";
import { updateExceptionWorkflow } from "@/lib/periods";
import { useBranchLabel } from "@/lib/use-branch-label";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";
import { PlatformName } from "@/components/brand/PlatformLogo";

export const Route = createFileRoute("/_authenticated/exceptions")({
  head: () => ({
    meta: [
      { title: productPageTitle("radar") },
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
  const branchLabel = useBranchLabel();
  const { selected, isLoading } = useSelectedPeriod();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("all");
  const [selectedException, setSelectedException] = useState<AuditException | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

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
        branchLabel(item.platform, item.branchId, item.branch),
        item.branchId,
        item.categoryLabel,
        item.label,
        item.note,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [branchLabel, exceptions, query, severity, status]);

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

  const active = filtered.find((item) => item.id === activeId) ?? filtered[0] ?? null;
  const update = (item: AuditException, patch: Partial<ExceptionWorkflowEntry>) =>
    updateWorkflow.mutate({ periodId: item.periodId, exceptionId: item.id, patch });
  // From xl up the row fills the detail panel beside the list; on smaller screens it opens the sheet.
  const openItem = (item: AuditException) => {
    setActiveId(item.id);
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches) setSelectedException(item);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التدقيق" }, { label: PRODUCTS.radar.name }]}
        title={<ProductName product="radar" />}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {selected.label} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)} ·
            <PlatformName platform={selected.platform} iconClassName="size-4 rounded" />
          </span>
        }
        aside={
          <span className="rounded-full border border-border bg-card px-3 py-1 text-[12px] text-muted-foreground">
            {exceptions.length} استثناء في الملف المحدد
          </span>
        }
      />

      <RadarSummary
        summary={summary}
        exceptions={exceptions}
        severity={severity}
        onSeverity={setSeverity}
      />

      <ActionBar>
        <div className="relative min-w-0 flex-[1_1_240px]">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="بحث بالفترة أو الفرع أو البند…"
            aria-label="بحث في الاستثناءات"
            className="h-9 border-0 bg-transparent ps-9 shadow-none focus-visible:ring-1"
          />
        </div>
        <ActionDivider />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="الحالة" className="h-9 w-auto min-w-36 gap-2 rounded-lg">
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
      </ActionBar>

      <p className="flex max-w-[90ch] items-start gap-2 text-[12px] leading-6 text-muted-foreground">
        <Info className="mt-1 size-3.5 shrink-0" aria-hidden />
        الفروقات القابلة للإجراء في هذا الملف فقط.
      </p>

      {exceptions.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-9 text-success" />
          <h2 className="text-lg font-bold">الملف نظيف</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            لا توجد فروقات مستقلة تتجاوز حدود التقريب ولا توجد مشكلة مطابقة فروع في هذا الملف.
          </p>
        </section>
      ) : (
        <ListDetail
          list={
            <ExceptionList
              items={filtered}
              activeId={active?.id ?? null}
              onOpen={openItem}
            />
          }
          detail={
            active ? (
              <ExceptionDetail
                key={active.id}
                item={active}
                period={selected}
                saving={updateWorkflow.isPending}
                onUpdate={(patch) => update(active, patch)}
                onEvidence={() => setSelectedException(active)}
              />
            ) : null
          }
        />
      )}

      <EvidenceSheet
        open={Boolean(selectedException)}
        onOpenChange={(open) => {
          if (!open) setSelectedException(null);
        }}
        item={selectedException ? (exceptions.find((item) => item.id === selectedException.id) ?? selectedException) : null}
        period={selected}
        saving={updateWorkflow.isPending}
        onUpdate={(patch) => {
          if (selectedException) update(selectedException, patch);
        }}
      />
    </div>
  );
}

const SEVERITY_ORDER: ExceptionSeverity[] = ["critical", "high", "medium", "low"];

/**
 * One card for the period: potential recovery as the headline figure, the other three figures beside it, and the
 * open exceptions split by severity. The severity legend is also the severity filter.
 */
function RadarSummary({
  summary,
  exceptions,
  severity,
  onSeverity,
}: {
  summary: ReturnType<typeof summarizeExceptions>;
  exceptions: AuditException[];
  severity: string;
  onSeverity: (value: string) => void;
}) {
  const open = exceptions.filter((item) => item.status !== "closed" && item.status !== "recovered");
  const bySeverity = SEVERITY_ORDER.map((level) => {
    const items = open.filter((item) => item.severity === level);
    return { level, count: items.length, amount: items.reduce((sum, item) => sum + item.reviewAmount, 0) };
  });
  return (
    <section aria-label="ملخص الاستثناءات" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 bg-card px-5 py-5 lg:col-span-1">
          <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <CircleDollarSign className="size-4 text-primary-text" aria-hidden />
            قابلية الاسترداد المحتملة
          </p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="num text-[30px] font-semibold leading-none tracking-[-0.02em] text-primary-text sm:text-[36px]">
              {money(summary.potentialRecovery)}
            </span>
            <span className="text-[13px] text-muted-foreground">ر.س</span>
          </p>
          <p className="mt-2 text-[12px] leading-5 text-muted-foreground">الفروقات المستقلة ذات الاتجاه المالي الواضح</p>
        </div>
        <SummaryStat
          label="الاستثناءات المفتوحة"
          value={String(summary.openCount)}
          hint={summary.criticalCount ? `${summary.criticalCount} حرجة` : "لا يوجد حرج"}
          tone={summary.criticalCount ? "danger" : undefined}
        />
        <SummaryStat label="المبالغ محل المراجعة" value={sar(summary.underReview)} hint="بعد منع التكرار بين الإجمالي والفروع" />
        <SummaryStat
          label="تم استرداده"
          value={sar(summary.recovered)}
          hint="حسب المبالغ المسجلة في سير العمل"
          tone={summary.recovered > 0 ? "success" : undefined}
          wide
        />
      </div>
      {open.length ? (
        <div className="border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12.5px] font-semibold">المفتوحة حسب الأهمية</p>
            {severity !== "all" ? (
              <button type="button" onClick={() => onSeverity("all")} className="text-[12px] font-semibold text-primary-text underline-offset-4 hover:underline">
                كل المستويات
              </button>
            ) : null}
          </div>
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            {bySeverity.map(({ level, count }) =>
              count ? <span key={level} className={cn("h-full", SEVERITY_MARK[level])} style={{ width: `${(count / open.length) * 100}%` }} /> : null,
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="تصفية حسب الأهمية">
            {bySeverity.map(({ level, count, amount }) => (
              <button
                key={level}
                type="button"
                aria-pressed={severity === level}
                disabled={!count}
                onClick={() => onSeverity(severity === level ? "all" : level)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors disabled:opacity-45",
                  severity === level ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/30",
                )}
              >
                <span className={cn("size-2 rounded-[2px]", SEVERITY_MARK[level])} aria-hidden />
                {EXCEPTION_SEVERITY_LABELS[level]}
                <span className="num font-semibold">{count}</span>
                {count ? <span className={cn("num hidden sm:inline", severity === level ? "text-background/70" : "text-muted-foreground")}>{sar(amount)}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryStat({
  label,
  value,
  hint,
  tone,
  wide = false,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "danger" | "success";
  /** Spans both columns on phones (the odd one out of three). */
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0 bg-card px-5 py-5", wide && "col-span-2 lg:col-span-1")}>
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num mt-2 truncate text-[19px] font-semibold tracking-[-0.01em] sm:text-[22px]",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

const STATUS_PILL: Record<ExceptionStatus, string> = {
  new: "bg-destructive-soft text-destructive",
  reviewing: "bg-secondary text-primary-text",
  contacted: "bg-muted text-muted-foreground",
  disputed: "bg-ink/10 text-foreground",
  recovered: "bg-success-soft text-success",
  closed: "bg-muted text-muted-foreground",
};

const SEVERITY_MARK: Record<ExceptionSeverity, string> = {
  critical: "bg-destructive",
  high: "bg-warning",
  medium: "bg-primary",
  low: "bg-ink-muted",
};

function StatusPill({ status }: { status: ExceptionStatus }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold", STATUS_PILL[status])}>
      {EXCEPTION_STATUS_LABELS[status]}
    </span>
  );
}

/** Compact list: a table from md up, cards on phones. The row opens the detail panel or sheet. */
function ExceptionList({
  items,
  activeId,
  onOpen,
}: {
  items: AuditException[];
  activeId: string | null;
  onOpen: (item: AuditException) => void;
}) {
  const branchLabel = useBranchLabel();
  if (!items.length) {
    return (
      <section className="rounded-2xl border border-border bg-card px-5 py-16 text-center text-sm text-muted-foreground">
        <CheckCircle2 className="mx-auto mb-3 size-7 text-success" />
        لا توجد استثناءات مطابقة للفلاتر الحالية.
      </section>
    );
  }
  return (
    <>
      <section className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <div data-scroll className="max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface-raised">
              <tr className="text-xs text-muted-foreground">
                <Th>الاستثناء</Th>
                <Th>الفرع</Th>
                <Th end>الفرق</Th>
                <Th end>محل المراجعة</Th>
                <Th>الحالة</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const on = item.id === activeId;
                return (
                  <tr
                    key={item.id}
                    className={cn("align-top transition-colors hover:bg-secondary/35", on && "bg-secondary/50 shadow-[inset_-3px_0_0_var(--color-primary)]")}
                  >
                    <Td>
                      <button type="button" onClick={() => onOpen(item)} className="flex max-w-80 items-start gap-2.5 text-start">
                        <span
                          title={EXCEPTION_SEVERITY_LABELS[item.severity]}
                          className={cn("mt-1.5 size-2.5 shrink-0 rounded-[3px]", SEVERITY_MARK[item.severity])}
                        />
                        <span className="min-w-0 whitespace-normal">
                          <span className="block font-semibold text-foreground hover:text-primary-text">{item.label}</span>
                          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                            {EXCEPTION_SEVERITY_LABELS[item.severity]} · {item.categoryLabel}
                            {item.rollup ? " · إجمالي رقابي" : ""}
                          </span>
                        </span>
                      </button>
                    </Td>
                    <Td>
                      {item.branch ? (
                        <span className="block max-w-44 truncate" title={item.branch}>{branchLabel(item.platform, item.branchId, item.branch)}</span>
                      ) : (
                        <span className="text-muted-foreground">إجمالي الفترة</span>
                      )}
                    </Td>
                    <MoneyCell value={item.difference} signed />
                    <MoneyCell value={item.reviewAmount} />
                    <Td><StatusPill status={item.status} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <ul className="space-y-2 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-start transition-colors hover:bg-secondary/35"
            >
              <span className={cn("mt-1.5 size-2.5 shrink-0 self-start rounded-[3px]", SEVERITY_MARK[item.severity])} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-6">{item.label}</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                  {item.branch ? branchLabel(item.platform, item.branchId, item.branch) : "إجمالي الفترة"} · {EXCEPTION_SEVERITY_LABELS[item.severity]}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="num text-[13px] font-semibold">{sar(item.reviewAmount)}</span>
                <StatusPill status={item.status} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Detail panel beside the list: the amounts, the formula, the workflow fields and a link to the full evidence. */
function ExceptionDetail({
  item,
  period,
  saving,
  onUpdate,
  onEvidence,
}: {
  item: AuditException;
  period: NonNullable<ReturnType<typeof useSelectedPeriod>["selected"]>;
  saving: boolean;
  onUpdate: (patch: Partial<ExceptionWorkflowEntry>) => void;
  onEvidence: () => void;
}) {
  const branchLabel = useBranchLabel();
  const evidence = buildExceptionEvidence(period, item);
  return (
    <DetailPanel
      eyebrow={(item.branch ? branchLabel(item.platform, item.branchId, item.branch) : "إجمالي الفترة") + " · " + EXCEPTION_SEVERITY_LABELS[item.severity] + " · " + item.categoryLabel}
      title={item.label}
      value={sar(item.reviewAmount)}
    >
      <dl className="divide-y divide-border/70 rounded-xl border border-border text-[13px]">
        {[
          { label: "المحتسب حسب العقد", value: item.computed },
          { label: "حسب المنصة", value: item.invoiced },
          { label: "الفرق", value: item.difference, signed: true },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "num font-semibold",
                row.signed && (row.value ?? 0) > 0 && "text-destructive",
                row.signed && (row.value ?? 0) < 0 && "text-success",
              )}
            >
              {row.value === undefined ? "—" : sar(row.value)}
            </dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-[12px] font-semibold">طريقة الاحتساب</p>
        <p className="mt-1.5 rounded-xl bg-surface-raised px-3 py-2.5 text-[12.5px] leading-6">{evidence.formula}</p>
      </div>
      <WorkflowFields item={item} saving={saving} onUpdate={onUpdate} />
      <Button type="button" variant="outline" className="w-full gap-1.5" onClick={onEvidence}>
        <Eye className="size-4" />
        مسار الأدلة الكامل{AI_UI_ENABLED ? " وشرح Tadqeeq AI" : ""}
      </Button>
    </DetailPanel>
  );
}

/** Status, recovered amount and follow-up note for one exception; saved on change or blur. */
function WorkflowFields({
  item,
  saving,
  onUpdate,
}: {
  item: AuditException;
  saving: boolean;
  onUpdate: (patch: Partial<ExceptionWorkflowEntry>) => void;
}) {
  const [note, setNote] = useState(item.note ?? "");
  const [recovered, setRecovered] = useState(item.recoveredAmount ? String(item.recoveredAmount) : "");

  useEffect(() => {
    setNote(item.note ?? "");
    setRecovered(item.recoveredAmount ? String(item.recoveredAmount) : "");
  }, [item.id, item.note, item.recoveredAmount]);

  return (
    <div className="space-y-2.5">
      <label className="block space-y-1">
        <span className="text-[12px] text-muted-foreground">الحالة</span>
        <Select value={item.status} disabled={saving} onValueChange={(value) => onUpdate({ status: value as ExceptionStatus })}>
          <SelectTrigger className="h-9">
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
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-muted-foreground">المسترد فعلياً (ر.س)</span>
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
          className="h-9"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-muted-foreground">ملاحظة المتابعة</span>
        <Input
          disabled={saving}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            const trimmed = note.trim();
            if (trimmed !== (item.note ?? "")) onUpdate({ note: trimmed || undefined });
          }}
          placeholder="ملاحظة المتابعة…"
          className="h-9"
        />
      </label>
    </div>
  );
}

function EvidenceSheet({
  open,
  onOpenChange,
  item,
  period,
  saving,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: AuditException | null;
  period: NonNullable<ReturnType<typeof useSelectedPeriod>["selected"]>;
  saving: boolean;
  onUpdate: (patch: Partial<ExceptionWorkflowEntry>) => void;
}) {
  const branchLabel = useBranchLabel();
  if (!item) return null;

  const evidence = buildExceptionEvidence(period, item);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-2xl" dir="rtl">
        <SheetHeader className="pe-7 text-start">
          <SheetTitle>مسار الأدلة</SheetTitle>
          <SheetDescription>
            {item.periodLabel}
            {item.branch ? " · " + branchLabel(item.platform, item.branchId, item.branch) : " · إجمالي الفترة"}
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
            <div className="mt-3">
              <WorkflowFields item={item} saving={saving} onUpdate={onUpdate} />
            </div>

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

      const response = await explainExceptionWithAi({
        data: {
          periodId: item.periodId,
          exceptionId: item.id,
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
            شرح مبني على أدلة التدقيق، لا يغيّر الأرقام.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant={result ? "outline" : "default"}
          onClick={explain}
          disabled={loading}
          className="shrink-0"
          aria-busy={loading}
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

function Th({ children, end = false }: { children: ReactNode; end?: boolean }) {
  return (
    <th className={cn("whitespace-nowrap border-b border-border px-3.5 py-2.5 text-[11.5px] font-semibold", end ? "text-end" : "text-start")}>
      {children}
    </th>
  );
}

function Td({ children, end = false }: { children: ReactNode; end?: boolean }) {
  return <td className={cn("whitespace-nowrap border-b border-border/60 px-3.5 py-2.5", end && "text-end")}>{children}</td>;
}

function MoneyCell({ value, signed = false }: { value?: number; signed?: boolean }) {
  if (value === undefined) {
    return (
      <Td end>
        <span className="text-muted-foreground">—</span>
      </Td>
    );
  }
  return (
    <Td end>
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
