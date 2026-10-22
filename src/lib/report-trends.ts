/**
 * Month-by-month figures across saved audit periods, for the trends report and scheduled report emails.
 *
 * Read-only reporting on stored period summaries: it adds and compares figures the engine already produced, using
 * the same platform-cost definition as the dashboard (reporting-metrics). A period counts towards the month its
 * end date falls in; several periods of one platform in a month are added together.
 */
import type { StoredPeriod } from "./periods";
import { periodPlatformCharges, salesExVat } from "./reporting-metrics";

export type TrendPlatform = StoredPeriod["platform"];

export interface TrendFigures {
  periods: number;
  orders: number;
  grossSales: number;
  /** Sales without VAT, the base of platform cost %. */
  salesExVat: number;
  commission: number;
  /** Sum of each period's commission base (commission ÷ its commission %), so the % can be re-weighted. */
  commissionBase: number;
  platformCharges: number;
}

export interface TrendMonth {
  /** "YYYY-MM". */
  month: string;
  total: TrendFigures;
  byPlatform: Partial<Record<TrendPlatform, TrendFigures>>;
}

const empty = (): TrendFigures => ({
  periods: 0,
  orders: 0,
  grossSales: 0,
  salesExVat: 0,
  commission: 0,
  commissionBase: 0,
  platformCharges: 0,
});

const finite = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function add(target: TrendFigures, period: StoredPeriod) {
  const s = period.summary;
  const commission = finite(s?.commission);
  const pct = finite(s?.commissionPct);
  target.periods += 1;
  target.orders += finite(s?.orders);
  target.grossSales += finite(s?.grossSales);
  target.salesExVat += finite(salesExVat(period.platform, s));
  target.commission += commission;
  if (pct > 0) target.commissionBase += commission / pct;
  target.platformCharges += finite(periodPlatformCharges(period));
}

/** The month a period belongs to: its end date, else its start, else when it was saved. */
export function periodMonth(period: Pick<StoredPeriod, "period_end" | "period_start" | "created_at">): string {
  return (period.period_end ?? period.period_start ?? period.created_at).slice(0, 7);
}

/** Months (oldest first) holding at least one period, optionally only the last `limit` of them and one platform. */
export function buildTrendMonths(
  periods: StoredPeriod[],
  options: { platform?: TrendPlatform | "all"; limit?: number } = {},
): TrendMonth[] {
  const byMonth = new Map<string, TrendMonth>();
  for (const period of periods) {
    if (options.platform && options.platform !== "all" && period.platform !== options.platform) continue;
    const month = periodMonth(period);
    const row = byMonth.get(month) ?? { month, total: empty(), byPlatform: {} };
    add(row.total, period);
    const platform = (row.byPlatform[period.platform] ??= empty());
    add(platform, period);
    byMonth.set(month, row);
  }
  const rows = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  return options.limit && options.limit > 0 ? rows.slice(-options.limit) : rows;
}

/** Figures added over several months (e.g. a platform across the selected range). */
export function sumFigures(list: (TrendFigures | undefined)[]): TrendFigures {
  const out = empty();
  for (const f of list) {
    if (!f) continue;
    out.periods += f.periods;
    out.orders += f.orders;
    out.grossSales += f.grossSales;
    out.salesExVat += f.salesExVat;
    out.commission += f.commission;
    out.commissionBase += f.commissionBase;
    out.platformCharges += f.platformCharges;
  }
  return out;
}

export const commissionPct = (f: TrendFigures): number | null => (f.commissionBase > 0 ? f.commission / f.commissionBase : null);
export const platformCostPct = (f: TrendFigures): number | null => (f.salesExVat > 0 ? f.platformCharges / f.salesExVat : null);
export const averageOrder = (f: TrendFigures): number | null => (f.orders > 0 ? f.grossSales / f.orders : null);

export interface TrendChange {
  /** Relative change (0.1 = +10%); null without a previous value. */
  salesChange: number | null;
  ordersChange: number | null;
  /** Change in percentage points as a fraction (0.012 = +1.2 points). */
  costPctChange: number | null;
  commissionPctChange: number | null;
}

const relative = (now: number, before: number) => (before > 0 ? (now - before) / before : null);
const points = (now: number | null, before: number | null) => (now === null || before === null ? null : now - before);

/** How `current` moved against `previous` (the month before in the list). */
export function compareFigures(current: TrendFigures, previous: TrendFigures | null): TrendChange {
  if (!previous) return { salesChange: null, ordersChange: null, costPctChange: null, commissionPctChange: null };
  return {
    salesChange: relative(current.grossSales, previous.grossSales),
    ordersChange: relative(current.orders, previous.orders),
    costPctChange: points(platformCostPct(current), platformCostPct(previous)),
    commissionPctChange: points(commissionPct(current), commissionPct(previous)),
  };
}
