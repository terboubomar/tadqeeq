import type { RegistryBranch } from "./branch-registry";
import { BRANCH_PLATFORMS, type BranchPlatform } from "./branch-matching";
import type { StoredPeriod } from "./periods";
import { platformCostPct, totalPlatformCharges } from "./reporting-metrics";

export interface PlatformFigures {
  periodLabel: string;
  orders: number;
  grossSales: number;
  platformCost: number | null;
  /** total platform charges ÷ gross sales, the same definition everywhere. */
  platformCostPct: number | null;
}

export interface CrossPlatformRow {
  branchId: string;
  name: string;
  figures: Partial<Record<BranchPlatform, PlatformFigures>>;
}

const norm = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

/** The newest period of each platform (by end date, then upload time). */
export function latestByPlatform(periods: StoredPeriod[]): Partial<Record<BranchPlatform, StoredPeriod>> {
  const out: Partial<Record<BranchPlatform, StoredPeriod>> = {};
  for (const period of periods) {
    const platform = period.platform as BranchPlatform;
    if (!BRANCH_PLATFORMS.includes(platform)) continue;
    const current = out[platform];
    const newer =
      !current ||
      (period.period_end ?? "").localeCompare(current.period_end ?? "") > 0 ||
      ((period.period_end ?? "") === (current.period_end ?? "") && period.created_at.localeCompare(current.created_at) > 0);
    if (newer) out[platform] = period;
  }
  return out;
}

/**
 * One row per registry branch with its figures on each platform's latest period, matched the way uploads link them
 * (the platform's branch id, or its name when the file has no id). Branches with no figures anywhere are left out.
 */
export function crossPlatformRows(registry: RegistryBranch[], periods: StoredPeriod[]): CrossPlatformRow[] {
  const latest = latestByPlatform(periods);
  const rows = registry.map((row) => ({ branchId: row.id, name: row.name, figures: {} as CrossPlatformRow["figures"] }));
  for (const platform of BRANCH_PLATFORMS) {
    const period = latest[platform];
    if (!period) continue;
    const key = `${platform}_id` as const;
    for (const branch of period.branches ?? []) {
      const platformId = norm(branch.branchId) || norm(branch.branch);
      const index = registry.findIndex((row) => norm(row[key]) === platformId || (!branch.branchId && norm(row.name) === norm(branch.branch)));
      if (index < 0) continue;
      const cost = totalPlatformCharges(period.platform, branch);
      rows[index]!.figures[platform] = {
        periodLabel: period.label,
        orders: branch.orders,
        grossSales: branch.grossSales,
        platformCost: cost,
        platformCostPct: platformCostPct(cost, branch.grossSales),
      };
    }
  }
  return rows.filter((row) => Object.keys(row.figures).length > 0);
}
