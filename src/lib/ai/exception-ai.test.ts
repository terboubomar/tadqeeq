import { describe, expect, test } from "bun:test";

import type { AuditException, ExceptionEvidenceTrail } from "@/lib/exceptions";

import {
  buildExceptionAiPacket,
  exceptionAiExplanationSchema,
} from "./exception-ai";

describe("Tadqeeq AI exception packet", () => {
  test("sends only structured audit evidence and excludes workflow/private identifiers", () => {
    const item: AuditException = {
      id: "ex_secret",
      periodId: "period-secret",
      periodLabel: "Client confidential label",
      platform: "jahez",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      sourceLevel: "branch",
      branch: "Branch A",
      branchId: "branch-secret-id",
      category: "compensation",
      categoryLabel: "التعويضات",
      label: "اشتباه تكرار تعويض · طلب 123",
      computed: 43,
      invoiced: 86,
      difference: 43,
      tolerance: 0,
      reviewAmount: 43,
      potentialRecovery: 43,
      evidence: "data",
      severity: "medium",
      status: "reviewing",
      note: "Internal private workflow note",
      recoveredAmount: 0,
      rollup: false,
      hint: "Needs human review",
    };

    const evidence: ExceptionEvidenceTrail = {
      reason: "وجد Tadqeeq معاملة إضافية مطابقة.",
      formula: "مراجعة التعويض مقابل الطلب المصدر.",
      evidenceLabel: "بيانات مستقلة",
      calculatedSources: [
        { label: "رقم الطلب", source: "Jahez Compensation Report", value: "123" },
        { label: "المبلغ", source: "Jahez Compensation Report", value: 43 },
      ],
      platformSources: [
        { label: "مطابقة الطلب", source: "Jahez Restaurant Financial Report", value: "مطابق" },
      ],
      conclusion: "يحتاج مراجعة بشرية قبل الاعتراض.",
      workflow: [
        {
          at: "2026-09-20T10:00:00Z",
          status: "reviewing",
          note: "Private workflow history",
        },
      ],
    };

    const packet = buildExceptionAiPacket(item, evidence);
    const serialized = JSON.stringify(packet);

    expect(packet.figures.potentialRecovery).toBe(43);
    expect(packet.evidenceType).toBe("بيانات مستقلة");
    expect(serialized).not.toContain("period-secret");
    expect(serialized).not.toContain("branch-secret-id");
    expect(serialized).not.toContain("Client confidential label");
    expect(serialized).not.toContain("Internal private workflow note");
    expect(serialized).not.toContain("Private workflow history");
  });

  test("validates the structured explanation contract", () => {
    const explanation = exceptionAiExplanationSchema.parse({
      summary: "يوجد استثناء يحتاج مراجعة.",
      whyItMatters: "قد يؤثر على صافي التسوية.",
      financialInterpretation: "المبلغ محل المراجعة ليس استرداداً مؤكداً.",
      evidence: ["المصدر الأول", "المصدر الثاني"],
      nextSteps: ["راجع المستند المصدر", "وثّق نتيجة المراجعة"],
      limitations: ["لا توجد بيانات عقد ضمن هذا الاستثناء."],
      confidence: "medium",
    });

    expect(explanation.confidence).toBe("medium");
    expect(explanation.nextSteps).toHaveLength(2);
  });
});
