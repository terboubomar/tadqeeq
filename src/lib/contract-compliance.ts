import type { BranchRow } from "./analysis/types";
import { HUNGERSTATION_TOLERANCES } from "./analysis/tolerances";
import { roundMoney } from "./analysis/parse";
import type { ContractRuleRecord } from "./contract-rulebook";
import { normalizeContractScopeKey, resolveContractRulePrecedence } from "./contract-rulebook-resolver";
import type { StoredPeriod } from "./periods";

export interface ContractComplianceRow {
  branch: string;
  contractRatePct: number;
  observedRatePct: number;
  salesBase: number;
  expectedAmount: number;
  observedAmount: number;
  varianceAmount: number;
  status: "matched" | "overcharged" | "undercharged";
  ruleId: string;
}

export interface HungerStationContractCompliance {
  platform: "hungerstation";
  ruleKey: "commission_rate";
  versionId: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  periodId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  rows: ContractComplianceRow[];
  missingRuleBranches: string[];
  totals: {
    salesBase: number;
    expectedAmount: number;
    observedAmount: number;
    varianceAmount: number;
    overchargedAmount: number;
    underchargedAmount: number;
  };
}

function commissionRuleForBranch(
  rules: ContractRuleRecord[],
  branch: string,
): ContractRuleRecord | null {
  const candidates = rules.filter(
    (rule) =>
      rule.ruleType === "commission_rate" &&
      normalizeContractScopeKey(rule.ruleKey) === "commission_rate" &&
      rule.valueKind === "percentage" &&
      rule.numericValue != null,
  );
  return resolveContractRulePrecedence(candidates, branch)[0] ?? null;
}

function statusForVariance(value: number): ContractComplianceRow["status"] {
  if (Math.abs(value) <= HUNGERSTATION_TOLERANCES.commission) return "matched";
  return value > 0 ? "overcharged" : "undercharged";
}

export function evaluateHungerStationCommissionCompliance(input: {
  period: StoredPeriod;
  rules: ContractRuleRecord[];
  version: {
    id: string;
    versionNumber: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  };
}): HungerStationContractCompliance {
  const { period, rules, version } = input;
  if (period.platform !== "hungerstation") {
    throw new Error("HungerStation contract compliance requires a HungerStation audit period.");
  }
  if (!period.period_start || !period.period_end) {
    throw new Error("Audit period dates are required for contract compliance.");
  }

  const rows: ContractComplianceRow[] = [];
  const missingRuleBranches: string[] = [];

  for (const branch of period.branches ?? []) {
    if (branch.branchAuditStatus === "invoice_only" || branch.netSales <= 0) continue;
    const rule = commissionRuleForBranch(rules, branch.branch);
    if (!rule || rule.numericValue == null) {
      missingRuleBranches.push(branch.branch);
      continue;
    }

    const expectedAmount = roundMoney(branch.netSales * (rule.numericValue / 100));
    const observedAmount = roundMoney(branch.commission);
    const varianceAmount = roundMoney(observedAmount - expectedAmount);
    const observedRatePct =
      branch.netSales > 0 ? roundMoney((observedAmount / branch.netSales) * 100, 4) : 0;

    rows.push({
      branch: branch.branch,
      contractRatePct: rule.numericValue,
      observedRatePct,
      salesBase: roundMoney(branch.netSales),
      expectedAmount,
      observedAmount,
      varianceAmount,
      status: statusForVariance(varianceAmount),
      ruleId: rule.id,
    });
  }

  const total = (pick: (row: ContractComplianceRow) => number) =>
    roundMoney(rows.reduce((sum, row) => sum + pick(row), 0));

  return {
    platform: "hungerstation",
    ruleKey: "commission_rate",
    versionId: version.id,
    versionNumber: version.versionNumber,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo,
    periodId: period.id,
    periodLabel: period.label,
    periodStart: period.period_start,
    periodEnd: period.period_end,
    rows,
    missingRuleBranches,
    totals: {
      salesBase: total((row) => row.salesBase),
      expectedAmount: total((row) => row.expectedAmount),
      observedAmount: total((row) => row.observedAmount),
      varianceAmount: total((row) => row.varianceAmount),
      overchargedAmount: total((row) => Math.max(0, row.varianceAmount)),
      underchargedAmount: total((row) => Math.max(0, -row.varianceAmount)),
    },
  };
}
