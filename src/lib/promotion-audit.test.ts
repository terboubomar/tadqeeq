import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "./periods";
import {
  buildPromotionCostSuggestions,
  calculatePromotionAudit,
} from "./promotion-audit";

function period(): StoredPeriod {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    label: "September",
    platform: "hungerstation",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    created_at: "2026-09-30T00:00:00.000Z",
    engine_version: "1.4.0",
    format_ids: [],
    summary: {
      platform: "hungerstation",
      orders: 100,
      grossSales: 54000,
      netSales: 46956.52,
      commission: 6480,
      commissionPct: 0.138,
      ccSuccess: 40000,
      ccRejected: 0,
      walletAmount: 0,
      riderWallet: 0,
      walletFee: 0,
      rdfCampaigns: 1200,
      compensation: 0,
      jokerFees: 0,
      hsFoodDiscount: 3000,
      rewardsDiscount: 500,
      restaurantFoodDiscount: 7200,
      totalFoodDiscount: 10200,
      partialRefund: 0,
      fulfillmentMods: 0,
      approvedRefunds: 0,
      waitingTimeFees: 0,
      bankRate: 0.02,
      bankRateSource: "manual",
      bankFeeSuccess: 800,
      bankFeeRefunded: 0,
      invoiceOnlyExtras: 0,
      totalCharges: 8480,
      branchCount: 1,
      statusCounts: {},
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    },
    branches: [],
    daily: [],
    invoice: {
      lines: [],
      cpc: 4500,
    },
  };
}

describe("promotion audit", () => {
  test("calculates incremental economics without treating platform funding as merchant cost", () => {
    const result = calculatePromotionAudit({
      name: "September Campaign",
      campaignRevenue: 54000,
      organicBaseline: 18000,
      restaurantFundedDiscount: 7200,
      platformFundedDiscount: 3500,
      unknownFundedDiscount: 0,
      advertisingSpend: 4500,
      commissionFees: 4000,
      paymentFees: 800,
      deliveryCampaignFees: 1680,
      otherMarketplaceFees: 0,
      cogsAmount: 10800,
      platformRoas: 6.4,
    });

    expect(result.incrementalRevenue).toBe(36000);
    expect(result.marketplaceFees).toBe(6480);
    expect(result.merchantEconomicCost).toBe(28980);
    expect(result.incrementalContribution).toBe(7020);
    expect(result.promotionInvestment).toBe(13380);
    expect(result.revenueRoi).toBeCloseTo(2.6906, 4);
    expect(result.profitRoi).toBeCloseTo(0.5247, 4);
    expect(result.campaignRoas).toBe(12);
    expect(result.incrementalAdRoas).toBe(8);
    expect(result.platformRoas).toBe(6.4);
    expect(result.fundingStatus).toBe("shared");
  });

  test("marks funding unknown when an unclassified promotion amount exists", () => {
    const result = calculatePromotionAudit({
      name: "Unknown funding",
      campaignRevenue: 1000,
      organicBaseline: 800,
      restaurantFundedDiscount: 0,
      platformFundedDiscount: 0,
      unknownFundedDiscount: 50,
      advertisingSpend: 0,
      commissionFees: 0,
      paymentFees: 0,
      deliveryCampaignFees: 0,
      otherMarketplaceFees: 0,
      cogsAmount: 0,
      platformRoas: null,
    });

    expect(result.fundingStatus).toBe("unknown");
    expect(result.revenueRoi).toBeNull();
    expect(result.profitRoi).toBeNull();
  });

  test("builds whole-period suggestions from verified charge-map funding", () => {
    const suggestions = buildPromotionCostSuggestions(period());

    expect(suggestions.periodRevenue).toBe(54000);
    expect(suggestions.restaurantFundedDiscount.amount).toBe(7200);
    expect(suggestions.platformFundedDiscount.amount).toBe(3500);
    expect(suggestions.advertisingSpend.amount).toBe(4500);
    expect(suggestions.commissionFees.amount).toBe(6480);
    expect(suggestions.paymentFees.amount).toBe(800);
    expect(suggestions.deliveryCampaignFees.amount).toBe(1200);
  });
});
