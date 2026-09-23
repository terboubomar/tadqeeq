import { describe, expect, test } from "bun:test";

import type { AuditException } from "./exceptions";
import {
  recoveryOutstanding,
  summarizeRecovery,
} from "./recovery";

function item(input: Partial<AuditException>): AuditException {
  return {
    id: input.id ?? "ex_1",
    code: "TEST",
    periodId: "period-1",
    periodLabel: "September",
    platform: "hungerstation",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    sourceLevel: "summary",
    category: "commission",
    categoryLabel: "العمولة",
    label: "فرق عمولة",
    computed: 100,
    invoiced: 120,
    difference: 20,
    tolerance: 0.05,
    reviewAmount: 20,
    potentialRecovery: 20,
    evidence: "data",
    severity: "low",
    status: "new",
    recoveredAmount: 0,
    rollup: false,
    ...input,
  };
}

describe("recovery center model", () => {
  test("outstanding recovery never becomes negative", () => {
    expect(recoveryOutstanding(item({ potentialRecovery: 20, recoveredAmount: 5 }))).toBe(15);
    expect(recoveryOutstanding(item({ potentialRecovery: 20, recoveredAmount: 25 }))).toBe(0);
  });

  test("summarizes active, disputed, potential, recovered and outstanding values", () => {
    const result = summarizeRecovery([
      item({ id: "a", status: "new", potentialRecovery: 100, recoveredAmount: 0 }),
      item({ id: "b", status: "disputed", potentialRecovery: 80, recoveredAmount: 20 }),
      item({ id: "c", status: "recovered", potentialRecovery: 40, recoveredAmount: 40 }),
      item({ id: "d", status: "closed", potentialRecovery: 30, recoveredAmount: 0 }),
    ]);

    expect(result.caseCount).toBe(4);
    expect(result.openCount).toBe(2);
    expect(result.disputedCount).toBe(1);
    expect(result.potentialRecovery).toBe(250);
    expect(result.recovered).toBe(60);
    expect(result.outstanding).toBe(160);
  });
});
