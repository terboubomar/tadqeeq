import { createFileRoute, Link } from "@tanstack/react-router";
import { AlarmClock, Plus } from "lucide-react";
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

  const overview = useMemo(
    () =>
      cases.data
        ? buildCompensationOverview(cases.data, connections.data ?? [], { range, platform })
        : null,
    [cases.data, connections.data, range, platform],
  );

  if (cases.isLoading) return <Spinner className="size-5 text-muted-foreground" />;
  if (cases.error || !overview) {
    return <p className="text-sm text-destructive">{(cases.error as Error | null)?.message ?? "تعذّر التحميل"}</p>;
  }

  const o = overview;
  const showTelegram = can("telegram.read");
  const change =
    o.previousRecoveredAmount && o.previousRecoveredAmount > 0
      ? (o.recoveredAmount - o.previousRecoveredAmount) / o.previousRecoveredAmount
      : null;

  return (
    <div className="space-y-5">
      <CompHeader title="نظرة عامة" sub="المبالغ المطالَب بها والمسترَدة من منصات التوصيل">
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
        {can("compensation.manage") ? (
          <Link
            to="/compensation/evidence"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-xs font-semibold text-ink-foreground"
          >
            <Plus className="size-4" />
            حالة جديدة
          </Link>
        ) : null}
      </CompHeader>

      <section aria-label="المؤشرات الرئيسية" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          featured
          // Nine tiles (with Telegram) fill the grid when the headline spans two rows and columns.
          className={showTelegram ? "col-span-2 justify-center xl:row-span-2" : "col-span-2 xl:col-span-1"}
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
        <Kpi label="جاهزة للإرسال" value={count(o.readyCount)} />
        <Kpi
          label="مرفوضة"
          value={count(o.rejectedCount)}
          tone={o.rejectedCount ? "bad" : undefined}
          hint={o.rejectedCount ? `${money(o.rejectedAmount)} ر.س` : undefined}
        />
        <Kpi
          label="متوسط أيام الاسترداد"
          value={o.avgDaysToRecover === null ? "—" : o.avgDaysToRecover.toFixed(1)}
          unit={o.avgDaysToRecover === null ? undefined : "يوم"}
          hint="من الإرسال للمنصة حتى تسجيل الاسترداد"
        />
        <Kpi
          label="فرق الاسترداد الجزئي"
          value={money(o.recoveryShortfall)}
          unit="ر.س"
          tone={o.recoveryShortfall > 0 ? "bad" : undefined}
          hint="المطالَب ناقص المدفوع فعلياً في الحالات المسترَدة"
        />
        {showTelegram ? (
          <Kpi
            label="فروع مربوطة بـ Telegram"
            value={
              <>
                {count(o.linkedBranches)}
                <span className="text-sm font-normal text-muted-foreground"> / {count(o.totalConnections)}</span>
              </>
            }
          />
        ) : null}
      </section>

      {o.followUps.length ? (
        <section className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <AlarmClock className="size-4 text-warning" />
              تحتاج متابعة اليوم
              <span className="num rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{count(o.followUps.length)}</span>
            </h2>
            <span className="text-xs text-muted-foreground">
              مبالغ معلّقة <span className="num font-semibold text-foreground">{money(o.followUpAmount)}</span> ر.س
            </span>
          </div>
          <ul className="mt-3 divide-y divide-border/70">
            {o.followUps.slice(0, 6).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <Link
                  to="/compensation/cases"
                  search={{ open: f.id }}
                  className="num font-semibold underline-offset-4 hover:underline"
                  dir="ltr"
                >
                  {f.orderNumber}
                </Link>
                <PlatformName platform={f.platform} className="text-xs text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{f.branchName || "—"}</span>
                <span className="text-xs font-semibold text-warning">{f.followUp.label}</span>
                <span className="ms-auto whitespace-nowrap font-semibold"><span className="num">{money(f.amount)}</span> <span className="text-xs font-normal text-muted-foreground">ر.س</span></span>
              </li>
            ))}
          </ul>
          {o.followUps.length > 6 ? (
            <Link to="/compensation/cases" search={{ followup: true }} className="mt-2 inline-block text-xs font-semibold text-primary">
              عرض كل الحالات التي تحتاج متابعة ←
            </Link>
          ) : null}
        </section>
      ) : null}

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
          <Link to="/compensation/cases" className="text-xs font-semibold text-primary">
            كل الحالات ←
          </Link>
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
