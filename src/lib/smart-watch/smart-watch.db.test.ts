import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { asUser, createMigratedDatabase } from "../../test-support/database";

/** Migration 0034: smart watch answers follow the workspace roles. */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000004a1",
  auditorA: "00000000-0000-4000-8000-0000000004a2",
  viewerA: "00000000-0000-4000-8000-0000000004a3",
  ownerB: "00000000-0000-4000-8000-0000000004b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;

const INSERT = `insert into public.smart_watch_acceptances (workspace_id, user_id, created_by, platform, branch_key, metric, accepted_rate)
  values ($1, $2, $3, 'hungerstation', $4, 'commission', 0.21)`;

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
  await db.query(INSERT, [wsA, U.ownerA, U.ownerA, "id:malqa"]);
  await db.query(INSERT, [wsB, U.ownerB, U.ownerB, "id:other"]);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("smart watch acceptances", () => {
  test("each company sees only its own answers", async () => {
    const a = await asUser<{ branch_key: string }>(db, U.ownerA, "select branch_key from public.smart_watch_acceptances");
    expect(a.rows.map((row) => row.branch_key)).toEqual(["id:malqa"]);
  });

  test("an auditor can answer; a viewer can read but not answer", async () => {
    const saved = await asUser(db, U.auditorA, INSERT, [wsA, U.ownerA, U.auditorA, "id:olaya"]);
    expect(saved.error).toBeNull();
    const read = await asUser(db, U.viewerA, "select * from public.smart_watch_acceptances");
    expect(read.rows).toHaveLength(1);
    const write = await asUser(db, U.viewerA, INSERT, [wsA, U.ownerA, U.viewerA, "id:yasmin"]);
    expect(write.error).not.toBeNull();
  });

  test("nobody can write into or change another company", async () => {
    const write = await asUser(db, U.ownerB, INSERT, [wsA, U.ownerA, U.ownerB, "id:x"]);
    expect(write.error).not.toBeNull();
    const update = await asUser(db, U.ownerB, "update public.smart_watch_acceptances set accepted_rate = 0.9 where workspace_id = $1", [wsA]);
    expect(update.affected).toBe(0);
  });

  test("one answer per branch and charge, with a known metric", async () => {
    const again = await asUser(db, U.ownerA, INSERT, [wsA, U.ownerA, U.ownerA, "id:malqa"]);
    expect(again.code).toBe("23505");
    const bad = await asUser(
      db,
      U.ownerA,
      "insert into public.smart_watch_acceptances (workspace_id, user_id, platform, branch_key, metric, accepted_rate) values ($1, $2, 'keeta', 'id:a', 'tips', 0.1)",
      [wsA, U.ownerA],
    );
    expect(bad.code).toBe("23514");
  });
});
