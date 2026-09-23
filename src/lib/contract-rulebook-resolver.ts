import type { ContractRuleRecord } from "./contract-rulebook";

export function normalizeContractScopeKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function resolveContractRulePrecedence(
  rules: ContractRuleRecord[],
  branchKey?: string | null,
): ContractRuleRecord[] {
  const normalizedBranch = branchKey
    ? normalizeContractScopeKey(branchKey)
    : null;

  const grouped = new Map<string, ContractRuleRecord[]>();
  for (const rule of rules) {
    const key = normalizeContractScopeKey(rule.ruleKey);
    const bucket = grouped.get(key) ?? [];
    bucket.push(rule);
    grouped.set(key, bucket);
  }

  const resolved: ContractRuleRecord[] = [];

  for (const bucket of grouped.values()) {
    const branchRule =
      normalizedBranch == null
        ? undefined
        : bucket.find(
            (rule) =>
              rule.scopeType === "branch" &&
              rule.scopeKey != null &&
              normalizeContractScopeKey(rule.scopeKey) === normalizedBranch,
          );

    const allRule = bucket.find((rule) => rule.scopeType === "all");
    const selected = branchRule ?? allRule;

    if (selected) resolved.push(selected);
  }

  return resolved.sort((left, right) => {
    const typeCompare = left.ruleType.localeCompare(right.ruleType);
    if (typeCompare !== 0) return typeCompare;
    return left.ruleKey.localeCompare(right.ruleKey);
  });
}
