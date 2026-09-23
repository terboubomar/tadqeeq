import { describe, expect, test } from "bun:test";

import { safeStorageFileName, sha256Hex } from "./source-file-utils";

describe("audit source-file primitives", () => {
  test("produces a stable lowercase SHA-256 fingerprint", async () => {
    const one = await sha256Hex(new Blob(["tadqeeq"]));
    const two = await sha256Hex(new Blob(["tadqeeq"]));
    const changed = await sha256Hex(new Blob(["tadqeeq!"]));

    expect(one).toBe(two);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(changed).not.toBe(one);
  });

  test("keeps storage filenames path-safe", () => {
    expect(safeStorageFileName("Invoice Aug 2026 / Past.pdf")).toBe(
      "Invoice-Aug-2026-Past.pdf",
    );
    expect(safeStorageFileName("")).toBe("source-file");
  });

  test("migration creates private bounded storage and owned metadata", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0010_source_files.sql",
    ).text();

    expect(sql).toContain("'source-files', 'source-files', false, 26214400");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.audit_source_files");
    expect(sql).toContain("sha256 ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("period_id UUID NOT NULL REFERENCES public.periods(id)");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
  });
});
