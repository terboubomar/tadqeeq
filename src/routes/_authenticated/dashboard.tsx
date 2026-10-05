import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  ChevronLeft,
  CircleAlert,
  CreditCard,
  Percent,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/AppShell";
import { ActivityFeed, ChartCard, MetricCard, StatTiles, TrendCard, type FeedItem } from "@/components/dash/DashKit";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { AI_UI_ENABLED } from "@/lib/ai/config";
import { buildPeriodExceptions, summarizeExceptions } from "@/lib/exceptions";
import { Button } from "@/components/ui/button";
import { arabicDate, count, money, percent, sar, short } from "@/lib/format";
import { reanalyzeAuditPeriod } from "@/lib/reanalyze-period.functions";
import { setSelectedPeriodId, useSelectedPeriod } from "@/lib/use-period";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { SmartWatchCard } from "@/components/smart-watch/SmartWatchCard";
import { ActionBar, NumberTiles, PageHeader } from "@/components/workspace/PageKit";
import { PRODUCTS } from "@/lib/products";
import { keetaCostSplit, keetaOutsideInvoice } from "@/lib/keeta-cost";

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

type Metric = { label: string; value: string; hint?: string; icon: typeof Banknote; tone?: "default" | "positive" | "negative" };

function Dashboard() {
  const queryClient = useQueryClient();
  const { can } = useWorkspaceAccess();
  const { selected, periods, isLoading } = useSelectedPeriod();
  const [reanalyzing, setReanalyzing] = useState(false);

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
  const isKeeta = selected.platform === "keeta";
  const isJahez = selected.platform === "jahez";
  const keetaSplit = isKeeta ? keetaCostSplit(s) : null;
  const keetaOutside = isKeeta ? keetaOutsideInvoice(s) : null;
  const costLabel = isHunger ? "عمولة" : isJahez ? "تكلفة الفاتورة" : "تكلفة المنصة";
  async function reanalyzeCurrentPeriod() {
    if (!selected) return;
    setReanalyzing(true);
    try {
      const response = await reanalyzeAuditPeriod({
        data: { periodId: selected.id },
      });
      setSelectedPeriodId(response.periodId);
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast.success(
        "تم إنشاء إصدار جديد من التدقيق باستخدام ملفات المصدر الأصلية.",
        {
          description:
            "الإصدار السابق محفوظ كسجل تاريخي · المحرك " +
            response.engineVersion,
        },
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "تعذّرت إعادة تحليل هذه الفترة.",
      );
    } finally {
      setReanalyzing(false);
    }
  }

  const branchCost = (branch: (typeof selected.branches)[number]) =>
    isHunger ? branch.commission : isKeeta ? (branch.keetaTotalCostExVat ?? branch.totalCharges) : branch.totalCharges;
  const branchSales = (branch: (typeof selected.branches)[number]) => (isHunger ? branch.netSales : branch.grossSales);
  const topBranches = [...selected.branches].sort((a, b) => branchCost(b) - branchCost(a)).slice(0, 8);
  const maxBranchCost = Math.max(...topBranches.map(branchCost), 1);

  const days = selected.daily
    .filter(
      (day) =>
        (!selected.period_start || day.date >= selected.period_start) &&
        (!selected.period_end || day.date <= selected.period_end),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  const daily = days.map((day) => ({
    date: day.date.slice(8, 10) + "/" + day.date.slice(5, 7),
    مبيعات: Number((isHunger ? day.netSales : day.grossSales).toFixed(2)),
    [costLabel]: Number(day.commission.toFixed(2)),
  }));
  const salesTotal = days.reduce((sum, day) => sum + (isHunger ? day.netSales : day.grossSales), 0);
  const costTotal = days.reduce((sum, day) => sum + day.commission, 0);
  const busiest = days.reduce<(typeof days)[number] | null>((max, day) => (!max || day.orders > max.orders ? day : max), null);
  const dayLabel = (date: string) => date.slice(8, 10) + "/" + date.slice(5, 7);

  // Same platform, latest versions only, newest first — for the commission trend strip.
  const history = periods
    .filter((p) => p.platform === selected.platform && !p.superseded_by)
    .sort((a, b) => (b.period_end ?? "").localeCompare(a.period_end ?? ""))
    .slice(0, 3);

  const exceptions = can("exceptions.read") ? buildPeriodExceptions(selected) : [];
  const exceptionSummary = summarizeExceptions(exceptions);
  const attention: FeedItem[] = exceptions
    .filter((e) => e.status !== "closed" && e.status !== "recovered")
    .sort((a, b) => b.potentialRecovery - a.potentialRecovery || b.reviewAmount - a.reviewAmount)
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      icon: e.severity === "critical" ? CircleAlert : AlertTriangle,
      tone: e.severity === "critical" ? "critical" : e.severity === "high" ? "warning" : "default",
      title: e.label,
      meta: [e.categoryLabel, e.branch].filter(Boolean).join(" · "),
      aside: e.potentialRecovery > 0 ? `${short(e.potentialRecovery)} ر.س` : undefined,
      to: "/exceptions",
    }));

  const platformMetrics: Metric[] = isHunger
    ? [
        { label: "صافي مدفوعات البطاقات", value: sar(s.netBankCards ?? s.ccSuccess), hint: "التحصيل الفعلي بعد استبعاد Failed by vendor", icon: CreditCard },
        {
          label: "رسوم الدفع الإلكتروني",
          value: sar(selected.invoice?.paymentFees ?? s.bankFeeSuccess + s.bankFeeRefunded + (s.walletFee ?? 0)),
          hint:
            selected.invoice?.paymentFees !== undefined
              ? `الفاتورة: ${sar(selected.invoice.paymentFees)} · بطاقات قابلة للتحقق: ${sar(s.bankFeeSuccess + s.bankFeeRefunded)} · محافظ حسب الفاتورة: ${sar(s.walletFee ?? 0)}`
              : s.bankRate > 0
                ? `رسوم البطاقات المحتسبة بنسبة ${percent(s.bankRate)} ${
                    s.bankRateSource === "invoice" ? "(مستنتجة من الفاتورة — غير مستقلة)" : s.bankRateSource === "manual" ? "(نسبة العقد)" : ""
                  }`
                : "لم تُحدَّد نسبة — أدخل نسبة العقد أو أرفق الفاتورة للتسوية",
          icon: Banknote,
          tone: s.bankRate > 0 ? "default" : "negative",
        },
        { label: "محافظ العملاء", value: sar(s.walletAmount), icon: Wallet },
        { label: "محافظ المندوبين", value: sar(s.riderWallet), icon: Store },
      ]
    : isJahez
      ? [
          { label: "رسوم المدفوعات", value: sar(s.jahezPaymentFeesExVat ?? 0), hint: "Payment Fees من ملخص CSV", icon: CreditCard },
          { label: "VAT رسوم المدفوعات المخصوم", value: sar(s.jahezPaymentFeesVat ?? 0), hint: "مجموع الضريبة المخصومة على مستوى الطلب", icon: Receipt },
          { label: "عروض التوصيل المخصومة", value: sar(s.jahezDeliveryOfferInclVat ?? 0), hint: "القيمة المخصومة من التسوية شامل الضريبة", icon: Store },
          {
            label: "فرق صافي المطعم",
            value: sar(s.jahezSettlementVariance ?? 0),
            hint: "إعادة الاحتساب ناقص Restaurant Amount",
            icon: Banknote,
            tone: Math.abs(s.jahezSettlementVariance ?? 0) > 0.05 ? "negative" : "default",
          },
        ]
      : [
          {
            label: s.keetaExcelPayable !== undefined ? "Payable الرسمي حسب كيتا" : "Payable حسب Order Summary",
            value: sar(s.keetaExcelPayable ?? s.keetaSourcePayable ?? 0),
            hint: s.keetaExcelPayable !== undefined ? "من ورقة Invoice Details داخل ملف كيتا" : "من عمود Payable to Restaurant في Order Summary",
            icon: Banknote,
          },
          {
            label: "فرق التسوية",
            value: sar(s.keetaExcelPayableVariance ?? s.keetaSettlementVariance ?? 0),
            hint: s.keetaExcelPayable !== undefined ? "المحتسب ناقص Payable في Invoice Details" : "المحتسب ناقص Payable في Order Summary",
            icon: Receipt,
            tone: Math.abs(s.keetaExcelPayableVariance ?? s.keetaSettlementVariance ?? 0) > 0.05 ? "negative" : "default",
          },
          { label: "رسوم البنك (بدون الضريبة)", value: sar(s.keetaBankFeesExVat ?? 0), icon: CreditCard },
          { label: "التوصيل والحملات (بدون الضريبة)", value: sar(s.keetaDeliveryCampaignExVat ?? 0), icon: Store },
        ];

  const compensationMetrics: Metric[] | null =
    isJahez && s.jahezCompensationTransactions !== undefined
      ? [
          {
            label: "تعويضات مخصومة",
            value: sar(s.jahezCompensationDebit ?? 0),
            hint:
              (s.jahezCompensationTransactions ?? 0) +
              " حركة" +
              ((s.jahezCompensationMatchedHistorical ?? 0) > 0 ? " · " + (s.jahezCompensationMatchedHistorical ?? 0) + " مرتبطة بفترة سابقة" : ""),
            icon: Receipt,
            tone: "negative",
          },
          { label: "تعويضات مضافة", value: sar(s.jahezCompensationCredit ?? 0), hint: "Credit في تقرير التعويضات", icon: Banknote, tone: "positive" },
          {
            label: "صافي أثر التعويضات",
            value: sar(s.jahezCompensationNetImpact ?? 0),
            hint:
              (s.jahezCompensationDuplicateCandidates ?? 0) > 0
                ? (s.jahezCompensationDuplicateCandidates ?? 0) + " حالة تكرار مشتبه بها"
                : "Debit ناقص Credit",
            icon: Receipt,
            tone: (s.jahezCompensationNetImpact ?? 0) > 0 ? "negative" : "default",
          },
          {
            label: "صافي المطعم بعد التعويضات",
            value: sar(s.jahezAdjustedRestaurantAmount ?? s.netSales),
            hint:
              (s.jahezCompensationUnknownOrders ?? 0) > 0
                ? (s.jahezCompensationUnknownOrders ?? 0) + " طلب تعويض بدون مصدر متاح"
                : "Restaurant Amount ناقص صافي التعويضات",
            icon: Banknote,
          },
        ]
      : null;

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية" }, { label: "اللوحة التنفيذية" }]}
        title="اللوحة التنفيذية"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {selected.label} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)} ·
            <PlatformName platform={selected.platform} iconClassName="size-4 rounded" /> · <span className="num">{count(s.branchCount)}</span> فرع ·
            <span className="num">{count(s.orders)}</span> طلب
          </span>
        }
        aside={
          <span
            className="num rounded-full border border-border bg-card px-3 py-1 text-[11.5px] text-muted-foreground"
            title={selected.supersedes_period_id ? "إعادة تحليل" : "الإصدار الأصلي"}
          >
            Engine {selected.engine_version}
            {selected.supersedes_period_id ? " · إعادة تحليل" : ""}
          </span>
        }
      />

      <ActionBar>
        <Button type="button" size="sm" variant="ghost" className="gap-1.5" disabled={reanalyzing} onClick={() => void reanalyzeCurrentPeriod()}>
          <RefreshCw className={reanalyzing ? "size-4 animate-spin text-primary-text" : "size-4 text-primary-text"} />
          {reanalyzing ? "جارٍ إعادة التحليل…" : "إعادة التحليل"}
        </Button>
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <Link to="/import">
            <Upload className="size-4 text-primary-text" />
            رفع فترة
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <Link to="/branches">
            <Store className="size-4 text-primary-text" />
            تقرير الفروع
          </Link>
        </Button>
        {can("exceptions.read") ? (
          <Button asChild size="sm" variant="ghost" className="gap-1.5">
            <Link to="/exceptions">
              <ShieldCheck className="size-4 text-primary-text" />
              {PRODUCTS.radar.name}
            </Link>
          </Button>
        ) : null}
        {AI_UI_ENABLED ? (
          <Button asChild size="sm" className="ms-auto gap-1.5">
            <Link to="/ai">
              <Sparkles className="size-3.5" />
              Tadqeeq AI
            </Link>
          </Button>
        ) : null}
      </ActionBar>

      {can("exceptions.read") ? (
        <section aria-labelledby="activities" className="space-y-2.5">
          <h2 id="activities" className="font-display text-[15px] font-bold">الأنشطة</h2>
          <NumberTiles
            items={[
              {
                label: "الاستثناءات المفتوحة",
                value: count(exceptionSummary.openCount),
                hint: count(exceptionSummary.criticalCount) + " حرج",
                icon: CircleAlert,
                tone: exceptionSummary.openCount ? "danger" : "plain",
                to: "/exceptions",
              },
              {
                label: "قابل للاسترداد من المنصة",
                value: sar(exceptionSummary.potentialRecovery),
                hint: "تحت المراجعة " + sar(exceptionSummary.underReview),
                icon: ShieldCheck,
                tone: "gold",
                to: "/exceptions",
              },
              {
                label: "تم استرداده",
                value: sar(exceptionSummary.recovered),
                hint: "حسب المسجل في «" + PRODUCTS.radar.name + "»",
                icon: Banknote,
                tone: exceptionSummary.recovered > 0 ? "success" : "plain",
                to: "/exceptions",
              },
              {
                label: "الطلبات",
                value: count(s.orders),
                hint: "متوسط الطلب " + sar(s.orders ? s.grossSales / s.orders : 0),
                icon: ShoppingCart,
                to: "/daily",
              },
            ]}
          />
        </section>
      ) : null}

      <SmartWatchCard selected={selected} periods={periods} />

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-7">
          <StatTiles
            items={[
              { label: "المبيعات الإجمالية (شامل الضريبة)", value: sar(s.grossSales), icon: ShoppingBag, tone: "gold" },
              {
                label: isHunger ? "صافي المبيعات الخاضعة للعمولة" : isJahez ? "صافي المطعم حسب جاهز" : "صافي التسوية المحتسب",
                value: sar(s.netSales),
                icon: TrendingUp,
              },
              {
                label: isHunger ? "إجمالي العمولة" : isJahez ? "عمولة جاهز (بدون الضريبة)" : "عمولة كيتا (بدون الضريبة)",
                value: sar(s.commission),
                hint: `بنسبة ${percent(s.commissionPct)} من الأساس`,
                icon: Percent,
                tone: "negative",
              },
              ...(keetaSplit && keetaOutside
                ? [
                    {
                      label: "فاتورة كيتا الضريبية (بدون الضريبة)",
                      value: sar(keetaSplit.taxInvoice),
                      hint: "عمولة الطلبات + رسوم الإعلانات",
                      icon: Receipt,
                      tone: "negative" as const,
                    },
                    {
                      label: "مصاريف أخرى خارج الفاتورة",
                      value: sar(keetaOutside.total),
                      hint: keetaOutside.hint || undefined,
                      icon: Receipt,
                      tone: "negative" as const,
                    },
                    {
                      label: "الطلبات",
                      value: count(s.orders),
                      hint: `متوسط الطلب ${sar(s.orders ? s.grossSales / s.orders : 0)}`,
                      icon: ShoppingCart,
                    },
                  ]
                : [
                    {
                      label: isHunger ? "إجمالي ما خصمته المنصة" : isJahez ? "فاتورة جاهز المحتسبة (بدون الضريبة)" : "إجمالي تكلفة كيتا (بدون الضريبة)",
                      value: sar(s.totalCharges),
                      hint: isHunger
                        ? "عمولة + رسوم دفع + حملات + تعويضات"
                        : isJahez
                          ? "عمولة + رسوم مدفوعات + عروض توصيل"
                          : `تكلفة فعلية ${percent(s.keetaPlatformCostPct ?? 0)} من المبيعات بدون الضريبة`,
                      icon: Receipt,
                      tone: "negative" as const,
                    },
                    { label: "الطلبات", value: count(s.orders), icon: ShoppingCart },
                    { label: "متوسط قيمة الطلب", value: sar(s.orders ? s.grossSales / s.orders : 0), icon: Store },
                  ]),
            ]}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <TrendCard
              value={percent(s.commissionPct)}
              label={isHunger ? "نسبة العمولة" : "نسبة عمولة المنصة"}
              description={`${costLabel} اليومية خلال الفترة · والشريط أدناه لآخر فترات ${selected.platform === "hungerstation" ? "هنقرستيشن" : selected.platform === "jahez" ? "جاهز" : "كيتا"}.`}
              data={days.map((d) => ({ label: dayLabel(d.date), value: d.commission }))}
              format={(v) => sar(v)}
              band={history.map((p) => ({ value: percent(p.summary.commissionPct, 1), label: p.label }))}
            />
            <TrendCard
              value={count(s.orders)}
              label="الطلبات"
              description="عدد الطلبات يومياً خلال الفترة."
              variant="bars"
              data={days.map((d) => ({ label: dayLabel(d.date), value: d.orders }))}
              format={(v) => `${count(v)} طلب`}
              band={[
                { value: count(days.length ? Math.round(s.orders / days.length) : 0), label: "متوسط يومي" },
                { value: count(busiest?.orders ?? 0), label: busiest ? `أعلى يوم ${dayLabel(busiest.date)}` : "أعلى يوم" },
                { value: count(days.length), label: "أيام" },
              ]}
            />
          </div>
        </div>

        <ChartCard
          className="xl:col-span-5"
          title={isHunger ? "المبيعات والعمولة يومياً" : isJahez ? "المبيعات وعمولة جاهز يومياً" : "المبيعات وتكلفة المنصة يومياً"}
          totals={[
            { label: isHunger ? "صافي المبيعات" : "المبيعات", value: sar(salesTotal) },
            { label: "متوسط يومي", value: sar(days.length ? salesTotal / days.length : 0) },
            { label: costLabel, value: sar(costTotal), tone: "negative" },
          ]}
        >
          <div className="h-[23rem]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis tickFormatter={(value: number) => short(value)} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={44} />
                <Tooltip {...chartStyle} formatter={(value: number) => money(value)} />
                <Bar dataKey="مبيعات" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Line type="monotone" dataKey={costLabel} stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex justify-center gap-5 text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-1" /> {isHunger ? "صافي المبيعات" : "المبيعات"}</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-chart-2" /> {costLabel}</span>
          </div>
        </ChartCard>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {platformMetrics.map((m) => (
          <MetricCard key={m.label} label={m.label} value={m.value} hint={m.hint} icon={m.icon} tone={m.tone} />
        ))}
      </section>

      {compensationMetrics ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {compensationMetrics.map((m) => (
            <MetricCard key={m.label} label={m.label} value={m.value} hint={m.hint} icon={m.icon} tone={m.tone} />
          ))}
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-7"
          title={isHunger ? "أعلى الفروع عمولةً" : isJahez ? "أعلى الفروع تكلفة فاتورة" : "أعلى الفروع تكلفة منصة"}
          action={
            <Link to="/branches" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              كل الفروع <ChevronLeft className="size-3.5" />
            </Link>
          }
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-start font-medium">الفرع</th>
                  <th className="px-3 py-2.5 text-start font-medium">{isHunger ? "صافي المبيعات" : "المبيعات"}</th>
                  <th className="px-3 py-2.5 text-start font-medium">{costLabel}</th>
                  <th className="w-40 px-5 py-2.5 text-start font-medium">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {topBranches.map((branch) => {
                  const cost = branchCost(branch);
                  const sales = branchSales(branch);
                  return (
                    <tr key={branch.branch} className="border-b border-border/70 last:border-0">
                      <td className="max-w-[220px] truncate px-5 py-3 font-medium" title={branch.branch}>{branch.branch}</td>
                      <td className="px-3 py-3"><span className="num">{money(sales)}</span></td>
                      <td className="px-3 py-3"><span className="num text-destructive">{money(cost)}</span></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (cost / maxBranchCost) * 100)}%` }} />
                          </span>
                          <span className="num w-12 text-end text-xs text-muted-foreground">{percent(sales ? cost / sales : 0, 1)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <div className="space-y-5 xl:col-span-5">
          {can("exceptions.read") ? (
            <>
              <ChartCard
                title="يحتاج انتباهك"
                action={
                  <Link to="/exceptions" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    {PRODUCTS.radar.name} · الاستثناءات <ChevronLeft className="size-3.5" />
                  </Link>
                }
              >
                <ActivityFeed items={attention} empty="لا توجد استثناءات مفتوحة في هذه الفترة." />
              </ChartCard>
            </>
          ) : (
            <MetricCard label="أيام الفترة" value={count(days.length)} hint={`${arabicDate(selected.period_start)} — ${arabicDate(selected.period_end)}`} icon={CalendarDays} />
          )}
        </div>
      </div>
    </div>
  );
}
