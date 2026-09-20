import { z } from "zod";

import type { AuditException, ExceptionEvidenceTrail } from "@/lib/exceptions";

export const exceptionAiExplanationSchema = z.object({
  summary: z.string().min(1).max(700),
  whyItMatters: z.string().min(1).max(900),
  financialInterpretation: z.string().min(1).max(900),
  evidence: z.array(z.string().min(1).max(500)).min(1).max(6),
  nextSteps: z.array(z.string().min(1).max(500)).min(1).max(5),
  limitations: z.array(z.string().min(1).max(500)).max(4),
  confidence: z.enum(["high", "medium", "low"]),
});

export type ExceptionAiExplanation = z.infer<typeof exceptionAiExplanationSchema>;

export interface ExceptionAiPacket {
  platform: AuditException["platform"];
  period: {
    start: string | null;
    end: string | null;
  };
  scope: "summary" | "branch";
  branch?: string;
  category: string;
  exception: string;
  figures: {
    computed?: number;
    platform?: number;
    difference?: number;
    tolerance: number;
    reviewAmount: number;
    potentialRecovery: number;
  };
  evidenceType: string;
  reason: string;
  formula: string;
  calculatedSources: ExceptionEvidenceTrail["calculatedSources"];
  platformSources: ExceptionEvidenceTrail["platformSources"];
  auditConclusion: string;
}

export function buildExceptionAiPacket(
  item: AuditException,
  evidence: ExceptionEvidenceTrail,
): ExceptionAiPacket {
  return {
    platform: item.platform,
    period: {
      start: item.periodStart,
      end: item.periodEnd,
    },
    scope: item.sourceLevel,
    ...(item.branch ? { branch: item.branch } : {}),
    category: item.categoryLabel,
    exception: item.label,
    figures: {
      computed: item.computed,
      platform: item.invoiced,
      difference: item.difference,
      tolerance: item.tolerance,
      reviewAmount: item.reviewAmount,
      potentialRecovery: item.potentialRecovery,
    },
    evidenceType: evidence.evidenceLabel,
    reason: evidence.reason,
    formula: evidence.formula,
    calculatedSources: evidence.calculatedSources,
    platformSources: evidence.platformSources,
    auditConclusion: evidence.conclusion,
  };
}
