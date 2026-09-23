import { describe, expect, test } from "bun:test";

describe("P2-T4 immutable period reanalysis", () => {
  test("schema creates lineage and active-period versioning", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0014_period_reanalysis.sql",
    ).text();

    expect(sql).toContain("lineage_id UUID");
    expect(sql).toContain("supersedes_period_id UUID");
    expect(sql).toContain("superseded_by UUID");
    expect(sql).toContain("superseded_at TIMESTAMPTZ");
    expect(sql).toContain("periods_user_platform_active_range_unique_idx");
    expect(sql).toContain("AND superseded_at IS NULL");
  });

  test("reanalysis is transactional at the period-version boundary", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0014_period_reanalysis.sql",
    ).text();

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_period_reanalysis");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("SET superseded_at = v_now");
    expect(sql).toContain("RETURNING id INTO v_new_id");
    expect(sql).toContain("SET superseded_by = v_new_id");
    expect(sql).toContain("rollback_period_reanalysis");
  });

  test("server reruns raw sources and verifies their hashes", async () => {
    const source = await Bun.file(
      "src/lib/reanalyze-period.server.ts",
    ).text();

    expect(source).toContain('.from("audit_source_files")');
    expect(source).toContain(".download(row.storage_path)");
    expect(source).toContain("sha256Hex(file)");
    expect(source).toContain("digest !== row.sha256");
    expect(source).toContain("buildAnalysis(");
    expect(source).toContain("storeSources(");
    expect(source).not.toContain("toAnalysis(");
  });

  test("workflow identity survives across audit versions", async () => {
    const exceptions = await Bun.file("src/lib/exceptions.ts").text();
    const reanalysis = await Bun.file(
      "src/lib/reanalyze-period.server.ts",
    ).text();

    expect(exceptions).toContain("period.lineage_id ?? period.id");
    expect(reanalysis).toContain("exceptionWorkflow: oldPeriod.invoice?.exceptionWorkflow ?? {}");
  });

  test("normal period listing hides superseded versions", async () => {
    const periods = await Bun.file("src/lib/periods.ts").text();
    expect(periods).toContain('.is("superseded_at", null)');
  });
});
