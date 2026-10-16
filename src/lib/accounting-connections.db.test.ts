import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0061: the accounting key and the sent-entry log are server-only. */
const OWNER = "00000000-0000-4000-8000-0000000061a1";
let db: PGlite;
let ws: string;

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'owner61@example.com')", [OWNER]);
  await activateAllWorkspaces(db);
  ws = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
  await db.query(
    "insert into public.accounting_connections (workspace_id, provider, secret_ciphertext, secret_hint) values ($1, 'qoyod', $2, '1234')",
    [ws, "v1." + "a".repeat(40)],
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("accounting connections (0061)", () => {
  test("not even the workspace owner can read or write them from the browser", async () => {
    const read = await asUser(db, OWNER, "select secret_ciphertext from public.accounting_connections");
    expect(read.error).not.toBeNull();
    const write = await asUser(db, OWNER, "insert into public.accounting_sync_entries (workspace_id, provider, period_key, entry_key, reference, external_id, total) values ($1, 'qoyod', 'p', 'e', 'r', '1', 1)", [ws]);
    expect(write.error).not.toBeNull();
    const anon = await asUser(db, null, "select * from public.accounting_connections");
    expect(anon.error).not.toBeNull();
  });

  test("an entry is recorded once per period and branch", async () => {
    const insert = "insert into public.accounting_sync_entries (workspace_id, provider, period_key, entry_key, reference, external_id, total) values ($1, 'qoyod', 'p1', 'uhud', 'TDQ-1', '77', 10)";
    await db.query(insert, [ws]);
    await expect(db.query(insert, [ws])).rejects.toThrow();
  });

  test("only Qoyod for now", async () => {
    await expect(
      db.query("insert into public.accounting_connections (workspace_id, provider, secret_ciphertext, secret_hint) values ($1, 'xero', $2, '1')", [ws, "v1." + "a".repeat(40)]),
    ).rejects.toThrow();
  });
});
