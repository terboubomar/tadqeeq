import { roundMoney } from "./analysis/parse";
import {
  buildMarketplaceChargeMap,
  type MarketplaceChargeCategory,
  type MarketplaceChargeFunding,
  type MarketplaceChargeLine,
} from "./charges-mapper";
import type { StoredPeriod } from "./periods";

export type PromotionFundingStatus =
  | "restaurant"
  | "platform"
  | "shared"
  | "unknown";

export interface PromotionAuditInputs {
  name: string;
  campaignRevenue: number;
  organicBaseline: number;
  restaurantFundedDiscount: number;
  platformFundedDiscount: number;
  unknownFundedDiscount: number;
  advertisingSpend: number;
  commissionFees: number;
  paymentFees: number;
  deliveryCampaignFees: number;
  otherMarketplaceFees: number;
  cogsAmount: number;
  platformRoas: number | null;
  notes?: string | null;
}

export interface PromotionAuditResult {
  incrementalRevenue: number;
  marketplaceFees: number;
  promotionInvestment: number;
  merchantEconomicCost: number;
  incrementalContribution: number;
  revenueRoi: number | null;
  profitRoi: number | null;
  platformRoas: number | null;
  campaignRoas: number | null;
  incrementalAdRoas: number | null;
  fundingStatus: PromotionFundingStatus;
  totalDiscountFunding: number;
  restaurantFundingPct: number | null;
  platformFundingPct: number | null;
  unknownFundingAmount: number;
}

export interface PromotionSuggestedField {
  amount: number;
  lineIds: string[];
  labels: string[];
}

export interface PromotionCostSuggestions {
  periodId: string;
  platform: StoredPeriod["platform"];
  periodRevenue: number;
  restaurantFundedDiscount: PromotionSuggestedField;
  platformFundedDiscount: PromotionSuggestedField;
  unknownFundedDiscount: PromotionSuggestedField;
  advertisingSpend: PromotionSuggestedField;
  commissionFees: PromotionSuggestedField;
  paymentFees: PromotionSuggestedField;
  deliveryCampaignFees: PromotionSuggestedField;
  unmappedExposure: number;
  coveragePct: number;
}

function sum(values: number[]): number {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator + Number.EPSILON) * 10_000) / 10_000;
}

function fundingStatus(input: PromotionAuditInputs): PromotionFundingStatus {
  if (input.unknownFundedDiscount > 0) return "unknown";
  if (input.restaurantFundedDiscount > 0 && input.platformFundedDiscount > 0) {
    return "shared";
  }
  if (input.restaurantFundedDiscount > 0) return "restaurant";
  if (input.platformFundedDiscount > 0) return "platform";
  return "unknown";
}

export function calculatePromotionAudit(
  input: PromotionAuditInputs,
): PromotionAuditResult {
  const incrementalRevenue = roundMoney(
    input.campaignRevenue - input.organicBaseline,
  );
  const marketplaceFees = sum([
    input.commissionFees,
    input.paymentFees,
    input.deliveryCampaignFees,
    input.otherMarketplaceFees,
  ]);
  const promotionInvestment = sum([
    input.restaurantFundedDiscount,
    input.advertisingSpend,
    input.deliveryCampaignFees,
  ]);
  const merchantEconomicCost = sum([
    input.restaurantFundedDiscount,
    input.advertisingSpend,
    marketplaceFees,
    input.cogsAmount,
  ]);
  const incrementalContribution = roundMoney(
    incrementalRevenue - merchantEconomicCost,
  );
  const knownFunding = sum([
    input.restaurantFundedDiscount,
    input.platformFundedDiscount,
  ]);
  const totalDiscountFunding = sum([
    input.restaurantFundedDiscount,
    input.platformFundedDiscount,
    input.unknownFundedDiscount,
  ]);

  return {
    incrementalRevenue,
    marketplaceFees,
    promotionInvestment,
    merchantEconomicCost,
    incrementalContribution,
    revenueRoi: ratio(incrementalRevenue, promotionInvestment),
    profitRoi: ratio(incrementalContribution, promotionInvestment),
    platformRoas: input.platformRoas,
    campaignRoas: ratio(input.campaignRevenue, input.advertisingSpend),
    incrementalAdRoas: ratio(incrementalRevenue, input.advertisingSpend),
    fundingStatus: fundingStatus(input),
    totalDiscountFunding,
    restaurantFundingPct:
      knownFunding > 0
        ? ratio(input.restaurantFundedDiscount, knownFunding)
        : null,
    platformFundingPct:
      knownFunding > 0 ? ratio(input.platformFundedDiscount, knownFunding) : null,
    unknownFundingAmount: roundMoney(input.unknownFundedDiscount),
  };
}

function suggestedField(
  lines: MarketplaceChargeLine[],
  categories: MarketplaceChargeCategory[],
  funding: MarketplaceChargeFunding,
): PromotionSuggestedField {
  const matched = lines.filter(
    (line) =>
      line.mapped &&
      categories.includes(line.category) &&
      line.fundingSource === funding,
  );

  return {
    amount: sum(matched.map((line) => Math.abs(line.amount))),
    lineIds: matched.map((line) => line.id),
    labels: matched.map((line) => line.label),
  };
}

export function buildPromotionCostSuggestions(
  period: StoredPeriod,
): PromotionCostSuggestions {
  const map = buildMarketplaceChargeMap(period);
  const lines = map.lines;

  return {
    periodId: period.id,
    platform: period.platform,
    periodRevenue: roundMoney(period.summary.grossSales ?? 0),
    restaurantFundedDiscount: suggestedField(
      lines,
      ["promotion"],
      "merchant",
    ),
    platformFundedDiscount: suggestedField(
      lines,
      ["promotion"],
      "platform",
    ),
    unknownFundedDiscount: suggestedField(
      lines,
      ["promotion"],
      "unknown",
    ),
    advertisingSpend: suggestedField(lines, ["advertising"], "merchant"),
    commissionFees: suggestedField(lines, ["commission"], "merchant"),
    paymentFees: suggestedField(lines, ["payment_fee"], "merchant"),
    deliveryCampaignFees: suggestedField(
      lines,
      ["delivery_campaign"],
      "merchant",
    ),
    unmappedExposure: roundMoney(map.unmappedAuditAmount),
    coveragePct: map.coveragePct,
  };
}
