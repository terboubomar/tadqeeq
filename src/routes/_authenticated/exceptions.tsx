import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  CircleDollarSign,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildAllExceptions,
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
import { usePeriods } from "@/lib/use-period";
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
  const { data: periods = [], isLoading } = usePeriods();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("all");

  const updateWorkflow = useMutation({
    mutationFn: ({ periodId, exceptionId, patch }: WorkflowMutation) =>
      updateExceptionWorkflow(periodId, exceptionId, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exceptions = useMemo(() => buildAllExceptions(periods), [periods]);
  const summary = useMemo(() => summarizeExceptions(exceptions), [exceptions]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exceptions.filter((item) => {
      if (platform !== "all" && item.platform !== platform) return false;
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
  }, [exceptions, platform, query, severity, status]);

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (periods.length === 0) {
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
          <h1 className="text-2xl font-black">مركز الاستثناءات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            كل فرق مالي أو بند غير مدعوم أو مشكلة مطابقة، مع حالة المتابعة والمبلغ المسترد.
          </p>
        </div>
        <span className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
          {exceptions.length} استثناء عبر {periods.length} فترة
        </span>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className="panel p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-2">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="بحث بالفترة أو الفرع أو البند…"
              className="ps-9"
            />
          </div>

          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger>
              <SelectValue placeholder="المنصة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المنصات</SelectItem>
              <SelectItem value="hungerstation">هنقرستيشن</SelectItem>
              <SelectItem value="keeta">كيتا</SelectItem>
            </SelectContent>
          </Select>

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

      <section className="panel overflow-hidden">
        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[1600px] border-collapse text-sm">
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
                />
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-5 py-16 text-center text-muted-foreground">
                    <CheckCircle2 className="mx-auto mb-3 size-7 text-success" />
                    لا توجد استثناءات مطابقة للفلاتر الحالية.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ExceptionRow({
  item,
  saving,
  onUpdate,
}: {
  item: AuditException;
  saving: boolean;
  onUpdate: (patch: Partial<ExceptionWorkflowEntry>) => void;
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
    <tr className="border-t border-border/60 align-top hover:bg-secondary/30">
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
      <Td>{item.platform === "hungerstation" ? "هنقرستيشن" : "كيتا"}</Td>
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
          onBlur={() => {
            const value = Number(recovered.replace(/,/g, ""));
            if (Number.isFinite(value) && value !== item.recoveredAmount) {
              onUpdate({ recoveredAmount: Math.max(0, value) });
            }
          }}
          placeholder="0.00"
          className="h-8 w-28 text-xs"
        />
      </Td>
      <Td>
        <Input
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
    </tr>
  );
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
  return <th className="whitespace-nowrap px-4 py-3 text-start font-semibold">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="whitespace-nowrap px-4 py-3">{children}</td>;
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
