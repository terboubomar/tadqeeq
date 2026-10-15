import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCTS, productPageTitle } from "@/lib/products";
import { ProductName } from "@/components/ProductName";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Database,
  Eye,
  FileSearch,
  FileText,
  History,
  Info,
  Loader2,
  Paperclip,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  Trash2,
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
  CLAIM_EXCEPTION_STATUSES,
  EXCEPTION_SEVERITY_LABELS,
  EXCEPTION_STATUS_LABELS,
  summarizeExceptions,
  type AuditException,
  type ExceptionItemStatus,
  type ExceptionSeverity,
  type ExceptionStatus,
  type ExceptionWorkflowEntry,
  isOpenException,
} from "@/lib/exceptions";
import { arabicDate, money, sar } from "@/lib/format";
import {
  applyClassificationRules,
  classifyLines,
  disputeLetter,
  ITEM_STATUS_LABELS,
  itemDecisionsPatch,
  requiredEvidence,
  type ClassificationRule,
} from "@/lib/exception-recovery";
import {
  addClassificationRule,
  deleteClassificationRule,
  exceptionDocumentUrl,
  listClassificationRules,
  uploadExceptionDocument,
} from "@/lib/exception-recovery.data";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { updateExceptionWorkflow } from "@/lib/periods";
import { useBranchLabel } from "@/lib/use-branch-label";
import { setSelectedPeriodId, useSelectedPeriod } from "@/lib/use-period";
import { monthLabel, unmatchedForException, unmatchedJahezCompensations } from "@/lib/jahez-unmatched";
import { reanalyzeAuditPeriod } from "@/lib/reanalyze-period.functions";
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

  const { data: rules = [] } = useQuery({ queryKey: ["exception-rules"], queryFn: listClassificationRules, retry: false });
  const [letterOpen, setLetterOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const exceptions = useMemo(
    () => (selected ? applyClassificationRules(buildPeriodExceptions(selected), rules) : []),
    [selected, rules],
  );
  const summary = useMemo(() => summarizeExceptions(exceptions), [exceptions]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exceptions.filter((item) => {
      if (
        status === "open" &&
        !isOpenException(item)
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
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-card px-3 py-1 text-[12px] text-muted-foreground">
              {exceptions.length} استثناء في الملف المحدد
            </span>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => setRulesOpen(true)}>
              <Tags className="size-4" />
              قواعد التصنيف
            </Button>
            <Button type="button" size="sm" className="gap-1.5 rounded-full" disabled={!summary.claimable} onClick={() => setLetterOpen(true)}>
              <FileText className="size-4" />
              خطاب الاعتراض
            </Button>
          </span>
        }
      />
      <DisputeLetterDialog open={letterOpen} onOpenChange={setLetterOpen} period={selected} items={exceptions} />
      <ClassificationRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} rules={rules} />

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
                rules={rules}
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
  const open = exceptions.filter(isOpenException);
  const bySeverity = SEVERITY_ORDER.map((level) => {
    const items = open.filter((item) => item.severity === level);
    return { level, count: items.length, amount: items.reduce((sum, item) => sum + item.reviewAmount, 0) };
  });
  return (
    <section aria-label="ملخص الاستثناءات" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
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
        <SummaryStat label="قابل للمطالبة" value={sar(summary.claimable)} hint="البنود المعلّمة قابلة للمطالبة أو المُعترض عليها" />
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
  evidence_requested: "bg-warning/15 text-foreground",
  classified: "bg-muted text-foreground",
  claimable: "bg-primary/15 text-primary-text",
  contacted: "bg-muted text-muted-foreground",
  disputed: "bg-ink/10 text-foreground",
  recovered: "bg-success-soft text-success",
  rejected: "bg-destructive-soft text-destructive",
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
  rules,
}: {
  item: AuditException;
  period: NonNullable<ReturnType<typeof useSelectedPeriod>["selected"]>;
  saving: boolean;
  onUpdate: (patch: Partial<ExceptionWorkflowEntry>) => void;
  onEvidence: () => void;
  rules: ClassificationRule[];
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
      {item.code === "JAHEZ_COMPENSATION_UNKNOWN_ORDER" ? <MissingOrderFile item={item} period={period} /> : null}
      <EvidenceRequest item={item} period={period} saving={saving} onUpdate={onUpdate} rules={rules} />
      <WorkflowFields item={item} saving={saving} onUpdate={onUpdate} />
      <Button type="button" variant="outline" className="w-full gap-1.5" onClick={onEvidence}>
        <Eye className="size-4" />
        مسار الأدلة الكامل{AI_UI_ENABLED ? " وشرح Tadqeeq AI" : ""}
      </Button>
    </DetailPanel>
  );
}

/**
 * A Jahez compensation whose order is in no saved order file: which order file to upload, and, once a saved period
 * holds the order, a re-run of this period's analysis to match it. Stays out of the claimable total until matched.
 */
function MissingOrderFile({ item, period }: { item: AuditException; period: NonNullable<ReturnType<typeof useSelectedPeriod>["selected"]> }) {
  const { periods } = useSelectedPeriod();
  const { can } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const missing = unmatchedForException(item.branchId, unmatchedJahezCompensations(period, periods));
  const rematch = useMutation({
    mutationFn: () => reanalyzeAuditPeriod({ data: { periodId: period.id } }),
    onSuccess: async (response) => {
      setSelectedPeriodId(response.periodId);
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast.success("أُعيدت مطابقة تعويضات الفترة مع كل ملفات الطلبات المحفوظة.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!missing) return null;
  return (
    <div className="rounded-xl border border-border bg-surface-raised px-3 py-3 text-[12.5px] leading-6">
      <p className="font-semibold">الملف المطلوب للمطابقة</p>
      {missing.foundIn ? (
        <p className="mt-1">
          الطلب <span className="num">{missing.orderId}</span> موجود الآن في فترة «{missing.foundIn.periodLabel}». أعد مطابقة هذه الفترة ليُربط
          التعويض بطلبه.
        </p>
      ) : (
        <p className="mt-1">
          ملف طلبات جاهز لفرع «{missing.branch}»
          {missing.neededMonths.length ? <> لشهر {missing.neededMonths.map(monthLabel).join(" أو ")}</> : <> للشهر الذي فيه الطلب</>}، فيه
          الطلب <span className="num">{missing.orderId}</span>. لا يُحتسب التعويض ضمن المبالغ القابلة للاسترداد حتى يُطابق.
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {missing.foundIn ? (
          can("periods.reanalyze") ? (
            <Button type="button" size="sm" className="rounded-full" disabled={rematch.isPending} onClick={() => rematch.mutate()}>
              {rematch.isPending ? "جارٍ المطابقة…" : "أعد المطابقة"}
            </Button>
          ) : (
            <span className="text-muted-foreground">إعادة المطابقة تحتاج صلاحية إعادة التحليل.</span>
          )
        ) : can("imports.create") ? (
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/import" search={{ platform: "jahez" }}>
              ارفع ملف طلبات جاهز
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
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
  const [owner, setOwner] = useState(item.owner ?? "");
  const [classification, setClassification] = useState(item.classification ?? "");
  const [claimable, setClaimable] = useState(item.claimableAmount ? String(item.claimableAmount) : "");

  useEffect(() => {
    setNote(item.note ?? "");
    setRecovered(item.recoveredAmount ? String(item.recoveredAmount) : "");
    setOwner(item.owner ?? "");
    setClassification(item.classification ?? "");
    setClaimable(item.claimableAmount ? String(item.claimableAmount) : "");
  }, [item.id, item.note, item.recoveredAmount, item.owner, item.classification, item.claimableAmount]);
  const claimOpen = CLAIM_EXCEPTION_STATUSES.has(item.status);

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
        <span className="text-[12px] text-muted-foreground">المسؤول عن المتابعة</span>
        <Input
          disabled={saving}
          value={owner}
          maxLength={120}
          onChange={(event) => setOwner(event.target.value)}
          onBlur={() => {
            const trimmed = owner.trim();
            if (trimmed !== (item.owner ?? "")) onUpdate({ owner: trimmed || null });
          }}
          placeholder="اسم أو دور، مثل: المحاسب"
          className="h-9"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-muted-foreground">التصنيف</span>
        <Input
          disabled={saving}
          value={classification}
          maxLength={200}
          onChange={(event) => setClassification(event.target.value)}
          onBlur={() => {
            const trimmed = classification.trim();
            if (trimmed !== (item.classification ?? "")) onUpdate({ classification: trimmed || null });
          }}
          placeholder="مثل: أجهزة، غير خاضع للعمولة"
          className="h-9"
        />
      </label>
      {claimOpen ? (
        <label className="block space-y-1">
          <span className="text-[12px] text-muted-foreground">المبلغ المطالَب به (ر.س)</span>
          <Input
            inputMode="decimal"
            value={claimable}
            onChange={(event) => setClaimable(event.target.value)}
            disabled={saving}
            onBlur={() => {
              const value = Number(claimable.replace(/,/g, ""));
              if (!claimable.trim() || !Number.isFinite(value) || value < 0) return;
              if (value !== item.claimableAmount) onUpdate({ claimableAmount: value });
            }}
            placeholder={money(item.claimableAmount)}
            className="h-9"
          />
        </label>
      ) : null}
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

/** What document settles the exception, and the documents attached to it so far. */
function EvidenceRequest({
  item,
  period,
  saving,
  onUpdate,
  rules,
}: {
  item: AuditException;
  period: NonNullable<ReturnType<typeof useSelectedPeriod>["selected"]>;
  saving: boolean;
  onUpdate: (patch: Partial<ExceptionWorkflowEntry>) => void;
  rules: ClassificationRule[];
}) {
  const { context, can } = useWorkspaceAccess();
  const [uploading, setUploading] = useState(false);
  const needed = requiredEvidence(item);
  const canManage = can("exceptions.manage");

  async function attach(file: File) {
    setUploading(true);
    try {
      const attachment = await uploadExceptionDocument(context.workspaceId, period.id, item.id, file);
      onUpdate({ attachments: [...item.attachments, attachment] });
      toast.success("أُرفق المستند.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إرفاق المستند.");
    } finally {
      setUploading(false);
    }
  }

  async function open(path: string) {
    try {
      window.open(await exceptionDocumentUrl(path), "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر فتح المستند.");
    }
  }

  return (
    <div className="rounded-xl border border-border px-3 py-3 text-[12.5px] leading-6">
      <p className="font-semibold">المستند المطلوب</p>
      <p className="mt-1">{needed.document}</p>
      <p className="mt-1 text-muted-foreground">
        المبلغ المطلوب تفسيره <span className="num">{sar(needed.expectedAmount)}</span>
        {needed.branch ? <> · الفرع {needed.branch}</> : " · على مستوى الفترة"}
      </p>
      {item.lines?.length ? (
        <ItemDecisions
          key={item.id + JSON.stringify(item.items)}
          item={item}
          rules={rules}
          canManage={canManage}
          saving={saving}
          onUpdate={onUpdate}
        />
      ) : null}
      {item.attachments.length ? (
        <ul className="mt-2 space-y-1">
          {item.attachments.map((attachment) => (
            <li key={attachment.path}>
              <button type="button" className="inline-flex items-center gap-1.5 text-primary-text underline-offset-4 hover:underline" onClick={() => open(attachment.path)}>
                <Paperclip className="size-3.5" />
                {attachment.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {canManage ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <label className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12px] font-semibold", (saving || uploading) && "pointer-events-none opacity-50")}>
            <Paperclip className="size-3.5" />
            {uploading ? "جارٍ الرفع…" : "أرفق مستنداً"}
            <input
              type="file"
              className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void attach(file);
              }}
            />
          </label>
          {item.status === "new" || item.status === "reviewing" ? (
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full text-[12px]" disabled={saving} onClick={() => onUpdate({ status: "evidence_requested" })}>
              اطلب المستند
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Each charge inside a combined exception with its own decision: pending, a valid fee, or claimable, and the
 * document it rests on. Once every charge is decided the exception follows them (see itemDecisionsPatch).
 */
function ItemDecisions({
  item,
  rules,
  canManage,
  saving,
  onUpdate,
}: {
  item: AuditException;
  rules: ClassificationRule[];
  canManage: boolean;
  saving: boolean;
  onUpdate: (patch: Partial<ExceptionWorkflowEntry>) => void;
}) {
  const lines = classifyLines(item, rules);
  const saved = lines.map((line) => {
    const decision = item.items.find((entry) => entry.line === line.label);
    return { line: line.label, status: decision?.status ?? ("pending" as ExceptionItemStatus), documentRef: decision?.documentRef ?? "" };
  });
  const [draft, setDraft] = useState(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const decided = draft.filter((entry) => entry.status !== "pending").length;
  const update = (index: number, change: Partial<(typeof draft)[number]>) =>
    setDraft((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...change } : entry)));

  return (
    <div className="mt-2 rounded-lg border border-border">
      <ul className="divide-y divide-border/70">
        {lines.map((line, index) => {
          const entry = draft[index]!;
          return (
            <li key={line.label + index} className="space-y-1.5 px-2.5 py-2">
              <div className="flex items-start justify-between gap-3">
                <span>
                  {line.label}
                  <span className="block text-[11.5px] text-muted-foreground">
                    {line.rule ? `${line.rule.classification} · ${line.rule.claimable ? "قابل للمطالبة" : "رسم مستحق"}` : "بلا قاعدة تصنيف"}
                  </span>
                </span>
                <span className="num shrink-0">{sar(line.amount)}</span>
              </div>
              {canManage ? (
                <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr]">
                  <Select
                    value={entry.status}
                    disabled={saving}
                    onValueChange={(value) => update(index, { status: value as ExceptionItemStatus })}
                  >
                    <SelectTrigger aria-label={`حالة ${line.label}`} className="h-8 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ITEM_STATUS_LABELS) as ExceptionItemStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {ITEM_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`مرجع مستند ${line.label}`}
                    className="h-8 text-[12px]"
                    placeholder="مرجع المستند (رقم الفاتورة أو الاتفاقية)"
                    maxLength={200}
                    value={entry.documentRef}
                    disabled={saving}
                    onChange={(event) => update(index, { documentRef: event.target.value })}
                  />
                </div>
              ) : (
                <p className="text-[11.5px] text-muted-foreground">
                  {ITEM_STATUS_LABELS[entry.status]}
                  {entry.documentRef ? ` · المرجع: ${entry.documentRef}` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-2.5 py-2 text-[11.5px] text-muted-foreground">
        <span>
          تقرر <span className="num">{decided}</span> من <span className="num">{lines.length}</span> بنود
          {decided === lines.length ? " · تتبعها حالة الاستثناء" : ""}
        </span>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-full text-[12px]"
            disabled={saving || !dirty}
            onClick={() =>
              onUpdate(
                itemDecisionsPatch(
                  item,
                  draft.map((entry) => ({ line: entry.line, status: entry.status, documentRef: entry.documentRef.trim() || null })),
                ),
              )
            }
          >
            احفظ قرارات البنود
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The dispute letter to the platform, in Arabic and English, from the period's claimable items. */
function DisputeLetterDialog({
  open,
  onOpenChange,
  period,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: NonNullable<ReturnType<typeof useSelectedPeriod>["selected"]>;
  items: AuditException[];
}) {
  const letter = useMemo(() => disputeLetter(period, items.filter(isOpenException)), [period, items]);
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const text = letter ? (language === "ar" ? letter.arabic : letter.english) : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>خطاب الاعتراض</DialogTitle>
          <DialogDescription>
            {letter ? (
              <>
                <span className="num">{letter.items.length}</span> بند قابل للمطالبة بإجمالي <span className="num">{sar(letter.total)}</span>. راجع النص ثم انسخه وأرسله للمنصة مع المرفقات.
              </>
            ) : (
              "لا توجد بنود قابلة للمطالبة. علّم البنود «قابل للمطالبة» أولاً."
            )}
          </DialogDescription>
        </DialogHeader>
        {letter ? (
          <>
            <div className="flex gap-2" role="group" aria-label="لغة الخطاب">
              {(["ar", "en"] as const).map((value) => (
                <Button key={value} type="button" size="sm" variant={language === value ? "default" : "outline"} className="rounded-full" onClick={() => setLanguage(value)}>
                  {value === "ar" ? "العربية" : "English"}
                </Button>
              ))}
            </div>
            <Textarea readOnly dir={language === "ar" ? "rtl" : "ltr"} value={text} className="min-h-72 text-[13px] leading-7" />
            <DialogFooter>
              <Button
                type="button"
                className="gap-1.5"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    toast.success("نُسخ الخطاب.");
                  } catch {
                    toast.error("تعذّر النسخ. حدّد النص وانسخه يدوياً.");
                  }
                }}
              >
                <Copy className="size-4" />
                نسخ الخطاب
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The workspace's rules, such as «Printers → hardware, not commissionable», applied to every period. */
function ClassificationRulesDialog({
  open,
  onOpenChange,
  rules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: ClassificationRule[];
}) {
  const { can } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const canManage = can("exceptions.manage");
  const [matchText, setMatchText] = useState("");
  const [classification, setClassification] = useState("");
  const [claimable, setClaimable] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      addClassificationRule({
        platform: null,
        match_text: matchText.trim(),
        classification: classification.trim(),
        commissionable: false,
        claimable,
        note: null,
      }),
    onSuccess: async () => {
      setMatchText("");
      setClassification("");
      setClaimable(false);
      await queryClient.invalidateQueries({ queryKey: ["exception-rules"] });
      toast.success("أُضيفت القاعدة وطُبّقت على كل الفترات.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteClassificationRule(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exception-rules"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>قواعد التصنيف</DialogTitle>
          <DialogDescription>
            كل بند يحتوي النص المحدد يأخذ التصنيف تلقائياً في الفترات السابقة والقادمة، ما لم يغيّر أحد حالته يدوياً.
          </DialogDescription>
        </DialogHeader>
        {rules.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border text-[13px]">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span>
                  <span className="font-semibold">«{rule.match_text}»</span> ← {rule.classification}
                  <span className="block text-[12px] text-muted-foreground">{rule.claimable ? "قابل للمطالبة" : "مُصنّف (رسم مستحق)"}</span>
                </span>
                {canManage ? (
                  <Button type="button" size="icon" variant="ghost" aria-label={`حذف قاعدة ${rule.match_text}`} disabled={remove.isPending} onClick={() => remove.mutate(rule.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">لا توجد قواعد بعد.</p>
        )}
        {canManage ? (
          <form
            className="space-y-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (matchText.trim().length < 2 || classification.trim().length < 2) {
                toast.error("اكتب نص البند والتصنيف.");
                return;
              }
              save.mutate();
            }}
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-[12px] text-muted-foreground">نص البند في الفاتورة</span>
                <Input value={matchText} maxLength={120} onChange={(event) => setMatchText(event.target.value)} placeholder="Printers" className="h-9" />
              </label>
              <label className="block space-y-1">
                <span className="text-[12px] text-muted-foreground">التصنيف</span>
                <Input value={classification} maxLength={120} onChange={(event) => setClassification(event.target.value)} placeholder="أجهزة" className="h-9" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={claimable} onChange={(event) => setClaimable(event.target.checked)} />
              البند غير مستحق ويُطالَب باسترداده
            </label>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending}>
                إضافة القاعدة
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
