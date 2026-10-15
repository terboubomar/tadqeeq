import { createFileRoute, Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SERIES_COLORS } from "@/lib/chart-palette";

import { EmptyState } from "@/components/AppShell";
import { CostDefinitionNote } from "@/components/dash/CostDefinitionNote";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionBar, ActionDivider, PageHeader } from "@/components/workspace/PageKit";
import { exportXlsx } from "@/lib/export";
import { count, money, percent, sar } from "@/lib/format";
import {
  averageOrder,
  buildTrendMonths,
  commissionPct,
  compareFigures,
  platformCostPct,
  sumFigures,
  type TrendFigures,
  type TrendPlatform,
} from "@/lib/report-trends";
import { forecastPlatformCost, FORECAST_MONTHS, projectedCost, type CostForecast } from "@/lib/cost-forecast";
import { usePeriods } from "@/lib/use-period";
import { cn } from "@/lib/utils";

const RANGES = [
  { months: 3, label: "3 أشهر" },
  { months: 6, label: "6 أشهر" },
  { months: 12, label: "12 شهراً" },
  { months: 0, label: "الكل" },
] as const;

const METRICS = {
  sales: { label: "المبيعات", format: (v: number) => money(v), pick: (f: TrendFigures) => f.grossSales },
  orders: { label: "الطلبات", format: (v: number) => count(v), pick: (f: TrendFigures) => f.orders },
  costPct: { label: "تكلفة المنصة %", format: (v: number) => percent(v, 1), pick: platformCostPct },
  commissionPct: { label: "نسبة العمولة", format: (v: number) => percent(v, 1), pick: commissionPct },
} as const;
type MetricKey = keyof typeof METRICS;

const PLATFORMS: TrendPlatform[] = ["hungerstation", "keeta", "jahez"];
const PLATFORM_LABEL: Record<TrendPlatform, string> = { hungerstation: "هنقرستيشن", keeta: "كيتا", jahez: "جاهز" };
/** Fixed slots from the checked report palette, so a platform keeps its colour whichever platforms are shown. */
const PLATFORM_COLOR: Record<TrendPlatform, string> = {
  hungerstation: SERIES_COLORS[0],
  keeta: SERIES_COLORS[1],
  jahez: SERIES_COLORS[2],
};

export const Route = createFileRoute("/_authenticated/trends")({
  validateSearch: (search: Record<string, unknown>): { months?: number; platform?: TrendPlatform; metric?: MetricKey } => ({
    months: [3, 6, 12, 0].includes(Number(search["months"])) && search["months"] !== undefined ? Number(search["months"]) : undefined,
    platform: PLATFORMS.includes(search["platform"] as TrendPlatform) ? (search["platform"] as TrendPlatform) : undefined,
    metric: typeof search["metric"] === "string" && search["metric"] in METRICS ? (search["metric"] as MetricKey) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "الاتجاهات والمقارنة · تدقيق" },
      { name: "description", content: "مقارنة الأشهر والمنصات: المبيعات وتكلفة المنصة والعمولة عبر الفترات المحفوظة." },
    ],
  }),
  component: TrendsPage,
});

/** "2026-09" → "سبتمبر 2026". */
function monthName(month: string, withYear = true) {
  const date = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "UTC", month: "long", ...(withYear ? { year: "numeric" } : {}) });
}

function TrendsPage() {
  const { data: periods = [], isLoading } = usePeriods();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const months = search.months ?? 6;
  const platform = search.platform ?? "all";
  const metric = search.metric ?? "costPct";
  const [tableOpen, setTableOpen] = useState(false);
  const set = (patch: Partial<typeof search>) => void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const all = useMemo(() => buildTrendMonths(periods, { platform }), [periods, platform]);
  const rows = useMemo(() => (months ? all.slice(-months) : all), [all, months]);
  const present = PLATFORMS.filter((p) => periods.some((period) => period.platform === p));

  if (isLoading) return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  if (!periods.length) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات أكثر من فترة لتظهر الاتجاهات والمقارنات." />;
  }

  const latest = rows[rows.length - 1] ?? null;
  // The month before the latest one, even when it falls outside the selected range.
  const before = latest ? (all[all.findIndex((m) => m.month === latest.month) - 1] ?? null) : null;
  const change = latest ? compareFigures(latest.total, before?.total ?? null) : null;
  const rangeTotal = sumFigures(rows.map((m) => m.total));
  const chartPlatforms = platform === "all" ? present : [platform];
  const isRate = metric === "costPct" || metric === "commissionPct";
  const chartRows = rows.map((m) => {
    const point: Record<string, number | string | null> = { month: m.month };
    for (const p of chartPlatforms) {
      const f = m.byPlatform[p];
      point[p] = f ? METRICS[metric].pick(f) : null;
    }
    return point;
  });

  const exportRows = () =>
    exportXlsx(
      [
        {
          name: "الأشهر",
          rows: [...rows].reverse().map((m) => ({
            name: monthName(m.month),
            periods: m.total.periods,
            orders: m.total.orders,
            sales: m.total.grossSales,
            avgOrder: averageOrder(m.total) ?? 0,
            charges: m.total.platformCharges,
            costPct: platformCostPct(m.total) ?? 0,
            commissionPct: commissionPct(m.total) ?? 0,
          })),
          columns: [
            { key: "name", header: "الشهر" },
            { key: "periods", header: "الفترات", type: "number" },
            { key: "orders", header: "الطلبات", type: "number" },
            { key: "sales", header: "المبيعات", type: "money" },
            { key: "avgOrder", header: "متوسط الطلب", type: "money" },
            { key: "charges", header: "رسوم المنصة", type: "money" },
            { key: "costPct", header: "تكلفة المنصة %", type: "percent" },
            { key: "commissionPct", header: "نسبة العمولة %", type: "percent" },
          ],
        },
        {
          name: "المنصات",
          rows: present.map((p) => {
            const f = sumFigures(rows.map((m) => m.byPlatform[p]));
            return {
              name: PLATFORM_LABEL[p],
              periods: f.periods,
              orders: f.orders,
              sales: f.grossSales,
              avgOrder: averageOrder(f) ?? 0,
              charges: f.platformCharges,
              costPct: platformCostPct(f) ?? 0,
              commissionPct: commissionPct(f) ?? 0,
            };
          }),
          columns: [
            { key: "name", header: "المنصة" },
            { key: "periods", header: "الفترات", type: "number" },
            { key: "orders", header: "الطلبات", type: "number" },
            { key: "sales", header: "المبيعات", type: "money" },
            { key: "avgOrder", header: "متوسط الطلب", type: "money" },
            { key: "charges", header: "رسوم المنصة", type: "money" },
            { key: "costPct", header: "تكلفة المنصة %", type: "percent" },
            { key: "commissionPct", header: "نسبة العمولة %", type: "percent" },
          ],
        },
      ],
      `tadqeeq-trends-${latest?.month ?? "all"}`,
    );

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التقارير" }, { label: "الاتجاهات والمقارنة" }]}
        title="الاتجاهات والمقارنة"
        subtitle="المبيعات وتكلفة المنصة شهراً بشهر."
      />

      <ActionBar>
        <div role="group" aria-label="المدة" className="flex rounded-lg bg-muted p-0.5">
          {RANGES.map((range) => (
            <button
              key={range.months}
              type="button"
              aria-pressed={months === range.months}
              onClick={() => set({ months: range.months === 6 ? undefined : range.months })}
              className={cn("rounded-md px-3 py-1.5 text-xs text-muted-foreground", months === range.months && "bg-card font-semibold text-foreground shadow-sm")}
            >
              {range.label}
            </button>
          ))}
        </div>
        <ActionDivider />
        <div role="group" aria-label="المنصة" className="flex flex-wrap gap-1">
          {(["all", ...present] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={platform === p}
              onClick={() => set({ platform: p === "all" ? undefined : p })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                platform === p ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/30",
              )}
            >
              {p === "all" ? "كل المنصات" : PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
        <span className="ms-auto" />
        <Button type="button" variant="outline" size="sm" disabled={!rows.length} onClick={exportRows}>
          <Download className="size-4" />
          تصدير Excel
        </Button>
      </ActionBar>

      {latest ? (
        <section aria-label="آخر شهر" className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
            <div className="col-span-2 bg-card px-5 py-5 lg:col-span-1">
              <p className="text-[12.5px] text-muted-foreground">مبيعات {monthName(latest.month)}</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="num text-[30px] font-semibold leading-none tracking-[-0.02em] sm:text-[36px]">{money(latest.total.grossSales)}</span>
                <span className="text-[13px] text-muted-foreground">ر.س</span>
              </p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                <Delta value={change?.salesChange ?? null} kind="relative" goodWhenUp />{" "}
                {before ? `عن ${monthName(before.month)}` : "لا يوجد شهر سابق للمقارنة"}
              </p>
            </div>
            <Stat label="تكلفة المنصة" value={percent(platformCostPct(latest.total) ?? 0, 1)} delta={<Delta value={change?.costPctChange ?? null} kind="points" />} hint={sar(latest.total.platformCharges)} />
            <Stat label="نسبة العمولة" value={commissionPct(latest.total) === null ? "—" : percent(commissionPct(latest.total) ?? 0, 1)} delta={<Delta value={change?.commissionPctChange ?? null} kind="points" />} hint={sar(latest.total.commission)} />
            <Stat
              wide
              label="الطلبات"
              value={count(latest.total.orders)}
              delta={<Delta value={change?.ordersChange ?? null} kind="relative" goodWhenUp />}
              hint={`متوسط الطلب ${averageOrder(latest.total) === null ? "—" : sar(averageOrder(latest.total))}`}
            />
          </div>
          <CostDefinitionNote className="border-t border-border px-5 py-3" />
        </section>
      ) : null}

      <CostForecastSection months={all} platforms={chartPlatforms} />

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[15px] font-bold">{METRICS[metric].label} شهرياً حسب المنصة</h2>
          <div role="group" aria-label="المؤشر" className="flex flex-wrap rounded-lg bg-muted p-0.5">
            {(Object.keys(METRICS) as MetricKey[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={metric === key}
                onClick={() => set({ metric: key === "costPct" ? undefined : key })}
                className={cn("rounded-md px-3 py-1.5 text-xs text-muted-foreground", metric === key && "bg-card font-semibold text-foreground shadow-sm")}
              >
                {METRICS[key].label}
              </button>
            ))}
          </div>
        </div>
        {rows.length < 2 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            يظهر الاتجاه عند وجود شهرين أو أكثر في المدة المختارة.
          </p>
        ) : null}
        <div className="mt-4 h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 8, right: chartPlatforms.length > 1 ? 72 : 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.6} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} tickFormatter={(m: string) => monthName(m, false)} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={52}
                // Rates are read against each other, so their scale fits the data; amounts start at zero.
                domain={isRate ? [(min: number) => Math.max(0, Math.floor((min - 0.01) * 100) / 100), (max: number) => Math.ceil((max + 0.01) * 100) / 100] : [0, "auto"]}
                tickFormatter={(v: number) => (metric === "costPct" || metric === "commissionPct" ? `${Math.round(v * 1000) / 10}%` : new Intl.NumberFormat("en-US", { notation: "compact" }).format(v))}
              />
              <Tooltip
                labelFormatter={(m: string) => monthName(m)}
                formatter={(value: number, name: string) => [METRICS[metric].format(value), PLATFORM_LABEL[name as TrendPlatform] ?? name]}
              />
              <Legend formatter={(name: string) => PLATFORM_LABEL[name as TrendPlatform] ?? name} wrapperStyle={{ fontSize: 12 }} />
              {chartPlatforms.map((p) => {
                // Name each line at its last point, so the platform is read off the line, not only the legend.
                const last = chartRows.reduce((at, row, index) => (typeof (row as Record<string, unknown>)[p] === "number" ? index : at), -1);
                return (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stroke={PLATFORM_COLOR[p]}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 2, fill: "var(--color-card)" }}
                    activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
                    connectNulls
                    isAnimationActive={false}
                    label={
                      chartPlatforms.length > 1
                        ? ({ x, y, index }: { x?: number; y?: number; index?: number }) =>
                            index === last && x !== undefined && y !== undefined ? (
                              <text x={x + 8} y={y} dy={4} fontSize={11} fontWeight={600} fill="var(--color-foreground)">
                                {PLATFORM_LABEL[p]}
                              </text>
                            ) : (
                              <g />
                            )
                        : undefined
                    }
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {platform === "all" && present.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-display text-[15px] font-bold">مقارنة المنصات</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              مجموع {rows.length ? `${monthName(rows[0]!.month)} — ${monthName(rows[rows.length - 1]!.month)}` : "المدة"}. النسب محسوبة من المجاميع، لا متوسط النسب.
            </p>
          </div>
          <ul className="divide-y divide-border md:hidden">
            {present.map((p) => {
              const f = sumFigures(rows.map((m) => m.byPlatform[p]));
              return (
                <li key={p} className="space-y-1.5 px-5 py-3.5 text-[12.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <PlatformName platform={p} className="font-semibold" />
                    <span className="num font-semibold">{sar(f.grossSales)}</span>
                  </div>
                  <p className="text-muted-foreground">
                    تكلفة المنصة <span className="num font-semibold text-foreground">{percent(platformCostPct(f) ?? 0, 1)}</span> · العمولة{" "}
                    <span className="num">{commissionPct(f) === null ? "—" : percent(commissionPct(f) ?? 0, 1)}</span> · <span className="num">{count(f.orders)}</span> طلب
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-muted/40 text-[11.5px] text-muted-foreground">
                <tr>
                  {["المنصة", "الفترات", "الطلبات", "المبيعات", "متوسط الطلب", "رسوم المنصة", "تكلفة المنصة", "نسبة العمولة"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 font-semibold", i === 0 ? "text-start" : "text-end")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...present.map((p) => [p, sumFigures(rows.map((m) => m.byPlatform[p]))] as const), ["total", rangeTotal] as const].map(([key, f]) => (
                  <tr key={key} className={cn("border-t border-border", key === "total" && "bg-muted/30 font-semibold")}>
                    <td className="px-4 py-3">{key === "total" ? "الإجمالي" : <PlatformName platform={key as TrendPlatform} />}</td>
                    <NumCell>{count(f.periods)}</NumCell>
                    <NumCell>{count(f.orders)}</NumCell>
                    <NumCell>{money(f.grossSales)}</NumCell>
                    <NumCell>{averageOrder(f) === null ? "—" : money(averageOrder(f))}</NumCell>
                    <NumCell>{money(f.platformCharges)}</NumCell>
                    <NumCell strong>{platformCostPct(f) === null ? "—" : percent(platformCostPct(f) ?? 0, 1)}</NumCell>
                    <NumCell>{commissionPct(f) === null ? "—" : percent(commissionPct(f) ?? 0, 1)}</NumCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <button
          type="button"
          aria-expanded={tableOpen}
          onClick={() => setTableOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start"
        >
          <span className="font-display text-[15px] font-bold">الأرقام شهراً بشهر</span>
          <span className="text-[12px] text-primary-text">{tableOpen ? "إخفاء" : `عرض ${count(rows.length)} شهر`}</span>
        </button>
        {tableOpen ? (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-muted/40 text-[11.5px] text-muted-foreground">
                <tr>
                  {["الشهر", "الفترات", "الطلبات", "المبيعات", "التغير", "تكلفة المنصة", "نسبة العمولة"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 font-semibold", i === 0 ? "text-start" : "text-end")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((m) => {
                  const prev = all[all.findIndex((x) => x.month === m.month) - 1];
                  const c = compareFigures(m.total, prev?.total ?? null);
                  return (
                    <tr key={m.month} className="border-t border-border">
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium">{monthName(m.month)}</td>
                      <NumCell>{count(m.total.periods)}</NumCell>
                      <NumCell>{count(m.total.orders)}</NumCell>
                      <NumCell>{money(m.total.grossSales)}</NumCell>
                      <td className="px-4 py-2.5 text-end"><Delta value={c.salesChange} kind="relative" goodWhenUp /></td>
                      <NumCell>{platformCostPct(m.total) === null ? "—" : percent(platformCostPct(m.total) ?? 0, 1)}</NumCell>
                      <NumCell>{commissionPct(m.total) === null ? "—" : percent(commissionPct(m.total) ?? 0, 1)}</NumCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <p className="text-[12px] text-muted-foreground">
        كل فترة تُحسب في شهر تاريخ نهايتها. لإرسال هذه الأرقام بالبريد تلقائياً، استخدم{" "}
        <Link to="/report-schedules" className="font-semibold text-primary-text underline-offset-4 hover:underline">
          جدولة التقارير
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * Next month's platform cost per platform, estimated from its latest audited months (see cost-forecast), with the
 * sales to apply it to as a what-if: it starts at the latest month's sales and can be changed.
 */
function CostForecastSection({ months, platforms }: { months: ReturnType<typeof buildTrendMonths>; platforms: TrendPlatform[] }) {
  const forecasts = useMemo(
    () => platforms.map((p) => forecastPlatformCost(months, p)).filter((f): f is CostForecast => f !== null),
    [months, platforms],
  );
  const [sales, setSales] = useState<Partial<Record<TrendPlatform, string>>>({});
  if (!forecasts.length) return null;

  const salesFor = (f: CostForecast) => {
    const typed = sales[f.platform];
    return typed === undefined ? f.lastSales : Number(typed.replace(/,/g, ""));
  };
  const rows = forecasts.map((f) => ({ f, sales: salesFor(f), ...projectedCost(f, salesFor(f)) }));
  const total = rows.reduce(
    (sum, row) => ({
      sales: sum.sales + (Number.isFinite(row.sales) && row.sales > 0 ? row.sales : 0),
      cost: sum.cost + row.cost,
      low: sum.low + row.low,
      high: sum.high + row.high,
    }),
    { sales: 0, cost: 0, low: 0, high: 0 },
  );
  const forecastMonth = forecasts.map((f) => f.month).sort().at(-1)!;

  return (
    <section aria-label="توقع تكلفة المنصة" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="px-4 pt-4 sm:px-5">
        <h2 className="font-display text-[15px] font-bold">توقع تكلفة المنصة · {monthName(forecastMonth)}</h2>
        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
          تقدير من آخر {FORECAST_MONTHS} أشهر مدققة لكل منصة، والأحدث أثقل وزناً. غيّر المبيعات المتوقعة لترى التكلفة. هذا
          تقدير وليس رقماً من التدقيق.
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="bg-surface-raised text-[11.5px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-start font-semibold">المنصة</th>
              <th className="px-4 py-2.5 text-end font-semibold">تكلفة المنصة المتوقعة</th>
              <th className="px-4 py-2.5 text-end font-semibold">المبيعات المتوقعة (ر.س)</th>
              <th className="px-4 py-2.5 text-end font-semibold">التكلفة المتوقعة</th>
              <th className="px-4 py-2.5 text-start font-semibold">مبني على</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, cost, low, high }) => (
              <tr key={f.platform} className="border-t border-border/70 align-top">
                <td className="px-4 py-2.5">
                  <PlatformName platform={f.platform} className="text-[13px] font-semibold" iconClassName="size-4 rounded" />
                </td>
                <td className="px-4 py-2.5 text-end">
                  <span className="num block font-semibold">{percent(f.costPct, 1)}</span>
                  {f.basis.length > 1 ? (
                    <span className="block whitespace-nowrap text-[11.5px] text-muted-foreground">
                      من <span className="num">{percent(f.low, 1)}</span> إلى <span className="num">{percent(f.high, 1)}</span>
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-end">
                  <Input
                    inputMode="decimal"
                    dir="ltr"
                    aria-label={`المبيعات المتوقعة على ${PLATFORM_LABEL[f.platform]}`}
                    className="num ms-auto h-8 w-36 text-end text-[13px]"
                    value={sales[f.platform] ?? String(Math.round(f.lastSales))}
                    onChange={(event) => setSales((prev) => ({ ...prev, [f.platform]: event.target.value }))}
                  />
                </td>
                <td className="px-4 py-2.5 text-end">
                  <span className="num block font-semibold">{sar(cost)}</span>
                  {f.basis.length > 1 ? (
                    <span className="block whitespace-nowrap text-[11.5px] text-muted-foreground">
                      من <span className="num">{money(low)}</span> إلى <span className="num">{money(high)}</span>
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                  {f.basis.map((row) => monthName(row.month, false)).join("، ")}
                  {f.basis.length < FORECAST_MONTHS ? <span className="block">تقدير أولي: {f.basis.length === 1 ? "شهر واحد" : "شهران"} فقط</span> : null}
                </td>
              </tr>
            ))}
            {rows.length > 1 ? (
              <tr className="border-t border-border bg-surface-raised/60 font-semibold">
                <td className="px-4 py-2.5">الإجمالي</td>
                <td className="px-4 py-2.5 text-end">
                  <span className="num">{total.sales > 0 ? percent(total.cost / total.sales, 1) : "—"}</span>
                </td>
                <td className="px-4 py-2.5 text-end">
                  <span className="num">{money(total.sales)}</span>
                </td>
                <td className="px-4 py-2.5 text-end">
                  <span className="num block">{sar(total.cost)}</span>
                  <span className="block whitespace-nowrap text-[11.5px] font-normal text-muted-foreground">
                    من <span className="num">{money(total.low)}</span> إلى <span className="num">{money(total.high)}</span>
                  </span>
                </td>
                <td />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value, delta, hint, wide = false }: { label: string; value: string; delta: ReactNode; hint: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0 bg-card px-5 py-5", wide && "col-span-2 lg:col-span-1")}>
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className="num mt-2 truncate text-[19px] font-semibold tracking-[-0.01em] sm:text-[22px]">{value}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
        {delta}
        <span className="num">{hint}</span>
      </p>
    </div>
  );
}

/**
 * A change badge. `relative` is a % change, `points` a change in percentage points. Costs going up are bad, so for
 * those (the default) up is red; sales and orders going up are good.
 */
function Delta({ value, kind, goodWhenUp = false }: { value: number | null; kind: "relative" | "points"; goodWhenUp?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-muted-foreground">—</span>;
  const flat = Math.abs(value) < 0.0005;
  const up = value > 0;
  const good = flat ? null : up === goodWhenUp;
  const amount = (Math.abs(value) * 100).toFixed(1);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
        good === null ? "bg-muted text-muted-foreground" : good ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive",
      )}
    >
      <span aria-hidden>{flat ? "=" : up ? "▲" : "▼"}</span>
      <span className="num">{flat ? "0" : kind === "relative" ? `${amount}%` : amount}</span>
      {kind === "points" && !flat ? <span>نقطة</span> : null}
    </span>
  );
}

function NumCell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <td className={cn("whitespace-nowrap px-4 py-2.5 text-end", strong && "font-semibold")}>
      <span className="num">{children}</span>
    </td>
  );
}
