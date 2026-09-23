import { describe, expect, test } from "bun:test";

import { ENGINE_VERSION } from "./version";

describe("engine version contract", () => {
  test("uses an explicit semantic engine version", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("migration persists engine version and format IDs on periods", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0009_engine_versioning.sql",
    ).text();

    expect(sql).toContain("engine_version TEXT NOT NULL");
    expect(sql).toContain("format_ids JSONB NOT NULL");
    expect(sql).toContain("DEFAULT '1.0.0'");
    expect(sql).toContain("DEFAULT '[]'::jsonb");
  });
});
