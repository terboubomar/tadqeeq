import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { createMigratedDatabase } from "../test-support/database";

/** Migration 0066: signed-out requests keep only the price-plan read; nobody on the client can TRUNCATE. */
let db: PGlite;

async function tablePrivilege(role: string, table: string, privilege: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>("select has_table_privilege($1, $2, $3) as ok", [role, `public.${table}`, privilege]);
  return rows[0]!.ok;
}

async function canExecute(role: string, fn: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, fn]);
  return rows[0]!.ok;
}

beforeAll(async () => {
  db = await createMigratedDatabase();
});

afterAll(async () => {
  await db.close();
});

describe("client role grants", () => {
  test("no client role can TRUNCATE, and anon holds nothing beyond reading price plans", async () => {
    const { rows } = await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
    expect(rows.length).toBeGreaterThan(0);
    for (const { tablename } of rows) {
      for (const role of ["anon", "authenticated"]) {
        expect(await tablePrivilege(role, tablename, "TRUNCATE")).toBe(false);
      }
      for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
        expect(await tablePrivilege("anon", tablename, privilege)).toBe(false);
      }
      expect(await tablePrivilege("anon", tablename, "SELECT")).toBe(tablename === "subscription_plans");
    }
  });

  test("signed-in users keep their table access", async () => {
    expect(await tablePrivilege("authenticated", "subscription_plans", "SELECT")).toBe(true);
    expect(await tablePrivilege("authenticated", "profiles", "SELECT")).toBe(true);
  });

  test("admin-check functions run for signed-in users only", async () => {
    for (const fn of ["public.is_platform_admin()", "public.ops_role()"]) {
      expect(await canExecute("anon", fn)).toBe(false);
      expect(await canExecute("authenticated", fn)).toBe(true);
    }
  });
});
