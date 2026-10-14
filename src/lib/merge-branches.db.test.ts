import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite, Transaction } from "@electric-sql/pglite";

import { activateAllWorkspaces, asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0058: merge_branches folds one branch row into another, moving ids and every reference. */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000058a1",
  managerA: "00000000-0000-4000-8000-0000000058a2",
  viewerA: "00000000-0000-4000-8000-0000000058a3",
  ownerB: "00000000-0000-4000-8000-0000000058b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;
let managerMemberId: string;

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
  for (const [user, role] of [[U.managerA, "branch_manager"], [U.viewerA, "viewer"]] as const) {
    await db.query("insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, $3, 'active')", [wsA, user, role]);
    await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [wsA, user]);
  }
  managerMemberId = (
    await db.query<{ id: string }>("select id from public.workspace_members where workspace_id = $1 and user_id = $2", [wsA, U.managerA])
  ).rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function branch(workspace: string, owner: string, name: string, ids: { hs?: string; keeta?: string; jahez?: string }) {
  return (
    await db.query<{ id: string }>(
      `insert into public.branch_registry (workspace_id, user_id, name, hungerstation_id, keeta_id, jahez_id)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [workspace, owner, name, ids.hs ?? null, ids.keeta ?? null, ids.jahez ?? null],
    )
  ).rows[0]!.id;
}

/** Runs merge_branches as a user, then reads the result inside the same transaction, and rolls back. */
async function mergeAndRead(user: string, source: string, target: string) {
  let out: { error: string | null; rows: Array<Record<string, unknown>>; scopes: number } = { error: null, rows: [], scopes: 0 };
  await db
    .transaction(async (tx: Transaction) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
      await tx.exec("set local role authenticated");
      try {
        await tx.query("select public.merge_branches($1, $2)", [source, target]);
        await tx.exec("reset role");
        const rows = await tx.query<Record<string, unknown>>(
          "select id, name, hungerstation_id, keeta_id, jahez_id from public.branch_registry where id in ($1, $2)",
          [source, target],
        );
        const scopes = await tx.query<{ n: number }>(
          "select count(*)::int as n from public.workspace_member_branches where branch_id = $1",
          [target],
        );
        out = { error: null, rows: rows.rows, scopes: scopes.rows[0]!.n };
      } catch (error) {
        out = { error: error instanceof Error ? error.message : String(error), rows: [], scopes: 0 };
      }
      await tx.rollback();
    })
    .catch(() => undefined);
  return out;
}

describe("merge_branches", () => {
  test("the kept branch takes the other's platform id and team access; the other row is removed", async () => {
    const hs = await branch(wsA, U.ownerA, "PAST - Al Jamiyin", { hs: "HS-77" });
    const keeta = await branch(wsA, U.ownerA, "Past - Al-Jami'in (🔥Free Delivery 🔥)", { keeta: "K-77" });
    await db.query("insert into public.workspace_member_branches (workspace_id, workspace_member_id, branch_id) values ($1, $2, $3)", [
      wsA,
      managerMemberId,
      keeta,
    ]);

    const result = await mergeAndRead(U.ownerA, keeta, hs);
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([{ id: hs, name: "PAST - Al Jamiyin", hungerstation_id: "HS-77", keeta_id: "K-77", jahez_id: null }]);
    expect(result.scopes).toBe(1);
  });

  test("two branches with different ids on the same platform are not merged", async () => {
    const one = await branch(wsA, U.ownerA, "Uhud", { hs: "HS-1" });
    const two = await branch(wsA, U.ownerA, "Uhud 2", { hs: "HS-2" });
    expect((await mergeAndRead(U.ownerA, one, two)).error).toContain("same platform");
  });

  test("only someone who manages branches can merge", async () => {
    const one = await branch(wsA, U.ownerA, "Malqa HS", { hs: "HS-9" });
    const two = await branch(wsA, U.ownerA, "Malqa Keeta", { keeta: "K-9" });
    expect((await mergeAndRead(U.viewerA, one, two)).error).toContain("not allowed");
  });

  test("branches of another company cannot be merged", async () => {
    const mine = await branch(wsA, U.ownerA, "Mine", { hs: "HS-5" });
    const theirs = await branch(wsB, U.ownerB, "Theirs", { keeta: "K-5" });
    expect((await mergeAndRead(U.ownerA, theirs, mine)).error).not.toBeNull();
    const anon = await asUser(db, null, "select public.merge_branches($1, $2)", [mine, theirs]);
    expect(anon.error).not.toBeNull();
  });
});
