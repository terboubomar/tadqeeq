import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, createMigratedDatabase } from "../test-support/database";

/**
 * Migration 0067: an AI-assistant token (client_id claim) reads company data only if that user approved that
 * assistant from a fully signed-in session, which the server records with record_assistant_link_approval.
 */
const OWNER = "00000000-0000-4000-8000-0000000067a1";
const OTHER = "00000000-0000-4000-8000-0000000067b1";
const CLIENT = "00000000-0000-4000-8000-0000000067c1";

let db: PGlite;

async function canRead(user: string, claims: Record<string, unknown>): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, ...claims })]);
    await tx.exec("set local role authenticated");
    const { rows } = await tx.query<{ ok: boolean }>(
      "select private.has_workspace_permission((select id from public.workspaces where owner_user_id = $1), 'periods.read') as ok",
      [user],
    );
    await tx.rollback();
    return rows[0]!.ok;
  });
}

async function record(authorizationId: string, user: string): Promise<string> {
  const { rows } = await db.query<{ client: string }>(
    "select public.record_assistant_link_approval($1, $2, 'session-1')::text as client",
    [authorizationId, user],
  );
  return rows[0]!.client;
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  for (const id of [OWNER, OTHER]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id.slice(-4)}@example.com`]);
  }
  await activateAllWorkspaces(db);
  // Supabase's pending-authorization table, as far as the approval function reads it.
  await db.exec(`create table auth.oauth_authorizations (
    authorization_id text primary key, client_id uuid not null, user_id uuid, expires_at timestamptz not null)`);
  await db.query("insert into auth.oauth_authorizations values ('auth-ok', $1, null, now() + interval '10 minutes')", [CLIENT]);
  await db.query("insert into auth.oauth_authorizations values ('auth-other', $1, $2, now() + interval '10 minutes')", [CLIENT, OTHER]);
  await db.query("insert into auth.oauth_authorizations values ('auth-old', $1, null, now() - interval '1 minute')", [CLIENT]);
});

afterAll(async () => {
  await db.close();
});

describe("AI-assistant link approvals", () => {
  test("an assistant token without an approved link is refused", async () => {
    expect(await canRead(OWNER, { amr: [{ method: "password" }], client_id: CLIENT })).toBe(false);
  });

  test("the server records the approval from the pending authorization, then the token works", async () => {
    expect(await record("auth-ok", OWNER)).toBe(CLIENT);
    expect(await canRead(OWNER, { amr: [{ method: "password" }], client_id: CLIENT })).toBe(true);
    // The approval belongs to that user and that assistant only.
    expect(await canRead(OWNER, { client_id: "00000000-0000-4000-8000-0000000067d1" })).toBe(false);
  });

  test("an expired authorization, or one started by another user, is not recorded", async () => {
    await expect(record("auth-old", OWNER)).rejects.toThrow();
    await expect(record("auth-other", OWNER)).rejects.toThrow();
    await expect(record("missing", OWNER)).rejects.toThrow();
  });

  test("signed-in users cannot read approvals or record one themselves", async () => {
    const outcome = await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: OWNER })]);
      await tx.exec("set local role authenticated");
      const results: string[] = [];
      for (const sql of [
        "select count(*) from public.assistant_link_approvals",
        `select public.record_assistant_link_approval('auth-ok', '${OWNER}', null)`,
      ]) {
        try {
          await tx.exec("savepoint s");
          await tx.query(sql);
          results.push("allowed");
        } catch {
          await tx.exec("rollback to savepoint s");
          results.push("denied");
        }
      }
      await tx.rollback();
      return results;
    });
    expect(outcome).toEqual(["denied", "denied"]);
  });

  test("sessions that are not assistants keep the existing rules", async () => {
    // Google / Apple sign-in (no password): no email code needed.
    expect(await canRead(OTHER, { amr: [{ method: "oauth" }] })).toBe(true);
    // Password sign-in without the emailed code: refused.
    expect(await canRead(OTHER, { amr: [{ method: "password" }], session_id: "s-1" })).toBe(false);
  });
});
