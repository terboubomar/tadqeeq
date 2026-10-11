import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";

import { createMigratedDatabase } from "../test-support/database";

const OWNER = "00000000-0000-4000-8000-000000005801";
let db: PGlite;
let workspace: string;

async function deleteOrder() {
  const source = await readFile(path.join(process.cwd(), "src/lib/workspace-deletion.server.ts"), "utf8");
  const list = source.match(/export const OWNED_TABLES_DELETE_ORDER = \[([\s\S]*?)\];/);
  return [...(list?.[1] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]!);
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'delete-owner@example.com')", [OWNER]);
  workspace = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
});

afterAll(async () => db.close());

describe("workspace delete order", () => {
  test("deleting the owned tables in order removes a filled workspace without a foreign key error", async () => {
    await db.query("insert into public.periods (workspace_id, user_id, platform, label, period_start, period_end) values ($1, $2, 'hungerstation', 'September', '2026-09-01', '2026-09-30')", [workspace, OWNER]);
    await db.query("insert into public.journal_account_settings (workspace_id, user_id, account_key, account_code) values ($1, $2, 'sales_revenue', '4000')", [workspace, OWNER]);
    await db.query("insert into public.journal_cost_centers (workspace_id, user_id, platform, branch_key, cost_center) values ($1, $2, 'keeta', 'B1', 'CC1')", [workspace, OWNER]);
    await db.query(
      "insert into public.operation_imports (workspace_id, user_id, source_kind, platform, business_date, original_name, sha256, row_count, summary) values ($1, $2, 'keeta_orders', 'keeta', '2026-10-09', 'k.xlsx', repeat('a', 64), 0, '{}')",
      [workspace, OWNER],
    );

    for (const table of await deleteOrder()) {
      await db.query(`delete from public.${table} where workspace_id = $1`, [workspace]);
    }
    await db.query("delete from public.workspaces where id = $1", [workspace]);
    const left = await db.query("select 1 from public.workspaces where id = $1", [workspace]);
    expect(left.rows).toHaveLength(0);
  });
});
