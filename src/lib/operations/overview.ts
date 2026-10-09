import { operationCostRatio } from "./details";
import type { OperationPlatform, OperationPlatformMonth } from "./types";

/** A branch needs at least this many orders in the month before it can appear on the watchlist. */
export const WATCHLIST_MIN_ORDERS = 30;

export interface OperationOverviewTotals {
  grossSales: number;
  charges: number;
  orderCount: number;
  settlement: number;
  /** Month-end payout across platforms; null until every platform with files has no missing days. */
  forecastSettlement: number | null;
}

export function operationOverviewTotals(platforms: OperationPlatformMonth[]): OperationOverviewTotals {
  const active = platforms.filter((row) => row.coveredDays > 0);
  const forecastReady = active.length > 0 && active.every((row) => row.forecastSettlement != null);
  return {
    grossSales: active.reduce((sum, row) => sum + row.grossSales, 0),
    charges: active.reduce((sum, row) => sum + row.chargesToDate, 0),
    orderCount: active.reduce((sum, row) => sum + row.orderCount, 0),
    settlement: active.reduce((sum, row) => sum + row.settlementToDate, 0),
    forecastSettlement: forecastReady ? active.reduce((sum, row) => sum + (row.forecastSettlement ?? 0), 0) : null,
  };
}

/** Each platform's share of the month's sales, largest first; platforms without sales are left out. */
export function operationSalesShares(platforms: OperationPlatformMonth[]): Array<{ platform: OperationPlatform; grossSales: number; share: number }> {
  const total = platforms.reduce((sum, row) => sum + Math.max(0, row.grossSales), 0);
  if (total <= 0) return [];
  return platforms
    .filter((row) => row.grossSales > 0)
    .map((row) => ({ platform: row.platform, grossSales: row.grossSales, share: row.grossSales / total }))
    .sort((a, b) => b.grossSales - a.grossSales);
}

export function operationCostPerOrder(charges: number, orderCount: number): number | null {
  return orderCount > 0 ? Math.abs(charges) / orderCount : null;
}

export interface OperationWatchBranch {
  platform: OperationPlatform;
  key: string;
  name: string;
  orderCount: number;
  grossSales: number;
  costRatio: number;
}

/** Branches with the highest platform cost share across all platforms, ignoring branches with too few orders to judge. */
export function operationBranchWatchlist(platforms: OperationPlatformMonth[], limit = 3): OperationWatchBranch[] {
  const rows: OperationWatchBranch[] = [];
  for (const row of platforms) {
    for (const branch of row.branches) {
      const costRatio = operationCostRatio(branch.chargesTotal, branch.grossSales);
      if (costRatio == null || branch.orderCount < WATCHLIST_MIN_ORDERS) continue;
      rows.push({
        platform: row.platform,
        key: branch.key,
        name: branch.branchName ?? branch.branchId ?? branch.key,
        orderCount: branch.orderCount,
        grossSales: branch.grossSales,
        costRatio,
      });
    }
  }
  return rows.sort((a, b) => b.costRatio - a.costRatio).slice(0, limit);
}

export interface OperationDataHealth {
  platform: OperationPlatform;
  /** Days with no file before the platform's latest uploaded day. */
  missingDays: number[];
  /** Uploaded days whose file looks exported before settlement. */
  incompleteDays: string[];
}

/** Platforms that have files with gaps or incomplete days; platforms without files are not listed. */
export function operationDataHealth(platforms: OperationPlatformMonth[]): OperationDataHealth[] {
  return platforms
    .filter((row) => row.coveredDays > 0)
    .map((row) => ({
      platform: row.platform,
      missingDays: row.forecastMissingDays,
      incompleteDays: row.days.filter((day) => day.incomplete).map((day) => day.date),
    }))
    .filter((row) => row.missingDays.length > 0 || row.incompleteDays.length > 0);
}
