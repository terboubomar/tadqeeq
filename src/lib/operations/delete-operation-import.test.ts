import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "drizzle/migrations/0051_delete_operation_import.sql",
);

describe("Daily Operations import deletion", () => {
  test("is workspace-scoped, permission-checked, and deletes children before the import", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("private.has_workspace_permission(v_workspace, 'imports.create')");
    expect(sql).toContain("WHERE id = p_import_id AND workspace_id = v_workspace");
    expect(sql.indexOf("DELETE FROM public.operation_adjustments")).toBeLessThan(
      sql.indexOf("DELETE FROM public.operation_imports"),
    );
    expect(sql.indexOf("DELETE FROM public.operation_orders")).toBeLessThan(
      sql.indexOf("DELETE FROM public.operation_imports"),
    );
  });

  test("does not touch accounting records", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).not.toMatch(/\b(periods|refunds|invoices)\b/i);
  });
});
