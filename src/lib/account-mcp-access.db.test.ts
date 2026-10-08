import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0053: Claude/ChatGPT access follows the account's subscription in every company it owns. */
const OWNER = "00000000-0000-4000-8000-0000000053a1";
const STRANGER = "00000000-0000-4000-8000-0000000053b1";

let db: PGlite;
let first: string;
let second: string;

const access = async (user: string) =>
  (await asUser<{ a: Record<string, unknown> }>(db, user, "select public.mcp_access() as a")).rows[0]!.a;

async function subscribe(workspaceId: string, code: string) {
  await db.query("update public.subscriptions set status = 'cancelled' where workspace_id = $1", [workspaceId]);
  await db.query(
    "insert into public.subscriptions (workspace_id, plan_id, price, cycle, status, addons) select $1, id, 799, 'monthly', 'active', '[]'::jsonb from public.subscription_plans where code = $2",
    [workspaceId, code],
  );
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  for (const [id, email] of [[OWNER, "acc-owner@example.com"], [STRANGER, "acc-stranger@example.com"]] as const) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }
  await activateAllWorkspaces(db);
  first = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
  await subscribe(first, "unlimited");
  // A second company, created the way the app does it, becomes the active workspace.
  await db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [OWNER]);
    await tx.exec("set local role authenticated");
    second = (await tx.query<{ id: string }>("select public.create_account_workspace('الشركة الثانية') as id")).rows[0]!.id;
  });
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("mcp_access across the account's companies", () => {
  test("a second company uses the plan stored on the first one", async () => {
    expect(second).not.toBe(first);
    expect(await access(OWNER)).toMatchObject({ workspace_id: second, plan_code: "unlimited", allowed: true, reason: null });
  });

  test("another account's subscription never counts", async () => {
    const strangerWs = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [STRANGER])).rows[0]!.id;
    await subscribe(strangerWs, "growth");
    expect(await access(STRANGER)).toMatchObject({ plan_code: "growth", allowed: false, reason: "plan" });
    expect(await access(OWNER)).toMatchObject({ plan_code: "unlimited", allowed: true });
  });

  test("a suspended company is closed even when the account's plan allows it", async () => {
    await db.query("update public.workspace_onboarding set status = 'suspended' where workspace_id = $1", [second]);
    expect(await access(OWNER)).toMatchObject({ allowed: false, reason: "suspended" });
    await db.query("update public.workspace_onboarding set status = 'active' where workspace_id = $1", [second]);
  });
});
