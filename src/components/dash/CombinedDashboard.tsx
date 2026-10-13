import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Building2, ChevronLeft, Info, Percent, PieChart, Receipt, ShoppingCart, Store } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/components/AppShell";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { Callout, ChartCard } from "@/components/dash/DashKit";
import { CostDefinitionNote } from "@/components/dash/CostDefinitionNote";
import { ActionBar, ActionDivider, PageHeader } from "@/components/workspace/PageKit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildCombinedView,
  COMBINED_PLATFORMS,
  type CombinedDashboardData,
  type CombinedRow,
  type CompanyScope,
  type PlatformScope,
} from "@/lib/combined-dashboard";
import { getCombinedDashboard } from "@/lib/combined-dashboard.functions";
import { count, money, percent, sar, short } from "@/lib/format";
import { averageOrder, commissionPct, compareFigures, platformCostPct, type TrendFigures } from "@/lib/report-trends";
import { cn } from "@/lib/utils";

const PLATFORM_LABEL: Record<(typeof COMBINED_PLATFORMS)[number], string> = { hungerstation: "هنقرستيشن", keeta: "كيتا", jahez: "جاهز" };

/** "2026-09" → "سبتمبر 2026". */
function monthName(month: string, withYear = true) {
  const date = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "UTC", month: "long", ...(withYear ? { year: "numeric" } : {}) });
}

export interface ScopeValue {
  company: CompanyScope;
  platform: PlatformScope;
}

/** Company, platform and (in the combined view) month pickers for the executive dashboard. */
export function ScopeBar({
  companies,
  value,
  onChange,
  months,
  month,
  onMonth,
}: {
  companies: { id: string; name: string }[];
  value: ScopeValue;
  onChange: (next: ScopeValue) => void;
  months?: string[];
  month?: string | null;
  onMonth?: (month: string) => void;
}) {
  return (
    <ActionBar>
      {companies.length > 1 ? (
        <>
          <Select dir="rtl" value={value.company} onValueChange={(company) => onChange({ ...value, company })}>
            <SelectTrigger className="h-8 w-auto min-w-[150px] max-w-[240px] gap-1.5 text-xs" aria-label="الشركة">
              <Building2 className="size-3.5 shrink-0 text-primary-text" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الشركات</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ActionDivider />
        </>
      ) : null}
      <div role="group" aria-label="المنصة" className="flex flex-wrap gap-1">
        {(["all", ...COMBINED_PLATFORMS] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={value.platform === p}
            onClick={() => onChange({ ...value, platform: p })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              value.platform === p ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/30",
            )}
          >
            {p === "all" ? "كل المنصات" : PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>
      {months && months.length && month && onMonth ? (
        <>
          <span className="ms-auto" />
          <Select dir="rtl" value={month} onValueChange={onMonth}>
            <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs" aria-label="الشهر">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{monthName(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : null}
    </ActionBar>
  );
}

const chartTooltip = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    fontSize: "12px",
    direction: "rtl" as const,
  },
  labelStyle: { color: "var(--color-muted-foreground)" },
};

/** "▲ 4.2% عن أغسطس" style change line; points for percentages. */
function changeHint(value: number | null, kind: "relative" | "points", previousMonth: string | null, upIsGood: boolean) {
  if (value === null || !Number.isFinite(value) || !previousMonth) return { text: undefined, tone: "default" as const };
  const amount = Math.abs(value) * 100;
  if (amount < 0.05) return { text: `دون تغيير عن ${monthName(previousMonth, false)}`, tone: "default" as const };
  const arrow = value > 0 ? "▲" : "▼";
  const text = `${arrow} ${amount.toFixed(1)}${kind === "relative" ? "%" : " نقطة"} عن ${monthName(previousMonth, false)}`;
  return { text, tone: (value > 0) === upIsGood ? ("positive" as const) : ("negative" as const) };
}

const TONE = { default: "text-muted-foreground", positive: "text-success", negative: "text-destructive" } as const;

/** Every company and platform in scope added together for one month. */
export function CombinedDashboard({
  scope,
  month,
  onScope,
  onMonth,
}: {
  scope: ScopeValue;
  month: string | undefined;
  onScope: (next: ScopeValue) => void;
  onMonth: (month: string) => void;
}) {
  const query = useQuery({
    queryKey: ["combined-dashboard"],
    queryFn: () => getCombinedDashboard({ data: {} }),
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ تجميع بيانات الشركات…</p>;
  }
  if (query.error || !query.data) {
    return (
      <EmptyState
        title="تعذّر تحميل الصورة الكاملة"
        body={query.error instanceof Error ? query.error.message : "حاول تحديث الصفحة."}
      />
    );
  }
  return <CombinedBody data={query.data} scope={scope} month={month} onScope={onScope} onMonth={onMonth} />;
}

function CombinedBody({
  data,
  scope,
  month: requestedMonth,
  onScope,
  onMonth,
}: {
  data: CombinedDashboardData;
  scope: ScopeValue;
  month: string | undefined;
  onScope: (next: ScopeValue) => void;
  onMonth: (month: string) => void;
}) {
  const view = buildCombinedView(data, { ...scope, month: requestedMonth });
  const t = view.total;
  const change = compareFigures(t, view.previous);
  const scopedCompanies = scope.company === "all" ? data.companies : data.companies.filter((c) => c.id === scope.company);
  const excludedPicked = scope.company !== "all" && !scopedCompanies.length;
  const scopeLabel = [
    scope.company === "all" ? (data.companies.length > 1 ? `${count(data.companies.length)} شركات` : data.companies[0]?.name) : scopedCompanies[0]?.name,
    scope.platform === "all" ? "كل المنصات" : PLATFORM_LABEL[scope.platform],
  ]
    .filter(Boolean)
    .join(" · ");

  const sales = changeHint(change.salesChange, "relative", view.previousMonth, true);
  const orders = changeHint(change.ordersChange, "relative", view.previousMonth, true);
  const cost = changeHint(change.costPctChange, "points", view.previousMonth, false);
  const commission = changeHint(change.commissionPctChange, "points", view.previousMonth, false);

  const tiles: { label: string; value: string; hint?: string; tone?: keyof typeof TONE; icon: typeof Store; valueTone?: string }[] = [
    { label: "الطلبات", value: count(t.orders), hint: orders.text, tone: orders.tone, icon: ShoppingCart },
    { label: "متوسط قيمة الطلب", value: sar(averageOrder(t) ?? 0), icon: Store },
    { label: "تكلفة المنصات", value: sar(t.platformCharges), icon: Receipt, valueTone: "text-destructive" },
    { label: "نسبة تكلفة المنصة", value: platformCostPct(t) === null ? "—" : percent(platformCostPct(t)), hint: cost.text, tone: cost.tone, icon: PieChart, valueTone: "text-destructive" },
    { label: "العمولة", value: sar(t.commission), icon: Percent, valueTone: "text-destructive" },
    { label: "نسبة العمولة", value: commissionPct(t) === null ? "—" : percent(commissionPct(t)), hint: commission.text, tone: commission.tone, icon: Percent },
  ];

  const series = view.series.map((s) => ({
    month: monthName(s.month, false),
    مبيعات: Number(s.figures.grossSales.toFixed(2)),
    "نسبة تكلفة المنصة": platformCostPct(s.figures) === null ? null : Number(((platformCostPct(s.figures) ?? 0) * 100).toFixed(2)),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية" }, { label: "اللوحة التنفيذية" }]}
        title="اللوحة التنفيذية"
        subtitle={
          <span>
            الصورة الكاملة · {scopeLabel}
            {view.month ? <> · {monthName(view.month)}</> : null}
          </span>
        }
      />

      <ScopeBar
        companies={data.companies}
        value={scope}
        onChange={onScope}
        months={view.months}
        month={view.month}
        onMonth={onMonth}
      />

      {view.missing.length ? (
        <Callout tone="warning" icon={AlertTriangle} title={`الإجمالي قد يكون ناقصاً: لا توجد فترة محفوظة لشهر ${monthName(view.month ?? "", false)} في`}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {view.missing.map((m) => (
              <li key={m.company + m.platform}>
                {m.company} · {PLATFORM_LABEL[m.platform]}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {data.excluded.length ? (
        <p className="flex items-start gap-1.5 text-[12px] leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            لا تدخل في الإجمالي: {data.excluded.map((e) => `${e.name} (${e.reason})`).join("، ")}.
          </span>
        </p>
      ) : null}

      {!view.month ? (
        <EmptyState
          title={excludedPicked ? "هذه الشركة خارج الصورة الكاملة" : "لا توجد فترات محفوظة في هذا النطاق"}
          body={excludedPicked ? "صلاحيتك فيها لا تشمل كل الفروع أو التقارير." : "اختر منصة أو شركة أخرى، أو ارفع فترة."}
        />
      ) : (
        <>
          <section aria-labelledby="combined-headline" className="panel overflow-hidden">
            <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-8">
              <div className="min-w-0">
                <p id="combined-headline" className="text-[13px] text-muted-foreground">المبيعات الإجمالية (شامل الضريبة)</p>
                <p className="num mt-1 truncate text-[30px] font-semibold leading-tight tracking-[-0.02em] text-primary-text sm:text-[38px]">{sar(t.grossSales)}</p>
                <p className={cn("mt-1 text-[12px]", TONE[sales.tone])}>
                  {sales.text ?? (view.previousMonth ? "" : "لا يوجد شهر سابق للمقارنة")}
                  <span className="text-muted-foreground"> · {count(t.periods)} فترة</span>
                </p>
                <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
                  {tiles.map((item) => (
                    <div key={item.label} className="min-w-0 bg-card px-3.5 py-3">
                      <dt className="flex items-center gap-1.5 text-[11.5px] leading-5 text-muted-foreground">
                        <item.icon className="size-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </dt>
                      <dd className={cn("num mt-1 truncate text-[17px] font-semibold", item.valueTone)}>{item.value}</dd>
                      {item.hint ? <dd className={cn("mt-0.5 text-[10.5px] leading-4", TONE[item.tone ?? "default"])}>{item.hint}</dd> : null}
                    </div>
                  ))}
                </dl>
                <CostDefinitionNote className="mt-3" />
              </div>
              <figure className="min-w-0">
                <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-[13px] font-semibold">المبيعات ونسبة تكلفة المنصة شهرياً</span>
                  <Link to="/trends" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    الاتجاهات والمقارنة <ChevronLeft className="size-3.5" />
                  </Link>
                </figcaption>
                <div className="mt-3 h-64 xl:h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                      <YAxis yAxisId="sales" tickFormatter={(v: number) => short(v)} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={44} />
                      <YAxis yAxisId="pct" orientation="right" tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={40} />
                      <Tooltip
                        {...chartTooltip}
                        formatter={(value: number, name: string) => (name === "مبيعات" ? money(value) : `${value.toFixed(1)}%`)}
                      />
                      <Bar yAxisId="sales" dataKey="مبيعات" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                      <Line yAxisId="pct" type="monotone" dataKey="نسبة تكلفة المنصة" stroke="var(--color-chart-2)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex justify-center gap-5 text-[11.5px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-1" /> المبيعات</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-chart-2" /> نسبة تكلفة المنصة</span>
                </div>
              </figure>
            </div>
          </section>

          <div className={cn("grid items-start gap-5", view.byCompany.length > 1 && view.byPlatform.length > 1 && "xl:grid-cols-2")}>
            {view.byCompany.length > 1 ? (
              <BreakdownTable title="حسب الشركة" rows={view.byCompany} total={t} />
            ) : null}
            {view.byPlatform.length > 1 ? (
              <BreakdownTable
                title="حسب المنصة"
                rows={view.byPlatform}
                total={t}
                renderLabel={(row) => <PlatformName platform={row.key} iconClassName="size-4 rounded" />}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  total,
  renderLabel,
}: {
  title: string;
  rows: CombinedRow[];
  total: TrendFigures;
  renderLabel?: (row: CombinedRow) => React.ReactNode;
}) {
  return (
    <ChartCard title={title} bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-5 py-2.5 text-start font-medium">{title === "حسب الشركة" ? "الشركة" : "المنصة"}</th>
              <th className="px-3 py-2.5 text-start font-medium">المبيعات</th>
              <th className="px-3 py-2.5 text-start font-medium">الحصة</th>
              <th className="px-3 py-2.5 text-start font-medium">الطلبات</th>
              <th className="px-3 py-2.5 text-start font-medium">تكلفة المنصة</th>
              <th className="px-5 py-2.5 text-start font-medium">نسبة التكلفة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const f = row.figures;
              const share = total.grossSales > 0 ? f.grossSales / total.grossSales : 0;
              return (
                <tr key={row.key} className="border-b border-border/70 last:border-0">
                  <td className="max-w-[220px] truncate px-5 py-3 font-medium" title={row.label}>{renderLabel ? renderLabel(row) : row.label}</td>
                  <td className="px-3 py-3"><span className="num">{money(f.grossSales)}</span></td>
                  <td className="px-3 py-3"><span className="num text-muted-foreground">{percent(share, 1)}</span></td>
                  <td className="px-3 py-3"><span className="num">{count(f.orders)}</span></td>
                  <td className="px-3 py-3"><span className="num text-destructive">{money(f.platformCharges)}</span></td>
                  <td className="px-5 py-3"><span className="num">{platformCostPct(f) === null ? "—" : percent(platformCostPct(f), 1)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
