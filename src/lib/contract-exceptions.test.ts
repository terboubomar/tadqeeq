import { describe, expect, test } from "bun:test";

import type { ContractComplianceSection } from "./contract-compliance";
import { buildContractExceptions } from "./exceptions";
import type { StoredPeriod } from "./periods";

const period = {
  id: "p1",
  label: "Keeta Sept",
  platform: "keeta",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  branches: [],
  invoice: { exceptionWorkflow: {} },
} as unknown as StoredPeriod;

function section(input: Partial<ContractComplianceSection>): ContractComplianceSection {
  return {
    ruleType: "free_delivery_funding",
    ruleKey: "free_delivery_funding",
    evidence: "contract_plus_platform_data",
    evidenceNote: "ملاحظة",
    claimable: true,
    rows: [
      { branch: "Malqa", contractRatePct: 0, observedRatePct: null, baseAmount: 10, expectedAmount: 90, observedAmount: 100, varianceAmount: 10, status: "overcharged", ruleId: "r" },
      { branch: "Laban", contractRatePct: 0, observedRatePct: null, baseAmount: 10, expectedAmount: 90, observedAmount: 60, varianceAmount: 0, status: "matched", ruleId: "r" },
    ],
    missingRuleBranches: [],
    unsupportedRuleBranches: [],
    missingEvidenceBranches: [],
    totals: { baseAmount: 20, expectedAmount: 180, observedAmount: 160, varianceAmount: 10, overchargedAmount: 10, underchargedAmount: 0, complete: true },
    ...input,
  };
}

describe("buildContractExceptions", () => {
  test("one exception per contract term with the amount above the contract to claim", () => {
    const [item, ...rest] = buildContractExceptions(period, [{ contractId: "c1", contractName: "كيتا 2025", sections: [section({})] }]);
    expect(rest).toHaveLength(0);
    expect(item).toMatchObject({
      category: "delivery_campaign",
      label: "دعم التوصيل أعلى من الحد في العقد · كيتا 2025",
      computed: 90,
      invoiced: 100,
      reviewAmount: 10,
      potentialRecovery: 10,
      evidence: "contract",
      status: "new",
    });
  });

  test("indicator sections and sections within the contract raise nothing", () => {
    expect(buildContractExceptions(period, [{ contractId: "c1", contractName: "x", sections: [section({ claimable: false })] }])).toEqual([]);
    expect(
      buildContractExceptions(period, [
        { contractId: "c1", contractName: "x", sections: [section({ rows: [section({}).rows[1]!] })] },
      ]),
    ).toEqual([]);
  });

  test("keeps the status saved for it", () => {
    const [first] = buildContractExceptions(period, [{ contractId: "c1", contractName: "x", sections: [section({})] }]);
    const saved = { ...period, invoice: { exceptionWorkflow: { [first!.id]: { status: "contacted" } } } } as unknown as StoredPeriod;
    expect(buildContractExceptions(saved, [{ contractId: "c1", contractName: "x", sections: [section({})] }])[0]?.status).toBe("contacted");
  });
});
