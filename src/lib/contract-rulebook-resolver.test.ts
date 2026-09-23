import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ContractRuleRecord } from "./contract-rulebook";
import {
  normalizeContractScopeKey,
  resolveContractRulePrecedence,
} from "./contract-rulebook-resolver";

function rule(
  id: string,
  ruleKey: string,
  scopeType: "all" | "branch",
  scopeKey: string | null,
  numericValue: number,
): ContractRuleRecord {
  return {
    id,
    contractId: "contract-1",
    versionId: "version-1",
    ruleKey,
    ruleType: "commission_rate",
    valueKind: "percentage",
    numericValue,
    textValue: null,
    currency: null,
    fundingSource: null,
    scopeType,
    scopeKey,
    notes: null,
    createdAt: "2026-09-23T00:00:00.000Z",
  };
}

describe("effective contract term resolution", () => {
  test("server lookup uses only approved versions whose date range contains the request", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "src/lib/contract-rulebook.server.ts"),
      "utf8",
    );

    expect(source).toContain('.eq("status", "approved")');
    expect(source).toContain('.lte("effective_from", input.onDate)');
    expect(source).toContain(
      '.or(`effective_to.is.null,effective_to.gte.${input.onDate}`)',
    );
    expect(source).toContain("if (versionRows.length > 1)");
    expect(source).toContain("resolveContractRulePrecedence(rules, branchKey)");
  });


  test("branch-specific rules override the all-branches value for the same key", () => {
    const resolved = resolveContractRulePrecedence(
      [
        rule("all", "commission_rate", "all", null, 18),
        rule("rakah", "commission_rate", "branch", "Al Rakah", 17),
      ],
      "Al Rakah",
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.id).toBe("rakah");
    expect(resolved[0]?.numericValue).toBe(17);
  });

  test("unrelated branch overrides never leak into another branch", () => {
    const resolved = resolveContractRulePrecedence(
      [
        rule("all", "commission_rate", "all", null, 18),
        rule("rakah", "commission_rate", "branch", "Al Rakah", 17),
      ],
      "Dammam",
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.id).toBe("all");
    expect(resolved[0]?.numericValue).toBe(18);
  });

  test("no-branch lookup uses all-branches rules only", () => {
    const resolved = resolveContractRulePrecedence([
      rule("all", "commission_rate", "all", null, 18),
      rule("rakah", "commission_rate", "branch", "Al Rakah", 17),
      rule("branch-only", "wallet_fee", "branch", "Al Rakah", 2),
    ]);

    expect(resolved.map((item) => item.id)).toEqual(["all"]);
  });

  test("branch matching is normalized for case, width, and whitespace", () => {
    expect(normalizeContractScopeKey("  AL RAKAH  ")).toBe("al rakah");

    const resolved = resolveContractRulePrecedence(
      [
        rule("all", "commission_rate", "all", null, 18),
        rule("rakah", "commission_rate", "branch", "al rakah", 17),
      ],
      " AL RAKAH ",
    );

    expect(resolved[0]?.id).toBe("rakah");
  });
});
