import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";

import { MARKETPLACE_CHARGE_CATEGORY_LABELS, type MarketplaceChargeLine } from "@/lib/charges-mapper";
import { buildPeriodComparison, findPreviousComparablePeriod, type MetricComparison } from "@/lib/period-intelligence";
import type { StoredPeriod } from "@/lib/periods";
import { platformCostMap } from "@/lib/platform-cost-map";

import { periodHeadline } from "./readout";
import { supabaseForUser } from "./supabase";

/**
 * Platform cost (كاشِف) and period comparison for the MCP tools: the same shared cost the dashboard and
 * كاشِف show, and the same comparison as the period panel. Nothing here computes money; it only selects,
 * groups and rounds.
 */

const round = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 + 0 : null);
const ratio = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10000) / 10000 + 0 : null);

/** Earlier saved periods of the same platform (not replaced by a re-analysis), newest first. */
export async function loadEarlierPeriods(ctx: ToolContext, period: StoredPeriod, limit = 24): Promise<StoredPeriod[]> {
  const start = (period.period_start ?? "").slice(0, 10);
  if (!start) return [];
  const { data, error } = await supabaseForUser(ctx)
    .from("periods")
    .select("*")
    .eq("platform", period.platform)
    .is("superseded_at", null)
    .lt("period_end", start)
    .order("period_end", { ascending: false })
    .limit(limit);
  if (error) throw new ToolError(error.message);
  return (data ?? []) as unknown as StoredPeriod[];
}

function line(item: MarketplaceChargeLine) {
  return {
    label: item.label,
    amount_sar: round(item.amount),
    type: MARKETPLACE_CHARGE_CATEGORY_LABELS[item.category] ?? item.category,
    classified: item.mapped,
    source: item.source,
  };
}

/** What the platform cost is made of, with the change against the previous period of the same platform. */
export function costMapReadout(period: StoredPeriod, previous: StoredPeriod | null) {
  const map = platformCostMap(period);
  const before = previous ? platformCostMap(previous) : null;
  const byType = new Map<string, number>();
  for (const item of map.lines) {
    const type = MARKETPLACE_CHARGE_CATEGORY_LABELS[item.category] ?? item.category;
    byType.set(type, (byType.get(type) ?? 0) + item.amount);
  }
  return {
    period: periodHeadline(period),
    definition: "Platform cost without VAT: merchant-funded discounts out, advertising in (HungerStation CPC invoice, Keeta ads). Same figure as the dashboard.",
    platform_cost_sar: round(map.total),
    cost_pct_of_sales_ex_vat: ratio(map.costPct),
    cost_per_order_sar: round(map.costPerOrder),
    previous: before && previous
      ? {
          period: periodHeadline(previous),
          platform_cost_sar: round(before.total),
          cost_pct_of_sales_ex_vat: ratio(before.costPct),
          change_sar: round(map.total - before.total),
          change_pct_points: map.costPct !== null && before.costPct !== null ? ratio(map.costPct - before.costPct) : null,
        }
      : null,
    by_type: [...byType.entries()]
      .map(([type, amount]) => ({ type, amount_sar: round(amount) }))
      .sort((a, b) => (b.amount_sar ?? 0) - (a.amount_sar ?? 0)),
    lines: map.lines.map(line),
    unclassified: { count: map.unmapped.count, amount_sar: round(map.unmapped.amount) },
    merchant_funded_not_in_cost: map.merchantFunded.map(line),
    other_movements_not_in_cost: map.other.map(line),
    difference_lines_vs_total_sar: round(map.residual),
  };
}

function metric(m: MetricComparison) {
  return {
    key: m.key,
    label: m.label,
    unit: m.unit,
    current: m.unit === "ratio" ? ratio(m.current) : round(m.current),
    previous: m.unit === "ratio" ? ratio(m.previous) : round(m.previous),
    change: m.unit === "ratio" ? ratio(m.delta) : round(m.delta),
    relative_change: ratio(m.relativeChange),
    ...(m.percentagePointChange !== undefined ? { change_pct_points: ratio(m.percentagePointChange) } : {}),
  };
}

/** Two periods of the same platform side by side: the same comparison as the period panel in the app. */
export function comparisonReadout(current: StoredPeriod, previous: StoredPeriod) {
  const c = buildPeriodComparison(current, previous);
  return {
    current: periodHeadline(current),
    previous: periodHeadline(previous),
    comparable_duration: c.comparableDuration,
    warnings: c.warnings,
    metrics: c.metrics.map(metric),
    platform_metrics: c.platformMetrics.map(metric),
    differences: {
      open_count_change: c.exceptions.openCountDelta,
      under_review_change_sar: round(c.exceptions.underReviewDelta),
      potential_recovery_change_sar: round(c.exceptions.potentialRecoveryDelta),
      recovered_change_sar: round(c.exceptions.recoveredDelta),
    },
    branches_biggest_cost_change: [...c.branchMovements]
      .sort((a, b) => Math.abs(b.platformCostDelta) - Math.abs(a.platformCostDelta))
      .slice(0, 10)
      .map((b) => ({
        branch: b.branch,
        status: b.status,
        platform_cost_change_sar: round(b.platformCostDelta),
        cost_rate_change_pct_points: ratio(b.platformCostRateDelta),
        orders_change: b.ordersDelta,
        gross_sales_change_sar: round(b.grossSalesDelta),
      })),
  };
}

export { findPreviousComparablePeriod };
