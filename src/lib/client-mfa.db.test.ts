import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, createMigratedDatabase } from "../test-support/database";

/** Migration 0044: a user who turned on two-step sign-in needs an aal2 session (or an OAuth token) for company data. */
const WITH_MFA = "00000000-0000-4000-8000-0000000044a1";
const WITHOUT_MFA = "00000000-0000-4000-8000-0000000044b1";

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

beforeAll(async () => {
  db = await createMigratedDatabase();
  for (const id of [WITH_MFA, WITHOUT_MFA]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id.slice(-4)}@example.com`]);
  }
  await activateAllWorkspaces(db);
  await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [WITH_MFA]);
  // An unfinished setup does not turn it on.
  await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')", [WITHOUT_MFA]);
});

afterAll(async () => {
  await db.close();
});

describe("optional two-step sign-in in the database", () => {
  test("users without it are unchanged", async () => {
    expect(await canRead(WITHOUT_MFA, { aal: "aal1" })).toBe(true);
  });

  test("users with it need the code (aal2)", async () => {
    expect(await canRead(WITH_MFA, { aal: "aal1" })).toBe(false);
    expect(await canRead(WITH_MFA, {})).toBe(false);
    expect(await canRead(WITH_MFA, { aal: "aal2" })).toBe(true);
  });

  test("OAuth tokens for Claude / ChatGPT are accepted", async () => {
    expect(await canRead(WITH_MFA, { aal: "aal1", client_id: "mcp-client" })).toBe(true);
  });
});
