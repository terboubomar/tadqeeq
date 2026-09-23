import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("recovery claim details", () => {
  test("migration keys details to lineage and stable exception identity", async () => {
    const sql = await readFile(
      path.resolve(
        process.cwd(),
        "drizzle/migrations/0017_recovery_case_details.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.recovery_case_details");
    expect(sql).toContain("UNIQUE (user_id, lineage_id, exception_id)");
    expect(sql).toContain("source_period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT");
    expect(sql).toContain("ALTER TABLE public.recovery_case_details ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.recovery_case_events ENABLE ROW LEVEL SECURITY");
  });

  test("keeps recovery event history append-only for authenticated clients", async () => {
    const sql = await readFile(
      path.resolve(
        process.cwd(),
        "drizzle/migrations/0017_recovery_case_details.sql",
      ),
      "utf8",
    );

    expect(sql).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON TABLE public.recovery_case_events FROM authenticated",
    );
    expect(sql).toContain("AFTER INSERT OR UPDATE ON public.recovery_case_details");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = ''");
  });

  test("server revalidates the deterministic exception before claim metadata is saved", async () => {
    const source = await readFile(
      path.resolve(
        process.cwd(),
        "src/lib/recovery-case-details.server.ts",
      ),
      "utf8",
    );

    expect(source).toContain("buildPeriodExceptions(period).find");
    expect(source).toContain("exception.potentialRecovery <= 0");
    expect(source).toContain("approvedClaimAmount > maxClaim");
    expect(source).toContain("period.lineage_id ?? period.id");
    expect(source).toContain(
      'onConflict: "user_id,lineage_id,exception_id"',
    );
  });
});
