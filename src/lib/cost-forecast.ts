/**
 * Next month's platform cost, estimated from the months already audited. Read-only reporting: it weighs ratios of
 * figures the engine already produced (platform charges ÷ gross sales, advertising included, see reporting-metrics)
 * and never feeds an audit result. The estimate is the latest months' cost %, the most recent weighted most
 * (3, 2, 1), with the lowest and highest of those months as its range.
 */
import { platformCostPct, type TrendMonth, type TrendPlatform } from "./report-trends";

/** How many audited months an estimate rests on at most. */
export const FORECAST_MONTHS = 3;
const WEIGHTS = [3, 2, 1];

export interface CostForecast {
  platform: TrendPlatform;
  /** "YYYY-MM" of the month estimated: the one after the latest audited month. */
  month: string;
  /** The audited months used, newest first. */
  basis: Array<{ month: string; costPct: number; grossSales: number }>;
  /** Weighted platform cost % (0–1). */
  costPct: number;
  low: number;
  high: number;
  /** The latest audited month's gross sales, the default for the what-if. */
  lastSales: number;
}

/** "2026-09" → "2026-10". */
export function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, m ?? 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The estimate for one platform from its latest audited months, or null when it has none with sales. */
export function forecastPlatformCost(months: TrendMonth[], platform: TrendPlatform): CostForecast | null {
  const basis: CostForecast["basis"] = [];
  for (let i = months.length - 1; i >= 0 && basis.length < FORECAST_MONTHS; i--) {
    const figures = months[i]!.byPlatform[platform];
    const pct = figures ? platformCostPct(figures) : null;
    if (figures && pct !== null) basis.push({ month: months[i]!.month, costPct: pct, grossSales: figures.grossSales });
  }
  if (!basis.length) return null;
  const weights = WEIGHTS.slice(0, basis.length);
  const costPct = basis.reduce((sum, row, i) => sum + row.costPct * weights[i]!, 0) / weights.reduce((a, b) => a + b, 0);
  const rates = basis.map((row) => row.costPct);
  return {
    platform,
    month: nextMonth(basis[0]!.month),
    basis,
    costPct,
    low: Math.min(...rates),
    high: Math.max(...rates),
    lastSales: basis[0]!.grossSales,
  };
}

/** Platform cost in SAR at the estimated % for a given sales figure, with its range. */
export function projectedCost(forecast: CostForecast, sales: number): { cost: number; low: number; high: number } {
  const value = Number.isFinite(sales) && sales > 0 ? sales : 0;
  return { cost: value * forecast.costPct, low: value * forecast.low, high: value * forecast.high };
}
