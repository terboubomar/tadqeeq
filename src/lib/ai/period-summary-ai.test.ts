import { describe, expect, test } from "bun:test";

import type { AuditException } from "@/lib/exceptions";
import type { StoredPeriod } from "@/lib/periods";

import {
  buildPeriodSummaryAiPacket,
  periodSummaryAiExplanationSchema,
} from "./period-summary-ai";

describe("Tadqeeq AI period summary packet", () => {
  test("keeps deterministic management metrics while excluding private identifiers and workflow notes", () => {
    const period = {
      id: "period-secret-id",
      label: "Client confidential period label",
      platform: "jahez",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      created_at: "2026-09-01T00:00:00Z",
      summary: {
        orders: 100,
        branchCount: 2,
        grossSales: 10000,
        netSales: 7600,
        commission: 1800,
        commissionPct: 18,
        totalCharges: 2400,
        jahezPaymentFeesExVat: 150,
        jahezSettlementVariance: 20,
        jahezCompensationNetImpact: 75,
        jahezCompensationDuplicateCandidates: 1,
        jahezCompensationDuplicateAmount: 43,
      },
      branches: [
        {
          branch: "Branch A",
          branchId: "branch-secret-id",
          orders: 60,
          grossSales: 6000,
          netSales: 4500,
          totalCharges: 1500,
          commissionPct: 18,
        },
        {
          branch: "Branch B",
          branchId: "another-secret-id",
          orders: 40,
          grossSales: 4000,
          netSales: 3100,
          totalCharges: 900,
          commissionPct: 18,
        },
      ],
      daily: [],
      invoice: {
        exceptionWorkflow: {
          hidden: {
            status: "reviewing",
            note: "Private internal note",
          },
        },
      },
    } as unknown as StoredPeriod;

    const exceptions: AuditException[] = [
      {
        id: "ex_secret",
        periodId: "period-secret-id",
        periodLabel: "Client confidential period label",
        platform: "jahez",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        sourceLevel: "branch",
        branch: "Branch A",
        branchId: "branch-secret-id",
        category: "compensation",
        categoryLabel: "التعويضات",
        label: "اشتباه تكرار تعويض · طلب 123",
        difference: 43,
        tolerance: 0,
        reviewAmount: 43,
        potentialRecovery: 43,
        evidence: "data",
        severity: "medium",
        status: "reviewing",
        note: "Private exception note",
        recoveredAmount: 0,
        rollup: false,
      },
    ];

    const packet = buildPeriodSummaryAiPacket(period, exceptions);
    const serialized = JSON.stringify(packet);

    expect(packet.metrics.grossSales).toBe(10000);
    expect(packet.exceptions.potentialRecovery).toBe(43);
    expect(packet.topExceptions[0]?.potentialRecovery).toBe(43);
    expect(packet.topBranches[0]?.branch).toBe("Branch A");
    expect(packet.platformMetrics.compensationDuplicateAmount).toBe(43);

    expect(serialized).not.toContain("period-secret-id");
    expect(serialized).not.toContain("branch-secret-id");
    expect(serialized).not.toContain("another-secret-id");
    expect(serialized).not.toContain("Client confidential period label");
    expect(serialized).not.toContain("Private internal note");
    expect(serialized).not.toContain("Private exception note");
  });

  test("validates the structured period-summary contract", () => {
    const explanation = periodSummaryAiExplanationSchema.parse({
      executiveSummary: "الفترة تحتوي على عدد محدود من الاستثناءات التي تحتاج مراجعة.",
      financialReadout: "المبالغ المعروضة مصدرها محرك Tadqeeq الحتمي.",
      attentionItems: ["راجع الاستثناء الأعلى من حيث المبلغ محل المراجعة."],
      positiveSignals: ["لا توجد استثناءات حرجة في الحزمة."],
      recommendedActions: ["تحقق من المستند المصدر قبل أي مطالبة."],
      limitations: ["التحليل يخص فترة واحدة ولا يمثل اتجاهاً زمنياً."],
      confidence: "high",
    });

    expect(explanation.confidence).toBe("high");
    expect(explanation.recommendedActions).toHaveLength(1);
  });
});
