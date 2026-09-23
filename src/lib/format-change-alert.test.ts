import { describe, expect, test } from "bun:test";

describe("P2-T5 format change alert contract", () => {
  test("migration stores structural evidence without financial payloads", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0012_format_change_alerts.sql",
    ).text();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.format_change_alerts");
    expect(sql).toContain("expected_format_id");
    expect(sql).toContain("missing_fields");
    expect(sql).toContain("observed_fields");
    expect(sql).toContain("sha256");
    expect(sql).not.toContain("summary JSONB");
    expect(sql).not.toContain("invoice JSONB");
    expect(sql).not.toContain("branches JSONB");
  });

  test("authoritative import retains the rejected data file and records the alert", async () => {
    const source = await Bun.file("src/lib/import-audit.server.ts").text();

    expect(source).toContain("cause instanceof UnsupportedFormatError");
    expect(source).toContain('"/format-alerts/"');
    expect(source).toContain('.from("format_change_alerts")');
    expect(source).toContain("expected_format_id: error.formatId");
    expect(source).toContain("missing_fields: error.missing");
    expect(source).toContain("observed_fields: error.observed");
  });

  test("unsupported format errors carry observed structural fields", async () => {
    const source = await Bun.file("src/lib/analysis/formats/types.ts").text();

    expect(source).toContain("readonly observed: string[]");
    expect(source).toContain("observed?: string[]");
    expect(source).toContain("observed,");
  });
});
