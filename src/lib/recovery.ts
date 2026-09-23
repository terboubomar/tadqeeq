import {
  buildPeriodExceptions,
  type AuditException,
} from "./exceptions";
import type { StoredPeriod } from "./periods";

const RECOVERY_WORKFLOW_STATUSES = new Set([
  "contacted",
  "disputed",
  "recovered",
]);

export interface RecoverySummary {
  caseCount: number;
  openCount: number;
  disputedCount: number;
  potentialRecovery: number;
  recovered: number;
  outstanding: number;
}

export function recoveryOutstanding(item: AuditException): number {
  return Math.max(0, item.potentialRecovery - item.recoveredAmount);
}

export function buildRecoveryCandidates(
  periods: StoredPeriod[],
): AuditException[] {
  return periods
    .flatMap((period) => buildPeriodExceptions(period))
    .filter(
      (item) =>
        item.potentialRecovery > 0 ||
        item.recoveredAmount > 0 ||
        RECOVERY_WORKFLOW_STATUSES.has(item.status),
    )
    .sort((left, right) => {
      const outstandingDiff =
        recoveryOutstanding(right) - recoveryOutstanding(left);
      if (outstandingDiff !== 0) return outstandingDiff;
      return right.reviewAmount - left.reviewAmount;
    });
}

export function summarizeRecovery(
  cases: AuditException[],
): RecoverySummary {
  const active = cases.filter(
    (item) => item.status !== "closed" && item.status !== "recovered",
  );

  return {
    caseCount: cases.length,
    openCount: active.length,
    disputedCount: cases.filter((item) => item.status === "disputed").length,
    potentialRecovery: cases.reduce(
      (sum, item) => sum + item.potentialRecovery,
      0,
    ),
    recovered: cases.reduce(
      (sum, item) => sum + item.recoveredAmount,
      0,
    ),
    outstanding: active.reduce(
      (sum, item) => sum + recoveryOutstanding(item),
      0,
    ),
  };
}
