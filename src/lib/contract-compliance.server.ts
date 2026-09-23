import type { ContractRuleRecord, ContractRuleType, ContractValueKind, ContractFundingSource, ContractScopeType } from "./contract-rulebook";
import {
  evaluateHungerStationContractCompliance,
  evaluateKeetaContractCompliance,
  evaluateJahezContractCompliance,
  type HungerStationContractCompliance,
  type KeetaContractCompliance,
  type JahezContractCompliance,
} from "./contract-compliance";
import type { StoredPeriod } from "./periods";
import { requireServerUser } from "./server-auth.server";

export type ContractComplianceResult =
  | {
      status: "evaluated";
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
  const { client, userId } = await requireServerUser();

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
  if (!period.period_start || !period.period_end) {
    return {
      status: "not_covered",
      reason: "missing_period_dates",
      message: "فترة التدقيق لا تحتوي على تاريخ بداية ونهاية صالحين للمطابقة التعاقدية.",
    };
  }

  const { data: versions, error: versionError } = await client
    .from("contract_versions")
    .select("id, version_number, effective_from, effective_to")
    .eq("user_id", userId)
    .eq("contract_id", input.contractId)
    .eq("status", "approved")
    .lte("effective_from", period.period_start)
    .or(`effective_to.is.null,effective_to.gte.${period.period_end}`)
    .order("effective_from", { ascending: false })
    .limit(2);

  if (versionError) throw new Error(versionError.message);
  if (!versions?.length) {
    return {
      status: "not_covered",
      reason: "no_single_approved_version",
      message:
        "لا توجد نسخة عقد معتمدة واحدة تغطي كامل فترة التدقيق. إذا تغيرت الشروط داخل الفترة، قسّم التدقيق حسب تواريخ السريان بدلاً من استخدام معدل مفترض.",
    };
  }
  if (versions.length > 1) {
    throw new Error("وجدت أكثر من نسخة عقد معتمدة تغطي كامل فترة التدقيق.");
  }

  const version = versions[0]!;
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
