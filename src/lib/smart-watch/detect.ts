import type { BranchRow } from "../analysis/types";
import type { StoredPeriod } from "../periods";

/**
 * Smart watch: flags branches whose platform charges are unusual for them.
 *
 * It only reads the figures the accounting engines already produced and never changes them.
 * Each charge is turned into a rate of the branch's sales and compared with a learned "usual"
 * rate: the branch's own earlier periods on the same platform when there are enough, otherwise
 * the other branches in the same period. The comparison is robust (median and median absolute
 * deviation), so one odd month does not move the baseline. Alerts are ranked by the SAR impact
 * of the difference. A rate the user marked as expected becomes the new accepted level for that
 * branch and charge.
 */

export type WatchPlatform = StoredPeriod["platform"];

export type WatchMetric = "commission" | "payment_fees" | "delivery" | "compensation" | "total_cost";

export const WATCH_METRICS: readonly WatchMetric[] = ["commission", "payment_fees", "delivery", "compensation", "total_cost"];

export type WatchBasis = "history" | "peers";

export interface WatchAlert {
  /** Stable within a period: branch key and metric. */
  id: string;
  branch: string;
  branchKey: string;
  metric: WatchMetric;
  /** The charge as a share of the branch's sales base this period. */
  rate: number;
  /** The usual share learned from history or peers. */
  typical: number;
  /** Sales base the rates apply to (see salesBase). */
  base: number;
  /** Extra SAR charged compared with the usual rate. */
  impact: number;
  basis: WatchBasis;
  /** How many earlier periods or peer branches the usual rate was learned from. */
  samples: number;
  /** Robust z-score: how many spreads above usual. */
  score: number;
}

/** A rate the user confirmed as expected for a branch and charge. */
export interface WatchAcceptance {
  platform: WatchPlatform;
  branchKey: string;
  metric: WatchMetric;
  acceptedRate: number;
}

export interface WatchReport {
  alerts: WatchAlert[];
  /** Earlier periods of the same platform used as history. */
  historyPeriods: number;
  /** Branches with enough sales to be checked. */
  checkedBranches: number;
  /** Alerts hidden because the user already marked that level as expected. */
  muted: number;
}

/** Sales below this (SAR) give rates too noisy to judge. */
export const MIN_BASE = 500;
/** Differences worth less than this (SAR) are not shown. */
export const MIN_IMPACT = 100;
const HISTORY_SCORE = 3;
const PEER_SCORE = 3.5;
const MIN_PEERS = 4;
const MAX_HISTORY = 12;

function positive(value: number | undefined | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Sales base the platform's charges are calculated on. */
export function salesBase(platform: WatchPlatform, branch: BranchRow): number {
  if (platform === "hungerstation") return positive(branch.netSales);
  if (platform === "keeta") return positive(branch.keetaSalesExVat ?? branch.grossSales / 1.15);
  return positive(branch.grossSales);
}

/** The SAR amount of one charge for a branch. */
export function metricAmount(platform: WatchPlatform, branch: BranchRow, metric: WatchMetric): number {
  if (platform === "hungerstation") {
    switch (metric) {
      case "commission":
        return positive(branch.commission);
      case "payment_fees":
        return positive(branch.bankFeeSuccess) + positive(branch.walletFee);
      case "delivery":
        return positive(branch.rdfCampaigns);
      case "compensation":
        return positive(branch.compensation);
      case "total_cost":
        return positive(branch.totalCharges);
    }
  }
  if (platform === "keeta") {
    switch (metric) {
      case "commission":
        return positive(branch.keetaCommissionExVat ?? branch.commission);
      case "payment_fees":
        return positive(branch.keetaBankFeesExVat);
      case "delivery":
        return positive(branch.keetaDeliveryCampaignExVat);
      case "compensation":
        return positive(branch.keetaCompensationExVat);
      case "total_cost":
        return positive(branch.keetaTotalCostExVat ?? branch.totalCharges);
    }
  }
  switch (metric) {
    case "commission":
      return positive(branch.jahezCommissionInclVat ?? branch.commission);
    case "payment_fees":
      return positive(branch.jahezPaymentFeesExVat);
    case "delivery":
      return positive(branch.jahezDeliveryOfferInclVat);
    case "compensation":
      return positive(branch.jahezCompensationNetImpact);
    case "total_cost":
      return positive(branch.totalCharges);
  }
}

/** Matches the same branch across periods: platform branch ID, else its name. */
export function branchKey(branch: Pick<BranchRow, "branch" | "branchId">): string {
  const id = (branch.branchId ?? "").trim();
  if (id) return "id:" + id;
  return "name:" + branch.branch.trim().toLowerCase().replace(/\s+/g, " ");
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Robust spread around the median, never below a floor so a perfectly steady history still allows normal noise. */
function spread(values: number[], center: number, relativeFloor: number, absoluteFloor: number): number {
  const mad = median(values.map((value) => Math.abs(value - center)));
  return Math.max(1.4826 * mad, relativeFloor * center, absoluteFloor);
}

interface Baseline {
  typical: number;
  spread: number;
  basis: WatchBasis;
  samples: number;
}

function historyBaseline(rates: number[]): Baseline | null {
  if (rates.length < 2) return null;
  const typical = median(rates);
  return { typical, spread: spread(rates, typical, 0.1, 0.003), basis: "history", samples: rates.length };
}

function peerBaseline(rates: number[]): Baseline | null {
  if (rates.length < MIN_PEERS) return null;
  const typical = median(rates);
  return { typical, spread: spread(rates, typical, 0.15, 0.005), basis: "peers", samples: rates.length };
}

/** Periods of the same platform that ended before this one started, newest first. */
export function earlierPeriods(selected: StoredPeriod, periods: StoredPeriod[]): StoredPeriod[] {
  return periods
    .filter((period) => {
      if (period.id === selected.id || period.platform !== selected.platform || period.superseded_at || period.superseded_by) return false;
      if (selected.period_start && period.period_end) return period.period_end < selected.period_start;
      return period.created_at < selected.created_at;
    })
    .sort((a, b) => (b.period_end ?? b.created_at).localeCompare(a.period_end ?? a.created_at))
    .slice(0, MAX_HISTORY);
}

function rateOf(platform: WatchPlatform, branch: BranchRow, metric: WatchMetric): { rate: number; base: number } | null {
  const base = salesBase(platform, branch);
  if (base < MIN_BASE) return null;
  return { rate: metricAmount(platform, branch, metric) / base, base };
}

export function detectAnomalies(
  selected: StoredPeriod,
  periods: StoredPeriod[],
  acceptances: WatchAcceptance[] = [],
): WatchReport {
  const platform = selected.platform;
  const history = earlierPeriods(selected, periods);
  const accepted = new Map(
    acceptances
      .filter((acceptance) => acceptance.platform === platform)
      .map((acceptance) => [acceptance.branchKey + "|" + acceptance.metric, acceptance.acceptedRate]),
  );

  const checked = selected.branches.filter((branch) => salesBase(platform, branch) >= MIN_BASE);
  const pastByBranch = new Map<string, BranchRow[]>();
  for (const period of history) {
    for (const branch of period.branches ?? []) {
      const key = branchKey(branch);
      const list = pastByBranch.get(key) ?? [];
      list.push(branch);
      pastByBranch.set(key, list);
    }
  }

  const alerts: WatchAlert[] = [];
  let muted = 0;

  for (const metric of WATCH_METRICS) {
    const peerRates = checked.map((branch) => metricAmount(platform, branch, metric) / salesBase(platform, branch));

    checked.forEach((branch, index) => {
      const current = rateOf(platform, branch, metric);
      if (!current) return;
      const key = branchKey(branch);
      const pastRates = (pastByBranch.get(key) ?? [])
        .map((past) => rateOf(platform, past, metric)?.rate)
        .filter((rate): rate is number => rate !== undefined);
      const others = peerRates.filter((_, peerIndex) => peerIndex !== index);
      const baseline = historyBaseline(pastRates) ?? peerBaseline(others);
      if (!baseline) return;

      const score = (current.rate - baseline.typical) / baseline.spread;
      const impact = (current.rate - baseline.typical) * current.base;
      const threshold = baseline.basis === "history" ? HISTORY_SCORE : PEER_SCORE;
      if (score < threshold || impact < MIN_IMPACT) return;

      const acceptedRate = accepted.get(key + "|" + metric);
      if (acceptedRate !== undefined && current.rate <= acceptedRate + baseline.spread) {
        muted += 1;
        return;
      }

      alerts.push({
        id: key + "|" + metric,
        branch: branch.branch,
        branchKey: key,
        metric,
        rate: current.rate,
        typical: baseline.typical,
        base: current.base,
        impact,
        basis: baseline.basis,
        samples: baseline.samples,
        score,
      });
    });
  }

  // The total repeats its parts: show it only for branches with no alert on a single charge.
  const withPartAlert = new Set(alerts.filter((alert) => alert.metric !== "total_cost").map((alert) => alert.branchKey));
  const shown = alerts
    .filter((alert) => alert.metric !== "total_cost" || !withPartAlert.has(alert.branchKey))
    .sort((a, b) => b.impact - a.impact);

  return { alerts: shown, historyPeriods: history.length, checkedBranches: checked.length, muted };
}
