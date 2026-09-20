import { describe, expect, test } from "bun:test";

import type { PeriodComparison } from "@/lib/period-intelligence";

import {
  buildPeriodIntelligenceAiPacket,
  periodIntelligenceAiSchema,
} from "./period-intelligence-ai";

describe("Tadqeeq AI Period Intelligence packet", () => {
  test("contains only deterministic comparison data and no internal period or branch identifiers", () => {
    const comparison: PeriodComparison = {
      platform: "jahez",
      currentPeriod: { start: "2026-09-01", end: "2026-09-30", days: 30 },
      previousPeriod: { start: "2026-08-01", end: "2026-08-31", days: 31 },
      comparableDuration: false,
      metrics: [
        {
          key: "gross_sales",
          label: "المبيعات الإجمالية",
          unit: "sar",
          current: 12000,
          previous: 10000,
          delta: 2000,
          relativeChange: 0.2,
        },
        {
          key: "commission_rate",
          label: "نسبة العمولة",
          unit: "ratio",
          current: 0.19,
          previous: 0.18,
          delta: 0.01,
          relativeChange: 0.0555555556,
          percentagePointChange: 1,
        },
      ],
      platformMetrics: [],
      exceptions: {
        current: {
          total: 3,
          openCount: 2,
          criticalCount: 0,
          underReview: 500,
          potentialRecovery: 200,
          recovered: 0,
        },
        previous: {
          total: 1,
          openCount: 1,
          criticalCount: 0,
          underReview: 100,
          potentialRecovery: 50,
          recovered: 0,
        },
        openCountDelta: 1,
        underReviewDelta: 400,
        potentialRecoveryDelta: 150,
        recoveredDelta: 0,
      },
      exceptionCategories: [
        {
          category: "التعويضات",
          currentCount: 2,
          previousCount: 1,
          countDelta: 1,
          currentReviewAmount: 500,
          previousReviewAmount: 100,
          reviewAmountDelta: 400,
          currentPotentialRecovery: 200,
          previousPotentialRecovery: 50,
          potentialRecoveryDelta: 150,
        },
      ],
      branchMovements: [
        {
          branch: "Branch A",
          status: "existing",
          current: {
            orders: 70,
            grossSales: 7000,
            netSales: 5200,
            platformCost: 1900,
            platformCostRate: 1900 / 7000,
            commissionPct: 0.19,
          },
          previous: {
            orders: 60,
            grossSales: 6000,
            netSales: 4500,
            platformCost: 1500,
            platformCostRate: 0.25,
            commissionPct: 0.18,
          },
          ordersDelta: 10,
          grossSalesDelta: 1000,
          platformCostDelta: 400,
          platformCostRateDelta: 1900 / 7000 - 0.25,
          commissionPctDelta: 0.01,
        },
      ],
      warnings: ["طول الفترتين مختلف."],
    };

    const packet = buildPeriodIntelligenceAiPacket(comparison);
    const serialized = JSON.stringify(packet);

    expect(packet.metrics[1]?.deltaPercentagePoints).toBeCloseTo(1, 8);
    expect(packet.metrics[0]?.relativeChangePct).toBeCloseTo(20, 8);
    expect(packet.branchMovements[0]?.platformCostDelta).toBe(400);

    expect(serialized).not.toContain("period-secret");
    expect(serialized).not.toContain("branch-secret-id");
    expect(serialized).not.toContain("workflow");
    expect(serialized).not.toContain("note");
  });

  test("validates the structured Period Intelligence response", () => {
    const explanation = periodIntelligenceAiSchema.parse({
      executiveSummary: "ارتفعت المبيعات والتكلفة مع زيادة محدودة في نسبة العمولة.",
      keyChanges: ["المبيعات أعلى من الفترة السابقة.", "نسبة العمولة ارتفعت بنقطة مئوية."],
      riskSignals: ["المبلغ محل المراجعة ارتفع."],
      improvements: ["لا توجد استثناءات حرجة."],
      recommendedActions: ["راجع الفروع ذات أكبر زيادة في تكلفة المنصة."],
      limitations: ["طول الفترتين مختلف، لذلك تحتاج القيم المطلقة إلى تفسير حذر."],
      confidence: "medium",
    });

    expect(explanation.confidence).toBe("medium");
    expect(explanation.keyChanges).toHaveLength(2);
  });
});
