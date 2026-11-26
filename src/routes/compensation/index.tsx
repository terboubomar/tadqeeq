import { createFileRoute, Link } from "@tanstack/react-router";
import { AlarmClock, Check, ChevronLeft, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useCompensationCases, useTelegramConnections } from "@/components/compensation/queries";
import { CompHeader, Kpi } from "@/components/compensation/shared";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import {
  buildCompensationOverview,
  PLATFORM_LABELS,
  RANGE_LABELS,
  type CompensationPlatformKey,
  type OverviewRange,
} from "@/lib/compensation-overview";
import { buildCompensationQueue, type QueueKind, type QueueRow } from "@/lib/compensation-queue";
import { count, money, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { Spinner } from "@/components/ui/spinner";

export const Route = createFileRoute("/compensation/")({ component: CompensationOverviewPage });

const RANGES: OverviewRange[] = ["30d", "quarter", "year", "all"];

function CompensationOverviewPage() {
  const { can } = useWorkspaceAccess();
  const [range, setRange] = useState<OverviewRange>("quarter");
  const [platform, setPlatform] = useState<CompensationPlatformKey | "all">("all");
  const cases = useCompensationCases();
  const connections = useTelegramConnections(can("telegram.read"));

  const queue = useMemo(() => (cases.data ? buildCompensationQueue(cases.data) : null), [cases.data]);
  const overview = useMemo(
    () =>
      cases.data
        ? buildCompensationOverview(cases.data, connections.data ?? [], { range, platform })
        : null,
    [cases.data, connections.data, range, platform],
  );

  if (cases.isLoading) return <Spinner className="size-5 text-muted-foreground" />;
  if (cases.error || !overview || !queue) {
    return <p className="text-sm text-destructive">{(cases.error as Error | null)?.message ?? "تعذّر التحميل"}</p>;
  }

  const o = overview;
  const showTelegram = can("telegram.read");
  const supervisor = can("users.manage");
  const noCases = (cases.data?.length ?? 0) === 0;
  const change =
    o.previousRecoveredAmount && o.previousRecoveredAmount > 0
      ? (o.recoveredAmount - o.previousRecoveredAmount) / o.previousRecoveredAmount
      : null;

  return (
    <div className="space-y-5">
      <CompHeader title="اليوم" sub="ما يحتاج إجراءً الآن، ثم أرقام الاسترداد" />

      {noCases ? (
        <SetupChecklist linked={o.linkedBranches > 0} telegramKnown={showTelegram} />
      ) : (
        <>
          {supervisor ? <SupervisorStrip s={queue.supervisor} /> : null}

          <section aria-labelledby="waiting" className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
              <div>
                <h2 id="waiting" className="text-xs text-muted-foreground">
                  بانتظار الاسترداد
                </h2>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="num text-3xl font-semibold">{money(queue.waitingAmount)}</span>
                  <span className="text-sm text-muted-foreground">
                    ر.س · <span className="num">{count(queue.waitingCount)}</span> حالة
                  </span>
                </p>
              </div>
            </div>
            <ol
              aria-label="مراحل الحالات"
              className="mt-4 grid grid-cols-4 gap-px overflow-hidden border-t border-border bg-border"
            >
              <Stage label="مسودة" value={queue.stages.draft} status="draft" />
              <Stage label="جاهزة" value={queue.stages.ready} status="ready" />
              <Stage label="مرسلة" value={queue.stages.sent} status="submitted" />
              <Stage label="مسترَدة" value={queue.stages.recovered} status="recovered" good />
            </ol>
          </section>

          <section aria-labelledby="today" className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-2 px-4 pt-4">
              <h2 id="today" className="flex items-center gap-2 text-sm font-semibold">
                <AlarmClock className="size-4 text-warning" />
                يحتاج إجراء
              </h2>
              <div className="flex items-center gap-3">
                <Link to="/compensation/cases" className="text-xs font-semibold text-primary">
                  كل الحالات ←
                </Link>
                {can("compensation.manage") ? (
                  <Link
                    to="/compensation/evidence"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-xs font-semibold text-ink-foreground"
                  >
                    <Plus className="size-4" />
                    حالة جديدة
                  </Link>
                ) : null}
              </div>
            </div>
            {queue.rows.length === 0 ? (
              <p className="px-4 pb-4 pt-2 text-sm text-muted-foreground">
                لا شيء ينتظر إجراءً الآن. أحسنت.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border/70">
                {queue.rows.slice(0, 8).map((row) => (
                  <QueueItem key={row.id} row={row} />
                ))}
              </ul>
            )}
            {queue.rows.length > 8 ? (
              <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                و<span className="num">{count(queue.rows.length - 8)}</span> حالة أخرى في{" "}
                <Link to="/compensation/cases" className="font-semibold text-primary">
                  كل الحالات
                </Link>
              </p>
            ) : null}
          </section>
        </>
      )}

      {noCases ? null : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-base font-semibold">التقارير</h2>
        <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="الفترة" className="flex rounded-lg bg-muted p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition-colors",
                range === r ? "bg-card font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs">
          المنصة
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as CompensationPlatformKey | "all")}
            className="bg-transparent text-sm font-semibold outline-none"
          >
            <option value="all">الكل</option>
            {(Object.keys(PLATFORM_LABELS) as CompensationPlatformKey[]).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        </div>
      </div>

      <section aria-label="المؤشرات الرئيسية" className="space-y-2">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi
            featured
            label="المبلغ المسترَد"
            value={money(o.recoveredAmount)}
            unit="ر.س"
            hint={
              change === null
                ? `${count(o.statusCounts.recovered)} حالة مسترَدة`
                : `${change >= 0 ? "+" : ""}${percent(change, 0)} عن الفترة السابقة`
            }
          />
          <Kpi label="إجمالي المطالبات" value={money(o.claimedAmount)} unit="ر.س" hint={`${count(o.caseCount)} حالة`} />
          <Kpi
            label="نسبة الاسترداد"
            value={o.recoveryRate === null ? "—" : percent(o.recoveryRate, 1)}
            tone={o.recoveryRate === null ? undefined : "good"}
            hint="من المبالغ المرسلة للمنصات"
          >
            <span className="min-h-2.5 flex-1" />
            <div aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-success"
                style={{ width: `${Math.min(100, Math.round((o.recoveryRate ?? 0) * 100))}%` }}
              />
            </div>
          </Kpi>
          <Kpi
            label="قيد المراجعة لدى المنصة"
            value={money(o.pendingAmount)}
            unit="ر.س"
            hint={`${count(o.pendingCount)} حالة مرسلة أو مقبولة`}
          />
        </div>
        <p className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-xs text-muted-foreground">
          <span>
            متوسط أيام الاسترداد{" "}
            <span className="num font-semibold text-foreground">{o.avgDaysToRecover === null ? "—" : o.avgDaysToRecover.toFixed(1)}</span>
            {o.avgDaysToRecover === null ? null : " يوم"}
          </span>
          <span>
            فرق الاسترداد الجزئي{" "}
            <span className={cn("num font-semibold", o.recoveryShortfall > 0 ? "text-destructive" : "text-foreground")}>
              {money(o.recoveryShortfall)}
            </span>{" "}
            ر.س
          </span>
        </p>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">المطالَب مقابل المسترَد شهرياً (ر.س)</h2>
          <div className="mt-3 h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={o.months}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} width={56} />
                <Tooltip formatter={(value: number) => money(value)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="claimed" name="المطالَب" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recovered" name="المسترَد" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">حسب المنصة</h2>
          {o.byPlatform.map((row) => {
            const share = row.claimed > 0 ? Math.round((row.recovered / row.claimed) * 100) : 0;
            return (
              <div key={row.platform} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <PlatformName platform={row.platform} className="font-semibold" />
                  <span className="num text-[12.5px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{money(row.recovered)}</span> / {money(row.claimed)}
                  </span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
          <div className="mt-auto grid grid-cols-4 gap-2 border-t border-border pt-3 text-center text-[11px] text-muted-foreground">
            <StatusCount label="مسودة" value={o.statusCounts.draft} />
            <StatusCount label="جاهزة" value={o.statusCounts.ready} />
            <StatusCount label="مرسلة" value={o.statusCounts.submitted + o.statusCounts.accepted} />
            <StatusCount label="مسترَدة" value={o.statusCounts.recovered} good />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">أعلى الفروع في المطالبات</h2>
          <div className="flex items-center gap-4 text-xs">
            {showTelegram ? (
              <span className="text-muted-foreground">
                مربوطة بـ Telegram{" "}
                <span className="num font-semibold text-foreground">{count(o.linkedBranches)}</span> من{" "}
                <span className="num">{count(o.totalConnections)}</span>
              </span>
            ) : null}
            <Link to="/compensation/cases" className="font-semibold text-primary">
              كل الحالات ←
            </Link>
          </div>
        </div>
        {o.branches.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            لا توجد حالات تعويض في هذه الفترة.
          </p>
        ) : (
          <>
          <ul className="mt-3 divide-y divide-border/70 md:hidden">
            {o.branches.slice(0, 8).map((b) => (
              <li key={b.name} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{b.name}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                    <span className="num">{count(b.count)}</span> حالة
                    {showTelegram ? (
                      <span className={b.telegramLinked ? "text-success" : "text-destructive"}>
                        {" · "}
                        {b.telegramLinked ? "مربوط" : "غير مربوط"}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="num block text-[13px] font-semibold">
                    {money(b.recovered)} <span className="font-normal text-muted-foreground">/ {money(b.claimed)}</span>
                  </span>
                  <span
                    className={cn(
                      "num block text-[11.5px]",
                      b.recoveryRate !== null && b.recoveryRate < 0.5 ? "text-destructive" : "text-success",
                    )}
                  >
                    {b.recoveryRate === null ? "—" : percent(b.recoveryRate, 0)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 text-start font-medium">الفرع</th>
                  <th className="py-2 text-start font-medium">الحالات</th>
                  <th className="py-2 text-start font-medium">المطالَب</th>
                  <th className="py-2 text-start font-medium">المسترَد</th>
                  <th className="py-2 text-start font-medium">نسبة الاسترداد</th>
                  {showTelegram ? <th className="py-2 text-start font-medium">أدلة Telegram</th> : null}
                </tr>
              </thead>
              <tbody>
                {o.branches.slice(0, 8).map((b) => (
                  <tr key={b.name} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 font-semibold">{b.name}</td>
                    <td><span className="num">{count(b.count)}</span></td>
                    <td><span className="num">{money(b.claimed)}</span></td>
                    <td><span className="num">{money(b.recovered)}</span></td>
                    <td className={cn(b.recoveryRate !== null && b.recoveryRate < 0.5 ? "text-destructive" : "text-success")}><span className="num">
                      {b.recoveryRate === null ? "—" : percent(b.recoveryRate, 0)}
                    </span></td>
                    {showTelegram ? (
                      <td className={b.telegramLinked ? "text-success" : "text-destructive"}>
                        {b.telegramLinked ? "مربوط" : "غير مربوط"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
      </>
      )}
    </div>
  );
}

function StatusCount({ label, value, good = false }: { label: string; value: number; good?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn("num text-base font-semibold text-foreground", good && "text-success")}>{count(value)}</span>
      <span>{label}</span>
    </div>
  );
}

const ACTION: Record<QueueKind, { verb: string; tone: string }> = {
  send: { verb: "أرسل", tone: "bg-ink text-ink-foreground" },
  missing_evidence: { verb: "أكمل الدليل", tone: "border border-border bg-card text-foreground" },
  follow_up: { verb: "تابِع", tone: "border border-warning/40 bg-warning/10 text-warning" },
  rejected: {
    verb: "راجِع",
    tone: "border border-destructive/30 bg-destructive/10 text-destructive",
  },
};

function QueueItem({ row }: { row: QueueRow }) {
  const action = ACTION[row.kind];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="num font-semibold" dir="ltr">
            {row.orderNumber}
          </span>
          <PlatformName platform={row.platform} className="text-xs text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{row.branchName || "—"}</span>
        </span>
        <span
          className={cn(
            "mt-0.5 block text-xs",
            row.kind === "follow_up"
              ? "font-semibold text-warning"
              : row.kind === "rejected"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {row.label}
        </span>
      </span>
      <span className="whitespace-nowrap font-semibold">
        <span className="num">{money(row.amount)}</span>{" "}
        <span className="text-xs font-normal text-muted-foreground">ر.س</span>
      </span>
      <Link
        to="/compensation/cases"
        search={{ open: row.id }}
        className={cn(
          "inline-flex h-9 min-w-24 items-center justify-center gap-1 rounded-lg px-3 text-xs font-semibold transition-transform active:scale-[0.98]",
          action.tone,
        )}
      >
        {action.verb}
        <ChevronLeft className="size-3.5" />
      </Link>
    </li>
  );
}

function Stage({
  label,
  value,
  status,
  good = false,
}: {
  label: string;
  value: number;
  status: "draft" | "ready" | "submitted" | "recovered";
  good?: boolean;
}) {
  return (
    <li className="bg-card">
      <Link
        to="/compensation/cases"
        search={{ status }}
        aria-label={`${label}: ${value}`}
        className="flex flex-col items-center gap-0.5 px-2 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <span className={cn("num text-xl font-semibold", good && value > 0 && "text-success")}>
          {count(value)}
        </span>
        <span className="text-[11.5px] text-muted-foreground">{label}</span>
      </Link>
    </li>
  );
}

function SupervisorStrip({ s }: { s: ReturnType<typeof buildCompensationQueue>["supervisor"] }) {
  const attention = s.late + s.missingEvidence;
  return (
    <section
      aria-label="متابعة العمل"
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border px-4 py-3 text-sm",
        attention > 0 ? "border-warning/40 bg-warning/5" : "border-success/30 bg-success/5",
      )}
    >
      <span className="font-semibold">{attention > 0 ? "يحتاج انتباهك" : "العمل منتظم"}</span>
      <Link
        to="/compensation/cases"
        search={{ followup: true }}
        className={cn(
          "underline-offset-4 hover:underline",
          s.late > 0 && "font-semibold text-warning",
        )}
      >
        <span className="num">{count(s.late)}</span> متأخرة
      </Link>
      <Link
        to="/compensation/cases"
        search={{ status: "draft" }}
        className={cn(
          "underline-offset-4 hover:underline",
          s.missingEvidence > 0 && "font-semibold text-warning",
        )}
      >
        <span className="num">{count(s.missingEvidence)}</span> بلا دليل
      </Link>
      <span className="text-muted-foreground">
        هذا الأسبوع:{" "}
        <span className="num font-semibold text-foreground">{count(s.sentThisWeek)}</span> مرسلة ·{" "}
        <span className="num font-semibold text-success">{count(s.recoveredThisWeek)}</span> مسترَدة
        (<span className="num">{money(s.recoveredThisWeekAmount)}</span> ر.س)
      </span>
    </section>
  );
}

function SetupChecklist({ linked, telegramKnown }: { linked: boolean; telegramKnown: boolean }) {
  const steps = [
    {
      title: "اربط قروب Telegram لفرع",
      body: "أنشئ رمز ربط من «الفروع» وأرسل \u2066/connect\u2069 في قروب الفرع.",
      done: telegramKnown && linked,
      action: { to: "/compensation/branches" as const, label: "اربط قروباً" },
    },
    {
      title: "الفرع يصوّر الطلب في القروب",
      body: "صورة الفاتورة أو الملصق تكفي؛ يقرأ تدقيق رقم الطلب تلقائياً ويحفظ الدليل.",
      done: false,
      action: { to: "/compensation/evidence" as const, label: "شاهد الأدلة" },
    },
    {
      title: "راجع المطالبة وأرسلها للمنصة",
      body: "تظهر الحالة هنا جاهزة بالدليل ونص الاعتراض، وتتابع ردّ المنصة حتى الاسترداد.",
      done: false,
      action: null,
    },
  ];
  const current = steps.findIndex((step) => !step.done);
  return (
    <section aria-labelledby="setup" className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">
        <span className="num">{count(steps.filter((step) => step.done).length)}</span> من{" "}
        <span className="num">3</span>
      </p>
      <h2 id="setup" className="mt-1 text-lg font-semibold">
        ابدأ استرداد تعويضاتك
      </h2>
      <ol className="mt-4 space-y-1">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={cn("flex gap-3 rounded-lg p-3", index === current && "bg-muted/60")}
            aria-current={index === current ? "step" : undefined}
          >
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                step.done
                  ? "border-success bg-success text-success-foreground"
                  : index === current
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground",
              )}
            >
              {step.done ? (
                <Check className="size-3.5" />
              ) : (
                <span className="num">{index + 1}</span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  index > current && current !== -1 && "text-muted-foreground",
                )}
              >
                {step.title}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {step.body}
              </span>
              {index === current && step.action ? (
                <Link
                  to={step.action.to}
                  className="mt-3 inline-flex h-9 items-center gap-1 rounded-lg bg-ink px-4 text-xs font-semibold text-ink-foreground transition-transform active:scale-[0.98]"
                >
                  {step.action.label}
                  <ChevronLeft className="size-3.5" />
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
