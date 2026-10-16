import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, asUser, createMigratedDatabase } from "../test-support/database";

/** Migrations 0061-0063: the accounting key and the sent-entry log are server-only; Daftra and Zoho keep their host. */
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

  test("Qoyod and Daftra only, and Daftra only with a Daftra site", async () => {
    const insert = "insert into public.accounting_connections (workspace_id, provider, secret_ciphertext, secret_hint, site) values ($1, $2, $3, '1', $4)";
    const sealed = "v1." + "a".repeat(40);
    await expect(db.query(insert, [ws, "xero", sealed, null])).rejects.toThrow();
    await expect(db.query(insert, [ws, "daftra", sealed, null])).rejects.toThrow();
    await expect(db.query(insert, [ws, "daftra", sealed, "evil.com"])).rejects.toThrow();
    await expect(db.query(insert, [ws, "daftra", sealed, "mystore.daftra.com.evil.com"])).rejects.toThrow();
    await db.query(insert, [ws, "daftra", sealed, "mystore.daftra.com"]);
    await db.query("insert into public.accounting_sync_entries (workspace_id, provider, period_key, entry_key, reference, external_id, total) values ($1, 'daftra', 'p1', 'uhud', 'TDQ-1', '2415', 10)", [ws]);
  });

  test("Zoho only with a Zoho API host, and no provider keeps another's host", async () => {
    const insert = "insert into public.accounting_connections (workspace_id, provider, secret_ciphertext, secret_hint, site) values ($1, $2, $3, '1', $4)";
    const sealed = "v1." + "a".repeat(40);
    await db.query("delete from public.accounting_connections where workspace_id = $1 and provider <> 'qoyod'", [ws]);
    await expect(db.query(insert, [ws, "zoho", sealed, null])).rejects.toThrow();
    await expect(db.query(insert, [ws, "zoho", sealed, "www.zohoapis.evil.com"])).rejects.toThrow();
    await expect(db.query(insert, [ws, "zoho", sealed, "mystore.daftra.com"])).rejects.toThrow();
    await expect(db.query(insert, [ws, "daftra", sealed, "www.zohoapis.sa"])).rejects.toThrow();
    await db.query(insert, [ws, "zoho", sealed, "www.zohoapis.sa"]);
    await db.query("insert into public.accounting_sync_entries (workspace_id, provider, period_key, entry_key, reference, external_id, total) values ($1, 'zoho', 'p1', 'uhud', 'TDQ-1', '460000000038001', 10)", [ws]);
  });
});
