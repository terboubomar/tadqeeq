import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { sarFmt, opsCan } from "@/lib/ops";
import { getOpsOverview } from "@/lib/ops.functions";
import { OpsDenied, OpsHeader, useOpsRole } from "../ops";

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
  if (!opsCan(role, "overview")) return <OpsDenied />;
  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.error || !q.data) return <p className="text-sm text-destructive">{(q.error as Error)?.message}</p>;
  const d = q.data;
  return (
    <div className="space-y-5">
      <OpsHeader title="نظرة عامة" sub="الإيرادات المتكررة وحالة العملاء" />
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
