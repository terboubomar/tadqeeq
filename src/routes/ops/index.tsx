import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ListTodo, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { sarFmt, opsCan } from "@/lib/ops";
import { getOpsOverview, getOpsTasks } from "@/lib/ops.functions";
import { OPS_TASK_GROUPS } from "@/lib/ops-tasks";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/")({ component: Overview });

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: "bad" | "good" }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`num mt-2 text-2xl font-bold ${tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function Overview() {
  const role = useOpsRole();
  const q = useQuery({ queryKey: ["ops-overview"], queryFn: () => getOpsOverview({ data: {} }), enabled: opsCan(role, "overview") });
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="الإيراد السنوي المتكرر (ARR)" value={sarFmt(d.arr)} tone="good" />
        <Kpi label="الإيراد الشهري المتكرر (MRR)" value={sarFmt(d.mrr)} />
        <Kpi label="المحصّل هذا الشهر" value={sarFmt(d.collectedThisMonth)} />
        <Kpi label="إجمالي المحصّل" value={sarFmt(d.collectedTotal)} />
        <Kpi label="عملاء نشطون" value={d.active} />
        <Kpi label="قيد التهيئة" value={d.pending} />
        <Kpi label="موقوفون" value={d.suspended} tone={d.suspended ? "bad" : undefined} />
        <Kpi label="تسجيلات هذا الشهر" value={d.newThisMonth} />
        <Kpi label="اشتراكات متأخرة" value={d.overdue} tone={d.overdue ? "bad" : undefined} />
        <Kpi label="تجديدات خلال 30 يوماً" value={d.renewalsDue} />
        <Kpi label="إجمالي العملاء" value={d.totalClients} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Chart title="التحصيل الشهري (ر.س)" data={d.months} dataKey="revenue" />
        <Chart title="التسجيلات الشهرية" data={d.months} dataKey="signups" />
      </div>
    </div>
  );
}

function Chart({ title, data, dataKey }: { title: string; data: { month: string }[]; dataKey: string }) {
  return (
    <section className="panel p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 h-64" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={50} />
            <Tooltip />
            <Bar dataKey={dataKey} fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
