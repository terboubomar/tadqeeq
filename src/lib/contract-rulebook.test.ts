import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "drizzle/migrations/0015_contract_fee_rulebook.sql",
);

async function loadMigration() {
  return readFile(migrationPath, "utf8");
}

describe("contract fee rulebook foundation", () => {
  test("creates the versioned user-owned rulebook tables", async () => {
    const sql = await loadMigration();

    for (const table of [
      "platform_contracts",
      "contract_versions",
      "contract_fee_rules",
      "contract_documents",
      "contract_rule_events",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }

    expect(sql).toContain("user_id UUID NOT NULL REFERENCES auth.users(id)");
    expect(sql).toContain("platform IN ('hungerstation', 'keeta', 'jahez')");
  });

  test("keeps approved commercial versions immutable and non-overlapping", async () => {
    const sql = await loadMigration();

    expect(sql).toContain("Approved contract versions are immutable");
    expect(sql).toContain("Rules in an approved contract version are immutable");
    expect(sql).toContain("Documents in an approved contract version are immutable");
    expect(sql).toContain("Approved contract versions may not overlap in effective dates");
    expect(sql).toContain("daterange(");
    expect(sql).toContain("requires at least one fee rule before approval");
  });

  test("validates typed financial rule values", async () => {
    const sql = await loadMigration();

    expect(sql).toContain("value_kind IN ('percentage', 'amount', 'boolean', 'text')");
    expect(sql).toContain("numeric_value >= 0 AND numeric_value <= 100");
    expect(sql).toContain("value_kind <> 'amount' OR currency IS NOT NULL");
    expect(sql).toContain("scope_type IN ('all', 'branch')");
    expect(sql).toContain("18.000000 means 18%");
  });

  test("stores contract evidence privately and keeps the audit ledger append-only", async () => {
    const sql = await loadMigration();

    expect(sql).toContain("VALUES ('contract-files', 'contract-files', false, 26214400)");
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(sql).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.contract_rule_events FROM authenticated",
    );
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("contract_versions_audit_trigger");
    expect(sql).toContain("contract_fee_rules_audit_trigger");
  });
});
