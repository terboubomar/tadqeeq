import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0055: branch cost centers for journal entries follow the workspace roles, like the chart of accounts. */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000008a1",
  auditorA: "00000000-0000-4000-8000-0000000008a2",
  viewerA: "00000000-0000-4000-8000-0000000008a3",
  ownerB: "00000000-0000-4000-8000-0000000008b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;

const UPSERT = `insert into public.journal_cost_centers (workspace_id, user_id, platform, branch_key, branch_name, cost_center, updated_by)
  values ($1, $2, $3, $4, $5, $6, $7)
  on conflict (workspace_id, platform, branch_key) do update set cost_center = excluded.cost_center`;

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
  await db.query(UPSERT, [wsA, U.ownerA, "hungerstation", "500007", "PAST - Uhud", "CC-101", U.ownerA]);
  await db.query(UPSERT, [wsB, U.ownerB, "hungerstation", "500007", "Other", "X-1", U.ownerB]);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("journal cost centers", () => {
  test("each company sees only its own cost centers", async () => {
    const a = await asUser<{ cost_center: string }>(db, U.ownerA, "select cost_center from public.journal_cost_centers");
    expect(a.rows.map((row) => row.cost_center)).toEqual(["CC-101"]);
  });

  test("an auditor can set cost centers; a viewer can read but not change them", async () => {
    const auditor = await asUser(db, U.auditorA, UPSERT, [wsA, U.ownerA, "keeta", "1234", "Keeta branch", "CC-2", U.auditorA]);
    expect(auditor.error).toBeNull();
    const viewerRead = await asUser(db, U.viewerA, "select branch_key from public.journal_cost_centers");
    expect(viewerRead.rows.length).toBe(1);
    const viewerWrite = await asUser(db, U.viewerA, UPSERT, [wsA, U.ownerA, "keeta", "1234", "x", "CC-9", U.viewerA]);
    expect(viewerWrite.error).not.toBeNull();
  });

  test("a company cannot write into another company's cost centers", async () => {
    const result = await asUser(db, U.ownerA, UPSERT, [wsB, U.ownerB, "jahez", "1", "x", "y", U.ownerA]);
    expect(result.error).not.toBeNull();
  });

  test("only the three platforms are accepted", async () => {
    await db.exec("begin");
    try {
      const error = await db
        .query(UPSERT, [wsA, U.ownerA, "talabat", "1", "x", "y", U.ownerA])
        .then(() => null)
        .catch((cause: { code?: string }) => cause.code);
      expect(error).toBe("23514");
    } finally {
      await db.exec("rollback");
    }
  });
});
