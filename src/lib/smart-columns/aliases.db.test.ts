import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { asUser, createMigratedDatabase } from "../../test-support/database";

/** Migration 0035: confirmed column matches follow the workspace roles. */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000005a1",
  auditorA: "00000000-0000-4000-8000-0000000005a2",
  viewerA: "00000000-0000-4000-8000-0000000005a3",
  ownerB: "00000000-0000-4000-8000-0000000005b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;

const INSERT = `insert into public.format_column_aliases (workspace_id, user_id, created_by, platform, source, canonical, observed)
  values ($1, $2, $3, 'keeta', 'Order Summary', 'Subtotal of commission fee (VAT included)', $4)`;

beforeAll(async () => {
  db = await createMigratedDatabase();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.com`]);
  }
  const ws = async (owner: string) =>
    (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [owner])).rows[0]!.id;
  wsA = await ws(U.ownerA);
  wsB = await ws(U.ownerB);
  for (const [user, role] of [[U.auditorA, "auditor"], [U.viewerA, "viewer"]] as const) {
    await db.query("insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, $3, 'active')", [wsA, user, role]);
    await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [wsA, user]);
  }
  await db.query(INSERT, [wsA, U.ownerA, U.ownerA, "Commission fee"]);
  await db.query(INSERT, [wsB, U.ownerB, U.ownerB, "Other"]);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("format column aliases", () => {
  test("each company sees only its own matches", async () => {
    const a = await asUser<{ observed: string }>(db, U.ownerA, "select observed from public.format_column_aliases");
    expect(a.rows.map((row) => row.observed)).toEqual(["Commission fee"]);
  });

  test("an auditor can confirm a match; a viewer can read but not confirm", async () => {
    const saved = await asUser(db, U.auditorA, INSERT, [wsA, U.ownerA, U.auditorA, "Commission"]);
    expect(saved.error).toBeNull();
    const read = await asUser(db, U.viewerA, "select * from public.format_column_aliases");
    expect(read.rows).toHaveLength(1);
    const write = await asUser(db, U.viewerA, INSERT, [wsA, U.ownerA, U.viewerA, "Fee"]);
    expect(write.error).not.toBeNull();
  });

  test("nobody can write into or change another company", async () => {
    const write = await asUser(db, U.ownerB, INSERT, [wsA, U.ownerA, U.ownerB, "X"]);
    expect(write.error).not.toBeNull();
    const update = await asUser(db, U.ownerB, "update public.format_column_aliases set canonical = 'Brand Name' where workspace_id = $1", [wsA]);
    expect(update.affected).toBe(0);
  });

  test("one match per new column name", async () => {
    const again = await asUser(db, U.ownerA, INSERT, [wsA, U.ownerA, U.ownerA, "Commission fee"]);
    expect(again.code).toBe("23505");
  });
});
