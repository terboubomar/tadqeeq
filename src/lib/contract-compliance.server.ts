import type { ContractRuleRecord, ContractRuleType, ContractValueKind, ContractFundingSource, ContractScopeType } from "./contract-rulebook";
import {
  evaluateHungerStationContractCompliance,
  evaluateKeetaContractCompliance,
  evaluateJahezContractCompliance,
  type HungerStationContractCompliance,
  type KeetaContractCompliance,
  type JahezContractCompliance,
} from "./contract-compliance";
import { versionForPeriod } from "./contract-validity";
import type { StoredPeriod } from "./periods";
import { requireWorkspacePermission } from "./server-auth.server";

export type ContractComplianceResult =
  | {
      status: "evaluated";
      /** Set when the version applied is past its end date or does not cover the whole period. */
      coverageNote: string | null;
      compliance: HungerStationContractCompliance | KeetaContractCompliance | JahezContractCompliance;
    }
  | {
      status: "not_covered";
      reason: "missing_period_dates" | "no_single_approved_version";
      message: string;
    };

export async function evaluateContractComplianceOnServer(input: {
  contractId: string;
  periodId: string;
}): Promise<ContractComplianceResult> {
  const { client, userId } = await requireWorkspacePermission("contracts.read");

  const { data: contract, error: contractError } = await client
    .from("platform_contracts")
    .select("id, platform")
    .eq("id", input.contractId)
    .eq("user_id", userId)
    .maybeSingle();

  if (contractError) throw new Error(contractError.message);
  if (!contract) throw new Error("تعذّر العثور على العقد.");
  const { data: rawPeriod, error: periodError } = await client
    .from("periods")
    .select("*")
    .eq("id", input.periodId)
    .eq("user_id", userId)
    .is("superseded_at", null)
    .maybeSingle();

  if (periodError) throw new Error(periodError.message);
  if (!rawPeriod) throw new Error("تعذّر العثور على فترة التدقيق.");
  const period = rawPeriod as unknown as StoredPeriod;

  if (period.platform !== contract.platform) {
    throw new Error("منصة فترة التدقيق لا تطابق منصة العقد.");
  }
  return evaluateForPeriod(client, userId, contract, period);
}

type ComplianceClient = Awaited<ReturnType<typeof requireWorkspacePermission>>["client"];

async function evaluateForPeriod(
  client: ComplianceClient,
  userId: string,
  contract: { id: string; platform: string },
  period: StoredPeriod,
): Promise<ContractComplianceResult> {
  const input = { contractId: contract.id };
  if (!period.period_start || !period.period_end) {
    return {
      status: "not_covered",
      reason: "missing_period_dates",
      message: "فترة التدقيق لا تحتوي على تاريخ بداية ونهاية صالحين للمطابقة التعاقدية.",
    };
  }

  // A contract stays in force until a newer version is uploaded (versionForPeriod).
  const { data: versions, error: versionError } = await client
    .from("contract_versions")
    .select("id, version_number, effective_from, effective_to")
    .eq("user_id", userId)
    .eq("contract_id", input.contractId)
    .eq("status", "approved")
    .lte("effective_from", period.period_end);

  if (versionError) throw new Error(versionError.message);
  const chosen = versionForPeriod(
    (versions ?? []).map((row) => ({ ...row, effectiveFrom: row.effective_from, effectiveTo: row.effective_to })),
    period.period_start,
    period.period_end,
  );
  if (!chosen) {
    return {
      status: "not_covered",
      reason: "no_single_approved_version",
      message: "لا توجد نسخة عقد معتمدة بدأت قبل نهاية فترة التدقيق.",
    };
  }

  const version = chosen.version;
  const { data: ruleRows, error: rulesError } = await client
    .from("contract_fee_rules")
    .select("id, contract_id, version_id, rule_key, rule_type, value_kind, numeric_value, text_value, currency, funding_source, scope_type, scope_key, notes, created_at")
    .eq("user_id", userId)
    .eq("contract_id", input.contractId)
    .eq("version_id", version.id)
    .order("created_at", { ascending: true });

  if (rulesError) throw new Error(rulesError.message);

  const rules: ContractRuleRecord[] = (ruleRows ?? []).map((row) => ({
    id: row.id,
    contractId: row.contract_id,
    versionId: row.version_id,
    ruleKey: row.rule_key,
    ruleType: row.rule_type as ContractRuleType,
    valueKind: row.value_kind as ContractValueKind,
    numericValue: row.numeric_value,
    textValue: row.text_value,
    currency: row.currency,
    fundingSource: row.funding_source as ContractFundingSource | null,
    scopeType: row.scope_type as ContractScopeType,
    scopeKey: row.scope_key,
    notes: row.notes,
    createdAt: row.created_at,
  }));

  const versionInput = {
    id: version.id,
    versionNumber: version.version_number,
    effectiveFrom: version.effective_from,
    effectiveTo: version.effective_to,
  };

  return {
    status: "evaluated",
    coverageNote: chosen.note,
    compliance:
      contract.platform === "hungerstation"
        ? evaluateHungerStationContractCompliance({
            period,
            rules,
            version: versionInput,
          })
        : contract.platform === "keeta"
          ? evaluateKeetaContractCompliance({
              period,
              rules,
              version: versionInput,
            })
          : evaluateJahezContractCompliance({
              period,
              rules,
              version: versionInput,
            }),
  };
}

export interface ContractFinding {
  contractId: string;
  contractName: string;
  coverageNote: string | null;
  compliance: HungerStationContractCompliance | KeetaContractCompliance | JahezContractCompliance;
}

/**
 * Every active contract of the period's platform with an approved version in force for the period (a contract stays
 * in force until a newer version is uploaded), checked against it. Read only: nothing is written to the period.
 */
export async function getContractFindingsOnServer(periodId: string): Promise<ContractFinding[]> {
  const { client, userId } = await requireWorkspacePermission("contracts.read");
  const { data: rawPeriod, error: periodError } = await client
    .from("periods")
    .select("*")
    .eq("id", periodId)
    .eq("user_id", userId)
    .maybeSingle();
  if (periodError) throw new Error(periodError.message);
  if (!rawPeriod) return [];
  const period = rawPeriod as unknown as StoredPeriod;

  const { data: contracts, error: contractsError } = await client
    .from("platform_contracts")
    .select("id, platform, name")
    .eq("user_id", userId)
    .eq("platform", period.platform)
    .is("archived_at", null);
  if (contractsError) throw new Error(contractsError.message);

  const findings: ContractFinding[] = [];
  for (const contract of contracts ?? []) {
    try {
      const result = await evaluateForPeriod(client, userId, contract, period);
      if (result.status === "evaluated") {
        findings.push({ contractId: contract.id, contractName: contract.name, coverageNote: result.coverageNote, compliance: result.compliance });
      }
    } catch (cause) {
      // One contract with overlapping versions must not hide the others' findings.
      console.error("Contract check skipped", contract.id, cause instanceof Error ? cause.message : cause);
    }
  }
  return findings;
}
