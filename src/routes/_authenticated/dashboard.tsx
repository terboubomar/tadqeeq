import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  PieChart,
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
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/AppShell";
import { CombinedDashboard, ScopeBar, type ScopeValue } from "@/components/dash/CombinedDashboard";
import { ActivityFeed, ChartCard, MetricCard, TrendCard, type FeedItem, type StatTile } from "@/components/dash/DashKit";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { AI_UI_ENABLED } from "@/lib/ai/config";
import { buildPeriodExceptions, summarizeExceptions } from "@/lib/exceptions";
import { Button } from "@/components/ui/button";
import { arabicDate, count, money, percent, sar, short } from "@/lib/format";
import { reanalyzeAuditPeriod } from "@/lib/reanalyze-period.functions";
import { latestPeriod, setSelectedPeriodId, useSelectedPeriod } from "@/lib/use-period";
import { COMBINED_PLATFORMS, type PlatformScope } from "@/lib/combined-dashboard";
import { listMyWorkspaces } from "@/lib/workspace-management.functions";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { SmartWatchCard } from "@/components/smart-watch/SmartWatchCard";
import { ActionBar, PageHeader } from "@/components/workspace/PageKit";
import { PRODUCTS } from "@/lib/products";
import { cn } from "@/lib/utils";
import { keetaCostSplit, keetaOutsideInvoice } from "@/lib/keeta-cost";
import { CostDefinitionNote } from "@/components/dash/CostDefinitionNote";
import { PLATFORM_COST_FORMULA_AR, platformCostPct, totalPlatformCharges } from "@/lib/reporting-metrics";

type DashboardSearch = { company?: string; platform?: PlatformScope; month?: string };

export const Route = createFileRoute("/_authenticated/dashboard")({
  // company / platform / month open the combined view; without them the dashboard shows the selected period.
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    company: typeof search["company"] === "string" && /^(all|[0-9a-f-]{36})$/.test(search["company"]) ? search["company"] : undefined,
    platform: search["platform"] === "all" || COMBINED_PLATFORMS.includes(search["platform"] as never) ? (search["platform"] as PlatformScope) : undefined,
    month: typeof search["month"] === "string" && /^\d{4}-\d{2}$/.test(search["month"]) ? search["month"] : undefined,
  }),
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

/** Daily chart colours: the platform's share in the accent, the rest of the day's sales in a cool grey (checked for colour-blind separation and 3:1 contrast on the card). */
const DAILY_COST_FILL = "var(--color-chart-1)";
const DAILY_REST_FILL = "oklch(0.66 0.02 230)";

type DailyPoint = { date: string; sales: number; cost: number; rest: number };

type Metric = { label: string; value: string; hint?: string; icon: typeof Banknote; tone?: "default" | "positive" | "negative" };

function Dashboard() {
  const queryClient = useQueryClient();
  const { can, context } = useWorkspaceAccess();
  const { selected, periods, isLoading } = useSelectedPeriod();
  const [reanalyzing, setReanalyzing] = useState(false);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const workspaces = useQuery({ queryKey: ["account-workspaces"], queryFn: () => listMyWorkspaces({ data: {} }), staleTime: 60_000 });
  const companyOptions = (workspaces.data ?? []).map((w) => ({ id: w.id, name: w.name }));

  const combined = search.company !== undefined || search.platform !== undefined;
  const scope: ScopeValue = {
    company: search.company ?? context.workspaceId,
    platform: search.platform ?? (combined ? "all" : (selected?.platform ?? "all")),
  };

  /** One platform of the current company shows its latest period; anything wider opens the combined view. */
  function changeScope(next: ScopeValue) {
    if (next.company === context.workspaceId && next.platform !== "all") {
      const latest = latestPeriod(periods.filter((p) => p.platform === next.platform && !p.superseded_by));
      if (latest) {
        setSelectedPeriodId(latest.id);
        void navigate({ search: {} });
        return;
      }
    }
    void navigate({ search: { company: next.company, platform: next.platform } });
  }

  if (combined) {
    return (
      <CombinedDashboard
        scope={scope}
        month={search.month}
        onScope={changeScope}
        onMonth={(month) => void navigate({ search: (prev) => ({ ...prev, month }) })}
      />
    );
  }

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (!selected) {
    return (
      <div className="space-y-5">
        {companyOptions.length > 1 ? <ScopeBar companies={companyOptions} value={scope} onChange={changeScope} /> : null}
        <EmptyState
          title="لا توجد فترات محفوظة"
          body="ارفع ملف الطلبات وفاتورة المنصة لبدء أول تدقيق."
        />
      </div>
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
  const branchRate = (branch: (typeof selected.branches)[number]) => {
    const sales = branchSales(branch);
    return sales ? branchCost(branch) / sales : 0;
  };
  // The bar shows each branch's rate; the marker is the rate across all branches, and branches above it stand out.
  const allBranchSales = selected.branches.reduce((sum, branch) => sum + branchSales(branch), 0);
  const branchAverageRate = allBranchSales ? selected.branches.reduce((sum, branch) => sum + branchCost(branch), 0) / allBranchSales : 0;
  const maxBranchRate = Math.max(...topBranches.map(branchRate), branchAverageRate, 0.0001);

  const days = selected.daily
    .filter(
      (day) =>
        (!selected.period_start || day.date >= selected.period_start) &&
        (!selected.period_end || day.date <= selected.period_end),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  // Each day's bar is its sales; the platform's share is the bottom segment and the rest sits on top.
  const daily: DailyPoint[] = days.map((day) => {
    const sales = isHunger ? day.netSales : day.grossSales;
    return { date: day.date.slice(8, 10) + "/" + day.date.slice(5, 7), sales, cost: day.commission, rest: Math.max(0, sales - day.commission) };
  });
  const salesTotal = days.reduce((sum, day) => sum + (isHunger ? day.netSales : day.grossSales), 0);
  const costTotal = days.reduce((sum, day) => sum + day.commission, 0);
  const busiest = days.reduce<(typeof days)[number] | null>((max, day) => (!max || day.orders > max.orders ? day : max), null);
  const dayLabel = (date: string) => date.slice(8, 10) + "/" + date.slice(5, 7);

  // Same platform, latest versions only, newest first — for the commission trend strip.
  const history = periods
    .filter((p) => p.platform === selected.platform && !p.superseded_by)
    .sort((a, b) => (b.period_end ?? "").localeCompare(a.period_end ?? ""))
    .slice(0, 3);

  // Platform cost %: total platform charges ÷ gross sales, with the previous period of the same platform.
  const costPct = platformCostPct(totalPlatformCharges(selected.platform, s), s.grossSales);
  const previous = periods
    .filter((p) => p.platform === selected.platform && !p.superseded_by && p.id !== selected.id)
    .filter((p) => (p.period_end ?? "") < (selected.period_start ?? selected.period_end ?? ""))
    .sort((a, b) => (b.period_end ?? "").localeCompare(a.period_end ?? ""))[0];
  const previousCostPct = previous ? platformCostPct(totalPlatformCharges(previous.platform, previous.summary), previous.summary.grossSales) : null;
  const costPctChange = costPct !== null && previousCostPct !== null ? (costPct - previousCostPct) * 100 : null;
  const costPctTile = {
    label: "نسبة تكلفة المنصة",
    value: costPct === null ? "—" : percent(costPct),
    hint:
      costPctChange === null || previousCostPct === null
        ? PLATFORM_COST_FORMULA_AR
        : `${Math.abs(costPctChange) < 0.05 ? "دون تغيير عن" : costPctChange > 0 ? "▲ " + costPctChange.toFixed(1) + " نقطة عن" : "▼ " + Math.abs(costPctChange).toFixed(1) + " نقطة عن"} ${previous!.label} (${percent(previousCostPct)})`,
    icon: PieChart,
    tone: "negative" as const,
  };

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

  /** The period's money figures: [0] gross sales (headline), [1-2] net sales and commission, the rest sit beside the headline. */
  const statItems: StatTile[] = [
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
                    costPctTile,
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
                          : `${percent(platformCostPct(totalPlatformCharges("keeta", s), s.grossSales) ?? 0)} من إجمالي المبيعات · ${percent(s.keetaPlatformCostPct ?? 0)} من المبيعات بدون الضريبة`,
                      icon: Receipt,
                      tone: "negative" as const,
                    },
                    costPctTile,
                    { label: "الطلبات", value: count(s.orders), icon: ShoppingCart },
                    { label: "متوسط قيمة الطلب", value: sar(s.orders ? s.grossSales / s.orders : 0), icon: Store },
                  ]),
  ];
  const headline = statItems[0]!;
  const restStats = statItems.slice(1);
  const detailStats = restStats.slice(0, 2);
  const supportingStats = restStats.slice(2);
  const detailMetrics = [...detailStats, ...platformMetrics, ...(compensationMetrics ?? [])];
  const detailCount = detailMetrics.length + (can("exceptions.read") ? 0 : 1);

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

      <ScopeBar companies={companyOptions} value={scope} onChange={changeScope} />

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

      <section aria-labelledby="period-headline" className="panel overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-8">
          <div className="min-w-0">
            <p id="period-headline" className="text-[13px] text-muted-foreground">{headline.label}</p>
            <p className="num mt-1 truncate text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">{headline.value}</p>
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {supportingStats.map((item) => (
                <div key={item.label} className="min-w-0 bg-card px-3.5 py-3">
                  <dt className="flex items-center gap-1.5 text-[11.5px] leading-5 text-muted-foreground">
                    <item.icon className="size-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </dt>
                  <dd className={cn("num mt-1 truncate text-[17px] font-semibold", STAT_TONE[item.tone ?? "default"])}>{item.value}</dd>
                  {item.hint ? <dd className="mt-0.5 text-[10.5px] leading-4 text-muted-foreground">{item.hint}</dd> : null}
                </div>
              ))}
            </dl>
            <CostDefinitionNote className="mt-3" />
          </div>
          <figure className="min-w-0">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-[13px] font-semibold">
                {isHunger ? "المبيعات والعمولة يومياً" : isJahez ? "المبيعات وعمولة جاهز يومياً" : "المبيعات وتكلفة المنصة يومياً"}
              </span>
              <span className="flex flex-wrap gap-x-4 text-[11.5px] text-muted-foreground">
                <span>
                  {isHunger ? "صافي المبيعات" : "المبيعات"} <span className="num text-foreground">{sar(salesTotal)}</span>
                </span>
                <span>
                  متوسط يومي <span className="num text-foreground">{sar(days.length ? salesTotal / days.length : 0)}</span>
                </span>
                <span>
                  {costLabel} <span className="num text-destructive">{sar(costTotal)}</span>
                </span>
              </span>
            </figcaption>
            <div className="mt-3 h-64 xl:h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
                  <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.6} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} minTickGap={12} />
                  <YAxis tickFormatter={(value: number) => short(value)} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={<DailyTip salesLabel={isHunger ? "صافي المبيعات" : "المبيعات"} costLabel={costLabel} />} cursor={{ fill: "var(--color-muted)", fillOpacity: 0.6 }} />
                  <Bar dataKey="cost" stackId="day" fill={DAILY_COST_FILL} stroke="var(--color-card)" strokeWidth={1} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="rest" stackId="day" fill={DAILY_REST_FILL} stroke="var(--color-card)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex justify-center gap-5 text-[11.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: DAILY_COST_FILL }} /> {costLabel}</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: DAILY_REST_FILL }} /> باقي {isHunger ? "صافي المبيعات" : "المبيعات"}</span>
            </div>
          </figure>
        </div>
      </section>

      <div className={cn("grid items-start gap-5", can("exceptions.read") && "xl:grid-cols-2")}>
      {can("exceptions.read") ? (
        <section aria-labelledby="attention" className="panel overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <h2 id="attention" className="text-[14px] font-bold">يحتاج انتباهك</h2>
            <Link to="/exceptions" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {PRODUCTS.radar.name} · الاستثناءات <ChevronLeft className="size-3.5" />
            </Link>
          </header>
          <div className="grid grid-cols-3 gap-px border-b border-border bg-border">
            <AttentionStat
              label="الاستثناءات المفتوحة"
              value={count(exceptionSummary.openCount)}
              hint={count(exceptionSummary.criticalCount) + " حرج"}
              tone={exceptionSummary.openCount ? "negative" : "default"}
            />
            <AttentionStat
              label="قابل للاسترداد من المنصة"
              value={sar(exceptionSummary.potentialRecovery)}
              hint={"تحت المراجعة " + sar(exceptionSummary.underReview)}
              tone="gold"
            />
            <AttentionStat
              label="تم استرداده"
              value={sar(exceptionSummary.recovered)}
              hint={"حسب المسجل في «" + PRODUCTS.radar.name + "»"}
              tone={exceptionSummary.recovered > 0 ? "positive" : "default"}
            />
          </div>
          <div className="p-5">
            <ActivityFeed items={attention} empty="لا توجد استثناءات مفتوحة في هذه الفترة." />
          </div>
        </section>
      ) : null}

      <SmartWatchCard selected={selected} periods={periods} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {isHunger ? (
          // HungerStation's rate is commission ÷ net sales, both kept per day, so the chart can show the same rate daily.
          <TrendCard
            value={percent(s.commissionPct)}
            label="نسبة العمولة"
            description="نسبة العمولة يومياً خلال الفترة، والخط المتقطع متوسط الفترة · والشريط أدناه لآخر فترات هنقرستيشن."
            variant="line"
            data={days.filter((d) => d.netSales > 0).map((d) => ({ label: dayLabel(d.date), value: d.commission / d.netSales }))}
            reference={s.commissionPct}
            format={(v) => percent(v, 1)}
            band={history.map((p) => ({ value: percent(p.summary.commissionPct, 1), label: p.label }))}
          />
        ) : (
          <TrendCard
            value={percent(s.commissionPct)}
            label="نسبة عمولة المنصة"
            description={`${costLabel} اليومية خلال الفترة · والشريط أدناه لآخر فترات ${selected.platform === "jahez" ? "جاهز" : "كيتا"}.`}
            data={days.map((d) => ({ label: dayLabel(d.date), value: d.commission }))}
            format={(v) => sar(v)}
            band={history.map((p) => ({ value: percent(p.summary.commissionPct, 1), label: p.label }))}
          />
        )}
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

      <section aria-labelledby="period-details" className="space-y-2.5">
        <h2 id="period-details" className="font-display text-[15px] font-bold">تفاصيل الفترة</h2>
        <div className={cn("grid gap-4 sm:grid-cols-2", detailCount % 4 === 0 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
          {detailMetrics.map((m) => (
            <MetricCard key={m.label} label={m.label} value={m.value} hint={m.hint} icon={m.icon} tone={m.tone} />
          ))}
          {can("exceptions.read") ? null : (
            <MetricCard label="أيام الفترة" value={count(days.length)} hint={`${arabicDate(selected.period_start)} — ${arabicDate(selected.period_end)}`} icon={CalendarDays} />
          )}
        </div>
      </section>

      <ChartCard
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
                  <th className="w-48 px-5 py-2.5 text-start font-medium">
                    النسبة{" "}
                    <span className="font-normal">
                      (المتوسط <span className="num">{percent(branchAverageRate, 1)}</span>)
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {topBranches.map((branch) => {
                  const cost = branchCost(branch);
                  const sales = branchSales(branch);
                  const rate = branchRate(branch);
                  const aboveAverage = rate > branchAverageRate + 0.0005;
                  return (
                    <tr key={branch.branch} className="border-b border-border/70 last:border-0">
                      <td className="max-w-[220px] truncate px-5 py-3 font-medium" title={branch.branch}>{branch.branch}</td>
                      <td className="px-3 py-3"><span className="num">{money(sales)}</span></td>
                      <td className="px-3 py-3"><span className="num text-destructive">{money(cost)}</span></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2" title={aboveAverage ? "أعلى من متوسط الفروع" : "عند متوسط الفروع أو أقل"}>
                          <span className="relative h-2 flex-1">
                            <span
                              className={cn("absolute inset-y-0 start-0 rounded-full", aboveAverage ? "bg-primary" : "bg-muted-foreground/45")}
                              style={{ width: `${Math.max(3, (rate / maxBranchRate) * 100)}%` }}
                            />
                            <span
                              aria-hidden="true"
                              className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground/70"
                              style={{ insetInlineStart: `${(branchAverageRate / maxBranchRate) * 100}%` }}
                            />
                          </span>
                          <span className={cn("num w-12 text-end text-xs", aboveAverage ? "font-semibold text-foreground" : "text-muted-foreground")}>{percent(rate, 1)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </ChartCard>
    </div>
  );
}

const STAT_TONE: Record<NonNullable<StatTile["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-success",
  negative: "text-destructive",
  gold: "text-primary-text",
};

/** One figure in the «يحتاج انتباهك» row, linking to «رادار». */
function AttentionStat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: NonNullable<StatTile["tone"]> }) {
  return (
    <Link to="/exceptions" className="min-w-0 bg-card px-3 py-3.5 transition-colors hover:bg-muted/40 sm:px-5 sm:py-4">
      <p className="text-[11px] leading-4 text-muted-foreground sm:text-[12px]">{label}</p>
      <p className={cn("num mt-1 truncate text-[15px] font-semibold sm:text-[20px]", STAT_TONE[tone])}>{value}</p>
      <p className="mt-0.5 text-[10.5px] leading-4 text-muted-foreground sm:text-[11px]">{hint}</p>
    </Link>
  );
}

/** Hover card for one day: sales, the platform's share and that share as a percentage. */
function DailyTip({ active, payload, salesLabel, costLabel }: { active?: boolean; payload?: { payload: DailyPoint }[]; salesLabel: string; costLabel: string }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div dir="rtl" className="min-w-40 rounded-xl border border-border bg-popover px-3 py-2 text-[12px] shadow-sm">
      <p className="num text-muted-foreground">{point.date}</p>
      <p className="mt-1 flex justify-between gap-4">
        <span>{salesLabel}</span>
        <span className="num font-semibold">{money(point.sales)}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: DAILY_COST_FILL }} />
          {costLabel}
        </span>
        <span className="num font-semibold">{money(point.cost)}</span>
      </p>
      <p className="flex justify-between gap-4 text-muted-foreground">
        <span>النسبة من المبيعات</span>
        <span className="num">{percent(point.sales ? point.cost / point.sales : 0, 1)}</span>
      </p>
    </div>
  );
}
