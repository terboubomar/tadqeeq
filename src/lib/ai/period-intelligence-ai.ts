import { z } from "zod";

import type { MetricComparison, PeriodComparison } from "@/lib/period-intelligence";

export const periodIntelligenceAiSchema = z.object({
  executiveSummary: z.string().min(1).max(1200),
  keyChanges: z.array(z.string().min(1).max(500)).min(1).max(6),
  riskSignals: z.array(z.string().min(1).max(500)).max(6),
  improvements: z.array(z.string().min(1).max(500)).max(5),
  recommendedActions: z.array(z.string().min(1).max(500)).min(1).max(5),
  limitations: z.array(z.string().min(1).max(500)).max(5),
  confidence: z.enum(["high", "medium", "low"]),
});

export type PeriodIntelligenceAiExplanation = z.infer<typeof periodIntelligenceAiSchema>;

export interface PeriodIntelligenceAiResult {
  explanation: PeriodIntelligenceAiExplanation;
  model: string;
  promptVersion: string;
}

export interface PeriodIntelligenceAiPacket {
  platform: PeriodComparison["platform"];
  currentPeriod: PeriodComparison["currentPeriod"];
  previousPeriod: PeriodComparison["previousPeriod"];
  comparableDuration: boolean;
  metrics: Array<Record<string, number | string | null>>;
  platformMetrics: Array<Record<string, number | string | null>>;
  exceptions: PeriodComparison["exceptions"];
  categoryMovements: PeriodComparison["exceptionCategories"];
  branchMovements: Array<{
    branch: string;
    status: "existing" | "new" | "removed";
    ordersDelta: number;
    grossSalesDelta: number;
    platformCostDelta: number;
    platformCostRateDeltaPercentagePoints: number;
    commissionRateDeltaPercentagePoints: number;
  }>;
  warnings: string[];
}

function aiMetric(metric: MetricComparison): Record<string, number | string | null> {
  if (metric.unit === "ratio") {
    return {
      key: metric.key,
      label: metric.label,
      unit: "percent",
      currentPct: metric.current * 100,
      previousPct: metric.previous * 100,
      deltaPercentagePoints: metric.percentagePointChange ?? metric.delta * 100,
      relativeChangePct:
        metric.relativeChange === null ? null : metric.relativeChange * 100,
    };
  }

  return {
    key: metric.key,
    label: metric.label,
    unit: metric.unit,
    current: metric.current,
    previous: metric.previous,
    delta: metric.delta,
    relativeChangePct:
      metric.relativeChange === null ? null : metric.relativeChange * 100,
  };
}

export function buildPeriodIntelligenceAiPacket(
  comparison: PeriodComparison,
): PeriodIntelligenceAiPacket {
  return {
    platform: comparison.platform,
    currentPeriod: comparison.currentPeriod,
    previousPeriod: comparison.previousPeriod,
    comparableDuration: comparison.comparableDuration,
    metrics: comparison.metrics.map(aiMetric),
    platformMetrics: comparison.platformMetrics.map(aiMetric),
    exceptions: comparison.exceptions,
    categoryMovements: comparison.exceptionCategories.slice(0, 6),
    branchMovements: comparison.branchMovements.slice(0, 6).map((branch) => ({
      branch: branch.branch,
      status: branch.status,
      ordersDelta: branch.ordersDelta,
      grossSalesDelta: branch.grossSalesDelta,
      platformCostDelta: branch.platformCostDelta,
      platformCostRateDeltaPercentagePoints: branch.platformCostRateDelta * 100,
      commissionRateDeltaPercentagePoints: branch.commissionPctDelta * 100,
    })),
    warnings: comparison.warnings,
  };
}
