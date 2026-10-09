import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, asUser, createMigratedDatabase } from "../test-support/database";

/** Migrations 0047 and 0054: the chart of accounts for journal entries follows the workspace roles. */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000007a1",
  auditorA: "00000000-0000-4000-8000-0000000007a2",
  viewerA: "00000000-0000-4000-8000-0000000007a3",
  ownerB: "00000000-0000-4000-8000-0000000007b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;

const UPSERT = `insert into public.journal_account_settings (workspace_id, user_id, account_key, account_code, account_name, updated_by)
  values ($1, $2, $3, $4, $5, $6)
  on conflict (workspace_id, account_key) do update set account_code = excluded.account_code, account_name = excluded.account_name`;

beforeAll(async () => {
  db = await createMigratedDatabase();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.com`]);
  }
  await activateAllWorkspaces(db);
  const ws = async (owner: string) =>
    (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [owner])).rows[0]!.id;
  wsA = await ws(U.ownerA);
  wsB = await ws(U.ownerB);
  for (const [user, role] of [[U.auditorA, "auditor"], [U.viewerA, "viewer"]] as const) {
    await db.query("insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, $3, 'active')", [wsA, user, role]);
    await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [wsA, user]);
  }
  await db.query(UPSERT, [wsA, U.ownerA, "sales_revenue", "4101", "مبيعات التطبيقات", U.ownerA]);
  await db.query(UPSERT, [wsB, U.ownerB, "sales_revenue", "9999", "Other company", U.ownerB]);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("journal account settings", () => {
  test("each company sees only its own accounts", async () => {
    const a = await asUser<{ account_code: string }>(db, U.ownerA, "select account_code from public.journal_account_settings");
    expect(a.rows.map((row) => row.account_code)).toEqual(["4101"]);
  });

  test("an auditor can map accounts; a viewer can read but not change them", async () => {
    const auditor = await asUser(db, U.auditorA, UPSERT, [wsA, U.ownerA, "output_vat", "2301", "ضريبة مخرجات", U.auditorA]);
    expect(auditor.error).toBeNull();

    const viewerRead = await asUser(db, U.viewerA, "select account_key from public.journal_account_settings");
    expect(viewerRead.rows.length).toBe(1);
    const viewerWrite = await asUser(db, U.viewerA, UPSERT, [wsA, U.ownerA, "output_vat", "2301", "x", U.viewerA]);
    expect(viewerWrite.error).not.toBeNull();
  });

  test("a company cannot write into another company's chart", async () => {
    const result = await asUser(db, U.ownerA, UPSERT, [wsB, U.ownerB, "output_vat", "1", "x", U.ownerA]);
    expect(result.error).not.toBeNull();
  });

  test("the devices, subscription and CPC advertising accounts can be mapped (migration 0054)", async () => {
    for (const key of ["device_expense", "subscription_expense", "advertising_expense"]) {
      const result = await asUser(db, U.ownerA, UPSERT, [wsA, U.ownerA, key, "5" + key.length, key, U.ownerA]);
      expect(result.error).toBeNull();
    }
  });

  test("only known entry accounts can be stored", async () => {
    await db.exec("begin");
    try {
      const error = await db
        .query(UPSERT, [wsA, U.ownerA, "made_up_account", "1", "x", U.ownerA])
        .then(() => null)
        .catch((cause: { code?: string }) => cause.code);
      expect(error).toBe("23514");
    } finally {
      await db.exec("rollback");
    }
  });
});
