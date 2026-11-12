import { buildMarketplaceChargeMap, type MarketplaceChargeLine } from "./charges-mapper";
import type { StoredPeriod } from "./periods";
import { hungerStationAdvertisingExVat, periodPlatformCharges, platformCostPct, salesExVat } from "./reporting-metrics";

/**
 * «كاشِف» in the same terms as the dashboard and the branch report: the fee-map lines that make up the shared
 * platform cost (excluding VAT, advertising included), the restaurant-funded discounts set apart, and the other
 * money movements that are not platform cost. Display only: every amount is a fee-map line the audit saved.
 */
export interface PlatformCostMap {
  /** The shared platform cost (periodPlatformCharges): the headline the whole app shows. */
  total: number;
  /** % of sales without VAT, the same formula as the dashboard; null when sales are unknown. */
  costPct: number | null;
  /** Platform cost per order; null without orders. */
  costPerOrder: number | null;
  /** The lines inside the total, largest first. */
  lines: MarketplaceChargeLine[];
  /** Lines inside the total that the fee map could not classify. */
  unmapped: { count: number; amount: number };
  /** Discounts the restaurant funded itself: shown, not part of the total. */
  merchantFunded: MarketplaceChargeLine[];
  /** Other money movements the platform reports (VAT, refunds, platform-funded discounts): not part of the total. */
  other: MarketplaceChargeLine[];
  /** total − the sum of the lines; 0 when the map closes on the total. */
  residual: number;
}

/** Fee-map lines that are discounts the restaurant funds (MERCHANT_FUNDED_DISCOUNTS in reporting-metrics). */
const MERCHANT_FUNDED_LINES = new Set(["keeta-product-campaign", "hs-restaurant-food-discount"]);

const round2 = (value: number) => Math.round(value * 100) / 100 + 0;

export function platformCostMap(period: StoredPeriod): PlatformCostMap {
  const map = buildMarketplaceChargeMap(period);
  const lines = map.lines.filter((line) => line.scope === "audit_total" && !MERCHANT_FUNDED_LINES.has(line.id));
  // HungerStation's CPC invoice is part of platform cost at its amount without VAT.
  const ads = period.platform === "hungerstation" ? (hungerStationAdvertisingExVat(period) ?? 0) : 0;
  const cpc = map.lines.find((line) => line.id === "hs-cpc");
  if (cpc && Math.abs(ads) > 0.005) {
    lines.push({ ...cpc, amount: round2(ads), scope: "audit_total", note: undefined });
  }
  lines.sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount));

  const total = periodPlatformCharges(period) ?? map.auditTotalCharges;
  const unmappedLines = lines.filter((line) => !line.mapped);
  const orders = period.summary?.orders ?? 0;
  return {
    total,
    costPct: platformCostPct(total, salesExVat(period.platform, period.summary)),
    costPerOrder: orders > 0 ? total / orders : null,
    lines,
    unmapped: { count: unmappedLines.length, amount: round2(unmappedLines.reduce((sum, line) => sum + Math.abs(line.amount), 0)) },
    merchantFunded: map.lines.filter((line) => MERCHANT_FUNDED_LINES.has(line.id) && Math.abs(line.amount) > 0.005),
    other: map.lines.filter(
      (line) => line.scope === "outside_audit_total" && line.id !== "hs-cpc" && !MERCHANT_FUNDED_LINES.has(line.id) && Math.abs(line.amount) > 0.005,
    ),
    residual: round2(total - lines.reduce((sum, line) => sum + line.amount, 0)),
  };
}

/** The same platform's latest period that ended before this one, for "compared with last month". */
export function previousPeriod(period: StoredPeriod, periods: readonly StoredPeriod[]): StoredPeriod | null {
  const end = period.period_end ?? "";
  return (
    periods
      .filter((other) => other.id !== period.id && other.platform === period.platform && !other.superseded_by && (other.period_end ?? "") < end)
      .sort((left, right) => (right.period_end ?? "").localeCompare(left.period_end ?? ""))[0] ?? null
  );
}
