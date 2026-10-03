import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { asUser, createMigratedDatabase } from "../../test-support/database";

/** Migration 0036: remembered platform columns follow the workspace roles. */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000006a1",
  auditorA: "00000000-0000-4000-8000-0000000006a2",
  viewerA: "00000000-0000-4000-8000-0000000006a3",
  ownerB: "00000000-0000-4000-8000-0000000006b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;

const INSERT = `insert into public.platform_column_snapshots (workspace_id, user_id, platform, source, columns)
  values ($1, $2, 'keeta', $3, '[{"name":"Bank fee","money":true,"nonZero":true}]')`;

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
  }
  await db.query(INSERT, [wsA, U.ownerA, "Order Summary"]);
  await db.query(INSERT, [wsB, U.ownerB, "Order Summary"]);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("platform column snapshots", () => {
  test("each company sees only its own columns", async () => {
    const a = await asUser<{ workspace_id: string }>(db, U.ownerA, "select workspace_id from public.platform_column_snapshots");
    expect(a.rows.map((row) => row.workspace_id)).toEqual([wsA]);
  });

  test("an auditor can update; a viewer can read but not write", async () => {
    const saved = await asUser(db, U.auditorA, INSERT, [wsA, U.ownerA, "Invoice Details"]);
    expect(saved.error).toBeNull();
    const read = await asUser(db, U.viewerA, "select * from public.platform_column_snapshots");
    expect(read.rows).toHaveLength(1);
    const write = await asUser(db, U.viewerA, INSERT, [wsA, U.ownerA, "Other"]);
    expect(write.error).not.toBeNull();
  });

  test("nobody can write into or change another company", async () => {
    const write = await asUser(db, U.ownerB, INSERT, [wsA, U.ownerA, "X"]);
    expect(write.error).not.toBeNull();
    const update = await asUser(db, U.ownerB, "update public.platform_column_snapshots set columns = '[]' where workspace_id = $1", [wsA]);
    expect(update.affected).toBe(0);
  });

  test("columns must be a list", async () => {
    const bad = await asUser(
      db,
      U.ownerA,
      "insert into public.platform_column_snapshots (workspace_id, user_id, platform, source, columns) values ($1, $2, 'jahez', 'S', '{}')",
      [wsA, U.ownerA],
    );
    expect(bad.code).toBe("23514");
  });
});
