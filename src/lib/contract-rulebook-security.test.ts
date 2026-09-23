import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "drizzle/migrations/0016_contract_rulebook_security.sql",
);

async function loadMigration() {
  return readFile(migrationPath, "utf8");
}

describe("contract rulebook Data API hardening", () => {
  test("removes anonymous access and grants authenticated least privilege", async () => {
    const sql = await loadMigration();

    for (const table of [
      "platform_contracts",
      "contract_versions",
      "contract_fee_rules",
      "contract_documents",
      "contract_rule_events",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon`);
    }

    expect(sql).toContain(
      "GRANT SELECT\n  ON TABLE public.contract_rule_events\n  TO authenticated",
    );
    expect(sql).toContain(
      "REVOKE INSERT, UPDATE, DELETE\n  ON TABLE public.contract_rule_events\n  FROM authenticated",
    );
  });

  test("keeps trigger functions off the public RPC surface", async () => {
    const sql = await loadMigration();

    expect(sql).toContain(
      "ALTER FUNCTION public.log_contract_rule_event() SET search_path = ''",
    );

    for (const fn of [
      "log_contract_rule_event",
      "guard_contract_version",
      "guard_contract_rule",
      "guard_contract_document",
    ]) {
      expect(sql).toContain(
        `REVOKE EXECUTE ON FUNCTION public.${fn}()\n  FROM PUBLIC, anon, authenticated`,
      );
      expect(sql).toContain(
        `GRANT EXECUTE ON FUNCTION public.${fn}() TO postgres`,
      );
    }
  });
});
