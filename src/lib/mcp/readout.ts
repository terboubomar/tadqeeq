import { buildPeriodSummaryAiPacket } from "@/lib/ai/period-summary-ai";
import { buildPeriodExceptions } from "@/lib/exceptions";
import type { StoredPeriod } from "@/lib/periods";

/**
 * What the MCP tools return about a period: the engine's numbers, shaped so an AI assistant can explain
 * them without reading the raw stored record. Nothing here computes money; it only selects and rounds.
 */

const PLATFORM_NAMES: Record<StoredPeriod["platform"], string> = {
  hungerstation: "HungerStation (هنقرستيشن)",
  keeta: "Keeta (كيتا)",
  jahez: "Jahez (جاهز)",
  ninja: "Ninja (نينجا)",
};

const round = (value: number | undefined | null) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null);

/** One line per period for lists: dates and the headline numbers. */
export function periodHeadline(period: Pick<StoredPeriod, "id" | "label" | "platform" | "period_start" | "period_end" | "created_at"> & { summary?: Partial<StoredPeriod["summary"]> | null }) {
  const s = period.summary ?? {};
  return {
    id: period.id,
    label: period.label,
    platform: period.platform,
    platform_name: PLATFORM_NAMES[period.platform],
    period_start: period.period_start,
    period_end: period.period_end,
    uploaded_at: period.created_at,
    orders: round(s.orders),
    gross_sales_sar: round(s.grossSales),
    commission_sar: round(s.commission),
    commission_pct: round(s.commissionPct),
    total_platform_charges_sar: round(s.totalCharges),
    branches: round(s.branchCount),
  };
}

/** The invoice comparison: what Tadqeeq recalculated against what the platform invoiced, line by line. */
function invoiceChecks(period: StoredPeriod) {
  return (period.invoice?.checks ?? [])
    .filter((check) => !check.controlOnly)
    .map((check) => {
      const difference = check.invoiced === undefined ? null : round(check.computed - check.invoiced);
      return {
        line: check.label,
        recalculated_sar: round(check.computed),
        invoiced_sar: round(check.invoiced),
        difference_sar: difference,
        within_tolerance: difference === null ? null : Math.abs(difference) <= (check.tolerance ?? 1),
        ...(check.invoiceOnly ? { invoice_only: true } : {}),
      };
    });
}

/** Full readout of one period: headline numbers, invoice comparison, open differences and costliest branches. */
export function periodReadout(period: StoredPeriod, appUrl: string) {
  const packet = buildPeriodSummaryAiPacket(period);
  return {
    period: periodHeadline(period),
    open_in_tadqeeq: `${appUrl}/history`,
    invoice_check: invoiceChecks(period),
    differences: {
      open_count: packet.exceptions.openCount,
      critical_count: packet.exceptions.criticalCount,
      amount_to_review_sar: round(packet.exceptions.underReview),
      potential_recovery_sar: round(packet.exceptions.potentialRecovery),
      already_recovered_sar: round(packet.exceptions.recovered),
      by_category: packet.categoryExposure.map((c) => ({
        category: c.category,
        count: c.count,
        amount_to_review_sar: round(c.reviewAmount),
        potential_recovery_sar: round(c.potentialRecovery),
      })),
      top: packet.topExceptions.map((e) => ({
        what: e.label,
        category: e.category,
        ...(e.branch ? { branch: e.branch } : {}),
        severity: e.severity,
        difference_sar: round(e.difference),
        potential_recovery_sar: round(e.potentialRecovery),
      })),
    },
    costliest_branches: packet.topBranches.map((b) => ({
      branch: b.branch,
      orders: b.orders,
      gross_sales_sar: round(b.grossSales),
      platform_cost_sar: round(b.platformCost),
      commission_pct: round(b.commissionPct),
    })),
    platform_details: Object.fromEntries(Object.entries(packet.platformMetrics).map(([key, value]) => [key, round(value)])),
    note: "All numbers come from Tadqeeq's accounting engine (SAR). Explain them; do not recalculate or change them.",
  };
}

/** Every branch in a period, largest platform cost first. */
export function branchPerformance(period: StoredPeriod) {
  return (period.branches ?? [])
    .map((b) => ({
      branch: b.branch,
      orders: b.orders,
      gross_sales_sar: round(b.grossSales),
      net_sales_sar: round(b.netSales),
      commission_sar: round(b.commission),
      commission_pct: round(b.commissionPct),
      platform_cost_sar: round(period.platform === "keeta" ? (b.keetaTotalCostExVat ?? b.totalCharges) : b.totalCharges),
      compensation_sar: round(b.compensation),
    }))
    .sort((left, right) => (right.platform_cost_sar ?? 0) - (left.platform_cost_sar ?? 0));
}

/** Differences found in a period, open ones first and largest first; closed ones only when asked. */
export function exceptionList(period: StoredPeriod, includeClosed: boolean) {
  return buildPeriodExceptions(period)
    .filter((e) => includeClosed || (e.status !== "closed" && e.status !== "recovered"))
    .sort((left, right) => right.reviewAmount - left.reviewAmount)
    .map((e) => ({
      what: e.label,
      category: e.categoryLabel,
      ...(e.branch ? { branch: e.branch } : {}),
      severity: e.severity,
      status: e.status,
      recalculated_sar: round(e.computed),
      invoiced_sar: round(e.invoiced),
      difference_sar: round(e.difference),
      amount_to_review_sar: round(e.reviewAmount),
      potential_recovery_sar: round(e.potentialRecovery),
      recovered_sar: round(e.recoveredAmount),
      ...(e.hint ? { hint: e.hint } : {}),
    }));
}
