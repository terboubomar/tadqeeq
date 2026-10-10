import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ListTodo, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { sarFmt, opsCan } from "@/lib/ops";
import { getOpsOverview, getOpsRevenue, getOpsTasks } from "@/lib/ops.functions";
import { OPS_TASK_GROUPS } from "@/lib/ops-tasks";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";
import { NumberTiles } from "@/components/workspace/PageKit";
import { count } from "@/lib/format";
import type { RevenueMonth } from "@/lib/ops-revenue";

export const Route = createFileRoute("/ops/")({ component: Overview });

function Overview() {
  const role = useOpsRole();
  const q = useQuery({ queryKey: ["ops-overview"], queryFn: () => getOpsOverview({ data: {} }), enabled: opsCan(role, "overview") });
  const revenue = useQuery({ queryKey: ["ops-revenue"], queryFn: () => getOpsRevenue({ data: {} }), enabled: opsCan(role, "overview") });
  const tasks = useQuery({ queryKey: ["ops-tasks"], queryFn: () => getOpsTasks({ data: {} }), enabled: opsCan(role, "clients"), staleTime: 60_000 });
  if (!opsCan(role, "overview")) return <OpsDenied />;
  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.error || !q.data) return <p className="text-sm text-destructive">{(q.error as Error)?.message}</p>;
  const d = q.data;
  return (
    <div className="space-y-5">
      <OpsHeader title="نظرة عامة" sub="الإيرادات المتكررة وحالة العملاء" />
      {tasks.data?.tasks.length ? (
        <Link to="/ops/tasks" className="panel flex flex-wrap items-center gap-3 p-4 transition-colors hover:border-primary/40">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><ListTodo className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold"><span className="num">{tasks.data.tasks.length}</span> مهمة تحتاج إجراء</p>
            <p className="truncate text-xs text-muted-foreground">
              {OPS_TASK_GROUPS.map((g) => [g.title, tasks.data!.tasks.filter((t) => t.kind === g.kind).length] as const)
                .filter(([, n]) => n)
                .map(([title, n]) => `${title} ${n}`)
                .join(" · ")}
            </p>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </Link>
      ) : null}
      <TileGroup title="الإيرادات">
        <NumberTiles
          items={[
            { label: "الإيراد السنوي المتكرر (ARR)", value: sarFmt(d.arr), tone: "gold" },
            { label: "الإيراد الشهري المتكرر (MRR)", value: sarFmt(d.mrr) },
            { label: "المحصّل هذا الشهر", value: sarFmt(d.collectedThisMonth) },
            { label: "إجمالي المحصّل", value: sarFmt(d.collectedTotal) },
          ]}
        />
      </TileGroup>
      <TileGroup title="العملاء">
        <NumberTiles
          items={[
            { label: "عملاء نشطون", value: count(d.active), to: "/ops/clients" },
            { label: "قيد التهيئة", value: count(d.pending), to: "/ops/clients" },
            { label: "تسجيلات هذا الشهر", value: count(d.newThisMonth) },
            { label: "إجمالي العملاء", value: count(d.totalClients), to: "/ops/clients" },
          ]}
        />
      </TileGroup>
      <TileGroup title="يحتاج انتباهاً">
        <NumberTiles
          items={[
            { label: "اشتراكات متأخرة", value: count(d.overdue), tone: d.overdue ? "danger" : "plain", to: "/ops/subscriptions" },
            { label: "موقوفون", value: count(d.suspended), tone: d.suspended ? "danger" : "plain", to: "/ops/clients" },
            { label: "تجديدات خلال 30 يوماً", value: count(d.renewalsDue), to: "/ops/subscriptions" },
          ]}
        />
      </TileGroup>
      {revenue.data ? <RevenueMovements months={revenue.data.months} since={revenue.data.since} /> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Chart title="التحصيل الشهري (ر.س)" data={d.months} dataKey="revenue" money />
        <Chart title="التسجيلات الشهرية" data={d.months} dataKey="signups" />
      </div>
    </div>
  );
}

function TileGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-[13px] font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** "2026-10" → "أكتوبر" (with the year on January and the first bar, so the year change is visible). */
function monthTick(month: string, index: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  const showYear = index === 0 || month.endsWith("-01");
  return date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "UTC", month: "short", ...(showYear ? { year: "numeric" } : {}) });
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function Chart({ title, data, dataKey, money }: { title: string; data: { month: string }[]; dataKey: string; money?: boolean }) {
  return (
    <section className="panel p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 h-64" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={monthTick} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={(value: number) => compact.format(value)} allowDecimals={false} />
            <Tooltip
              labelFormatter={(label: string) => monthTick(label, 0)}
              formatter={(value: number) => [money ? sarFmt(value) : count(value), title.replace(/ \(.*\)$/, "")]}
            />
            <Bar dataKey={dataKey} fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const MOVEMENT_SERIES = [
  { key: "newMrr", label: "عملاء جدد", color: "var(--color-chart-2)", sign: 1 },
  { key: "expansion", label: "ترقية", color: "var(--color-success)", sign: 1 },
  { key: "contraction", label: "تخفيض", color: "var(--color-warning)", sign: -1 },
  { key: "churned", label: "خسارة", color: "var(--color-destructive)", sign: -1 },
] as const;

/** Monthly recurring revenue gained (up) and lost (down), with this month's figures above the chart. */
function RevenueMovements({ months, since }: { months: RevenueMonth[]; since: string | null }) {
  const rows = months.map((m) => ({
    month: m.month,
    newMrr: m.newMrr,
    expansion: m.expansion,
    contraction: -m.contraction,
    churned: -m.churned,
  }));
  const current = months[months.length - 1];
  const net = current ? current.newMrr + current.expansion - current.contraction - current.churned : 0;
  const sinceLabel = since
    ? new Date(since).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" })
    : null;
  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">حركة الإيراد الشهري المتكرر (ر.س)</h2>
        <p className="text-xs text-muted-foreground">
          {sinceLabel ? `من سجل العمليات منذ ${sinceLabel}؛ الأشهر قبله غير مكتملة.` : "لا توجد اشتراكات مسجلة في سجل العمليات بعد."}
        </p>
      </div>
      {current ? (
        <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
          {MOVEMENT_SERIES.map((series) => (
            <div key={series.key} className="bg-card px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span aria-hidden className="size-2 rounded-sm" style={{ background: series.color }} />
                {series.label} هذا الشهر
              </dt>
              <dd className="num mt-1 text-[15px] font-semibold">
                {series.sign < 0 && current[series.key] > 0 ? "−" : ""}
                {sarFmt(current[series.key])}
              </dd>
            </div>
          ))}
          <div className="col-span-2 bg-card px-3 py-2.5 sm:col-span-1">
            <dt className="text-[11.5px] text-muted-foreground">الصافي هذا الشهر</dt>
            <dd className={`num mt-1 text-[15px] font-semibold ${net < 0 ? "text-destructive" : net > 0 ? "text-success" : ""}`}>
              {net < 0 ? "−" : net > 0 ? "+" : ""}
              {sarFmt(Math.abs(net))}
            </dd>
          </div>
        </dl>
      ) : null}
      <div className="mt-3 h-64" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={monthTick} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={(value: number) => compact.format(value)} />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <Tooltip
              labelFormatter={(label: string) => monthTick(label, 0)}
              formatter={(value: number, name: string) => [sarFmt(Math.abs(value)), name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {MOVEMENT_SERIES.map((series) => (
              <Bar key={series.key} dataKey={series.key} name={series.label} stackId="mrr" fill={series.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
