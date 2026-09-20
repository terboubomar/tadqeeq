import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
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
import { buildPeriodExceptions, summarizeExceptions } from "@/lib/exceptions";
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
  const exceptionSummary = summarizeExceptions(buildPeriodExceptions(selected));
  const costLabel = isHunger ? "عمولة" : "تكلفة المنصة";
  const topBranches = [...selected.branches].slice(0, 8).map((branch) => ({
    name: branch.branch.length > 18 ? `${branch.branch.slice(0, 18)}…` : branch.branch,
    [costLabel]: Number(
      (isHunger ? branch.commission : (branch.keetaTotalCostExVat ?? branch.totalCharges)).toFixed(2),
    ),
    مبيعات: Number((isHunger ? branch.netSales : branch.grossSales).toFixed(2)),
  }));

  const daily = selected.daily.map((day) => ({
    date: day.date.slice(5),
    مبيعات: Number((isHunger ? day.netSales : day.grossSales).toFixed(2)),
    [costLabel]: Number(day.commission.toFixed(2)),
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
          label="استثناءات مفتوحة"
          value={String(exceptionSummary.openCount)}
          hint={exceptionSummary.criticalCount + " حرجة"}
          icon={AlertTriangle}
          tone={exceptionSummary.openCount ? "negative" : "default"}
        />
        <StatCard
          label="مبالغ محل المراجعة"
          value={sar(exceptionSummary.underReview)}
          hint="بعد منع التكرار بين الإجمالي والفروع"
          icon={Receipt}
          tone={exceptionSummary.underReview > 0 ? "negative" : "default"}
        />
        <StatCard
          label="استرداد محتمل"
          value={sar(exceptionSummary.potentialRecovery)}
          hint="فروقات مستقلة ذات اتجاه مالي واضح"
          icon={CircleDollarSign}
          tone="gold"
        />
        <StatCard
          label="تم استرداده"
          value={sar(exceptionSummary.recovered)}
          hint="حسب سجل المتابعة"
          icon={Banknote}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isHunger ? "المبيعات الإجمالية (شامل الضريبة)" : "المبيعات الإجمالية (شامل الضريبة)"}
          value={sar(s.grossSales)}
          icon={ShoppingBag}
          tone="gold"
        />
        <StatCard
          label={isHunger ? "صافي المبيعات الخاضعة للعمولة" : "صافي التسوية المحتسب"}
          value={sar(s.netSales)}
          icon={TrendingUp}
        />
        <StatCard
          label={isHunger ? "إجمالي العمولة" : "عمولة كيتا (بدون الضريبة)"}
          value={sar(s.commission)}
          hint={`بنسبة ${percent(s.commissionPct)} من الأساس`}
          icon={Percent}
          tone="negative"
        />
        <StatCard
          label={isHunger ? "إجمالي ما خصمته المنصة" : "تكلفة المنصة (بدون الضريبة)"}
          value={sar(s.totalCharges)}
          hint={
            isHunger
              ? "عمولة + رسوم دفع + حملات + تعويضات"
              : `تكلفة فعلية ${percent(s.keetaPlatformCostPct ?? 0)} من المبيعات بدون الضريبة`
          }
          icon={Receipt}
          tone="negative"
        />
      </section>

      {isHunger ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="صافي مدفوعات البطاقات"
            value={sar(s.netBankCards ?? s.ccSuccess)}
            hint="التحصيل الفعلي بعد استبعاد Failed by vendor"
            icon={CreditCard}
          />
          <StatCard
            label="رسوم الدفع الإلكتروني"
            value={sar(
              selected.invoice?.paymentFees ??
                s.bankFeeSuccess + s.bankFeeRefunded + (s.walletFee ?? 0),
            )}
            hint={
              selected.invoice?.paymentFees !== undefined
                ? `الفاتورة: ${sar(selected.invoice.paymentFees)} · المحتسب: ${sar(
                    s.bankFeeSuccess + s.bankFeeRefunded + (s.walletFee ?? 0),
                  )}`
                : s.bankRate > 0
                  ? `المحتسب بنسبة ${percent(s.bankRate)} ${
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
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Payable حسب كيتا"
            value={sar(s.keetaSourcePayable ?? 0)}
            hint="مجموع عمود Payable to merchant"
            icon={Banknote}
          />
          <StatCard
            label="فرق التسوية"
            value={sar(s.keetaSettlementVariance ?? 0)}
            hint="المحتسب ناقص Payable حسب كيتا"
            icon={Receipt}
            tone={Math.abs(s.keetaSettlementVariance ?? 0) > 0.05 ? "negative" : "default"}
          />
          <StatCard
            label="رسوم البنك (بدون الضريبة)"
            value={sar(s.keetaBankFeesExVat ?? 0)}
            icon={CreditCard}
          />
          <StatCard
            label="التوصيل والحملات (بدون الضريبة)"
            value={sar(s.keetaDeliveryCampaignExVat ?? 0)}
            icon={Store}
          />
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-5">
        <section className="panel p-5 xl:col-span-3">
          <h2 className="text-base font-bold">
            {isHunger ? "المبيعات والعمولة يومياً" : "المبيعات وتكلفة المنصة يومياً"}
          </h2>
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
                  dataKey={costLabel}
                  stroke="var(--color-chart-4)"
                  fill="transparent"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5 xl:col-span-2">
          <h2 className="text-base font-bold">
            {isHunger ? "أعلى الفروع عمولةً" : "أعلى الفروع تكلفة منصة"}
          </h2>
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
                <Bar dataKey={costLabel} fill="var(--color-chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
