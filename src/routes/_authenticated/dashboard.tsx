import { createFileRoute } from "@tanstack/react-router";
import {
  Banknote,
  CreditCard,
  Percent,
  Receipt,
  ShoppingBag,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { arabicDate, count, money, percent, sar, short } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "اللوحة التنفيذية · تدقيق" },
      { name: "description", content: "ملخص المبيعات والعمولات والرسوم للفترة المختارة." },
      { property: "og:title", content: "اللوحة التنفيذية · تدقيق" },
      { property: "og:description", content: "ملخص المبيعات والعمولات والرسوم للفترة المختارة." },
    ],
  }),
  component: Dashboard,
});

const chartStyle = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    fontSize: "12px",
    direction: "rtl" as const,
  },
  labelStyle: { color: "var(--color-muted-foreground)" },
};

function Dashboard() {
  const { selected, isLoading } = useSelectedPeriod();

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (!selected) {
    return (
      <EmptyState
        title="لا توجد فترات محفوظة"
        body="ارفع ملف الطلبات وفاتورة المنصة لبدء أول تدقيق."
      />
    );
  }

  const s = selected.summary;
  const isHunger = selected.platform === "hungerstation";
  const topBranches = [...selected.branches].slice(0, 8).map((branch) => ({
    name: branch.branch.length > 18 ? `${branch.branch.slice(0, 18)}…` : branch.branch,
    عمولة: Number(branch.commission.toFixed(2)),
    مبيعات: Number((isHunger ? branch.netSales : branch.grossSales).toFixed(2)),
  }));

  const daily = selected.daily.map((day) => ({
    date: day.date.slice(5),
    مبيعات: Number(day.netSales.toFixed(2)),
    عمولة: Number(day.commission.toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{selected.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)} ·{" "}
            {isHunger ? "هنقرستيشن" : "كيتا"}
          </p>
        </div>
        <span className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
          <span className="num">{count(s.branchCount)}</span> فرع ·{" "}
          <span className="num">{count(s.orders)}</span> طلب
        </span>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isHunger ? "المبيعات الإجمالية (شامل الضريبة)" : "قيمة الفواتير"}
          value={sar(s.grossSales)}
          icon={ShoppingBag}
          tone="gold"
        />
        <StatCard
          label={isHunger ? "صافي المبيعات الخاضعة للعمولة" : "المستحق للتاجر"}
          value={sar(s.netSales)}
          icon={TrendingUp}
        />
        <StatCard
          label="إجمالي العمولة"
          value={sar(s.commission)}
          hint={`بنسبة ${percent(s.commissionPct)} من الأساس`}
          icon={Percent}
          tone="negative"
        />
        <StatCard
          label="إجمالي ما خصمته المنصة"
          value={sar(s.totalCharges)}
          hint="عمولة + رسوم دفع + حملات + تعويضات"
          icon={Receipt}
          tone="negative"
        />
      </section>

      {isHunger ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="مدفوعات البطاقات (ناجحة)"
            value={sar(s.ccSuccess)}
            icon={CreditCard}
          />
          <StatCard
            label="رسوم الدفع الإلكتروني"
            value={sar(s.bankFeeSuccess + s.bankFeeRefunded)}
            hint={
              s.bankRate > 0
                ? `النسبة المطبّقة ${percent(s.bankRate)} ${
                    s.bankRateSource === "invoice"
                      ? "(مستنتجة من الفاتورة — غير مستقلة)"
                      : s.bankRateSource === "manual"
                        ? "(نسبة العقد)"
                        : ""
                  }`
                : "لم تُحدَّد نسبة — أدخل نسبة العقد أو أرفق الفاتورة للتسوية"
            }
            icon={Banknote}
            tone={s.bankRate > 0 ? "default" : "negative"}
          />
          <StatCard label="محافظ العملاء" value={sar(s.walletAmount)} icon={Wallet} />
          <StatCard label="محافظ المندوبين" value={sar(s.riderWallet)} icon={Store} />
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-5">
        <section className="panel p-5 xl:col-span-3">
          <h2 className="text-base font-bold">المبيعات والعمولة يومياً</h2>
          <div className="mt-4 h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  tickFormatter={(value: number) => short(value)}
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  width={50}
                />
                <Tooltip
                  {...chartStyle}
                  formatter={(value: number) => money(value)}
                />
                <Area
                  type="monotone"
                  dataKey="مبيعات"
                  stroke="var(--color-chart-1)"
                  fill="url(#salesFill)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="عمولة"
                  stroke="var(--color-chart-4)"
                  fill="transparent"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5 xl:col-span-2">
          <h2 className="text-base font-bold">أعلى الفروع عمولةً</h2>
          <div className="mt-4 h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBranches} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) => short(value)}
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                />
                <Tooltip {...chartStyle} formatter={(value: number) => money(value)} />
                <Bar dataKey="عمولة" fill="var(--color-chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
