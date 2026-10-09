import { z } from "zod";

import {
  buildPeriodExceptions,
  summarizeExceptions,
  type AuditException,
} from "@/lib/exceptions";
import type { StoredPeriod } from "@/lib/periods";

export const periodSummaryAiExplanationSchema = z.object({
  executiveSummary: z.string().min(1).max(1200),
  financialReadout: z.string().min(1).max(1200),
  attentionItems: z.array(z.string().min(1).max(500)).min(1).max(6),
  positiveSignals: z.array(z.string().min(1).max(500)).max(5),
  recommendedActions: z.array(z.string().min(1).max(500)).min(1).max(5),
  limitations: z.array(z.string().min(1).max(500)).max(4),
  confidence: z.enum(["high", "medium", "low"]),
});

export type PeriodSummaryAiExplanation = z.infer<typeof periodSummaryAiExplanationSchema>;

export interface PeriodSummaryAiResult {
  explanation: PeriodSummaryAiExplanation;
  model: string;
  promptVersion: string;
}

export interface PeriodSummaryAiPacket {
  platform: StoredPeriod["platform"];
  period: {
    start: string | null;
    end: string | null;
  };
  metrics: {
    orders: number;
    branchCount: number;
    grossSales: number;
    netSales: number;
    commission: number;
    commissionPct: number;
    totalCharges: number;
  };
  exceptions: ReturnType<typeof summarizeExceptions>;
  severityCounts: Record<string, number>;
  categoryExposure: Array<{
    category: string;
    count: number;
    reviewAmount: number;
    potentialRecovery: number;
  }>;
  topExceptions: Array<{
    category: string;
    label: string;
    branch?: string;
    severity: AuditException["severity"];
    evidence?: AuditException["evidence"];
    difference?: number;
    reviewAmount: number;
    potentialRecovery: number;
  }>;
  topBranches: Array<{
    branch: string;
    orders: number;
    grossSales: number;
    netSales: number;
    platformCost: number;
    commissionPct: number;
  }>;
  platformMetrics: Record<string, number>;
}

function finite(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function platformSpecificMetrics(period: StoredPeriod): Record<string, number> {
  const s = period.summary;
  const values: Record<string, number | undefined> =
    period.platform === "hungerstation"
      ? {
          cardPaymentFeesAudited: finite(
            (s.bankFeeSuccess ?? 0) + (s.bankFeeRefunded ?? 0),
          ),
          walletPaymentFeeInvoice: finite(s.walletFee),
          totalCollections: finite(s.totalCollections),
          compensation: finite(s.compensation),
          invoiceOnlyExtras: finite(s.invoiceOnlyExtras),
        }
      : period.platform === "keeta"
        ? {
            bankFeesExVat: finite(s.keetaBankFeesExVat),
            deliveryCampaignExVat: finite(s.keetaDeliveryCampaignExVat),
            settlementVariance: finite(s.keetaExcelPayableVariance ?? s.keetaSettlementVariance),
            officialPayable: finite(s.keetaExcelPayable ?? s.keetaSourcePayable),
            // Charges ÷ sales excluding VAT; the shared platform_cost_pct (÷ gross sales) is in the headline.
            platformCostPctOfNet: finite(s.keetaPlatformCostPct),
          }
        : {
            paymentFeesExVat: finite(s.jahezPaymentFeesExVat),
            deliveryOfferInclVat: finite(s.jahezDeliveryOfferInclVat),
            settlementVariance: finite(s.jahezSettlementVariance),
            compensationNetImpact: finite(s.jahezCompensationNetImpact),
            compensationDuplicateCandidates: finite(s.jahezCompensationDuplicateCandidates),
            compensationDuplicateAmount: finite(s.jahezCompensationDuplicateAmount),
          };

  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, number] => entry[1] !== undefined),
  );
}

export function buildPeriodSummaryAiPacket(
  period: StoredPeriod,
  providedExceptions?: AuditException[],
): PeriodSummaryAiPacket {
  const exceptions = providedExceptions ?? buildPeriodExceptions(period);
  const exceptionSummary = summarizeExceptions(exceptions);
  const open = exceptions.filter(
    (item) => item.status !== "closed" && item.status !== "recovered",
  );

  const severityCounts = open.reduce<Record<string, number>>((acc, item) => {
    acc[item.severity] = (acc[item.severity] ?? 0) + 1;
    return acc;
  }, {});

  const categoryMap = new Map<
    string,
    { category: string; count: number; reviewAmount: number; potentialRecovery: number }
  >();
  for (const item of open) {
    const current = categoryMap.get(item.categoryLabel) ?? {
      category: item.categoryLabel,
      count: 0,
      reviewAmount: 0,
      potentialRecovery: 0,
    };
    current.count += 1;
    current.reviewAmount += item.reviewAmount;
    current.potentialRecovery += item.potentialRecovery;
    categoryMap.set(item.categoryLabel, current);
  }

  const categoryExposure = [...categoryMap.values()]
    .sort(
      (left, right) =>
        right.reviewAmount - left.reviewAmount ||
        right.potentialRecovery - left.potentialRecovery ||
        right.count - left.count,
    )
    .slice(0, 6);

  const topExceptions = open.slice(0, 6).map((item) => ({
    category: item.categoryLabel,
    label: item.label,
    ...(item.branch ? { branch: item.branch } : {}),
    severity: item.severity,
    ...(item.evidence ? { evidence: item.evidence } : {}),
    ...(item.difference !== undefined ? { difference: item.difference } : {}),
    reviewAmount: item.reviewAmount,
    potentialRecovery: item.potentialRecovery,
  }));

  const topBranches = (period.branches ?? [])
    .map((branch) => ({
      branch: branch.branch,
      orders: branch.orders,
      grossSales: branch.grossSales,
      netSales: branch.netSales,
      platformCost:
        period.platform === "keeta"
          ? (branch.keetaTotalCostExVat ?? branch.totalCharges)
          : branch.totalCharges,
      commissionPct: branch.commissionPct,
    }))
    .sort((left, right) => right.platformCost - left.platformCost)
    .slice(0, 5);

  return {
    platform: period.platform,
    period: {
      start: period.period_start,
      end: period.period_end,
    },
    metrics: {
      orders: period.summary.orders,
      branchCount: period.summary.branchCount,
      grossSales: period.summary.grossSales,
      netSales: period.summary.netSales,
      commission: period.summary.commission,
      commissionPct: period.summary.commissionPct,
      totalCharges: period.summary.totalCharges,
    },
    exceptions: exceptionSummary,
    severityCounts,
    categoryExposure,
    topExceptions,
    topBranches,
    platformMetrics: platformSpecificMetrics(period),
  };
}
