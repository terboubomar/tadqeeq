import type { AdsRoiResult, BudgetShift, CampaignResult } from "./analysis";

/**
 * The short "what to do now" list at the top of the ads ROI page, most valuable first:
 * stop losing campaigns (biggest loss first), move budget inside a branch (biggest weak
 * spend first), then lower the bid on thin campaigns with expensive clicks.
 */
export type AdsRoiAction =
  | { kind: "stop"; key: string; campaign: CampaignResult }
  | { kind: "shift"; key: string; shift: BudgetShift }
  | { kind: "lower_bid"; key: string; campaign: CampaignResult };

export function buildAdsRoiActions(result: AdsRoiResult): AdsRoiAction[] {
  const stops = result.campaigns
    .filter((campaign) => campaign.action === "stop")
    .sort((a, b) => a.profit - b.profit)
    .map((campaign): AdsRoiAction => ({ kind: "stop", key: "stop:" + campaign.key, campaign }));
  const stopped = new Set(stops.map((action) => (action.kind === "stop" ? action.campaign.key : "")));
  const shifts = result.shifts
    // Stopping the weak campaign already covers it.
    .filter((shift) => !stopped.has(shift.weak.key))
    .map((shift): AdsRoiAction => ({ kind: "shift", key: "shift:" + shift.restaurantId, shift }));
  const shifted = new Set(result.shifts.map((shift) => shift.weak.key));
  const bids = result.campaigns
    .filter((campaign) => campaign.action === "lower_bid" && !shifted.has(campaign.key))
    .sort((a, b) => (b.cpc ?? 0) - (a.cpc ?? 0))
    .map((campaign): AdsRoiAction => ({ kind: "lower_bid", key: "bid:" + campaign.key, campaign }));
  return [...stops, ...shifts, ...bids];
}
