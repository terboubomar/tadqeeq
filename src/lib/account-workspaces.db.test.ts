import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { asUser, createMigratedDatabase } from "../test-support/database";

const OWNER = "00000000-0000-4000-8000-000000005201";
let db: PGlite;
let first: string;

async function subscribe(code: "start" | "growth" | "unlimited") {
  await db.query("update public.workspace_onboarding set status = 'active', activated_at = now() where workspace_id = $1", [first]);
  await db.query("delete from public.subscriptions where workspace_id in (select id from public.workspaces where owner_user_id = $1)", [OWNER]);
  await db.query(
    "insert into public.subscriptions (workspace_id, plan_id, price, cycle, status) select $1, id, price, 'monthly', 'active' from public.subscription_plans where code = $2",
    [first, code],
  );
}

async function addWorkspace(name: string): Promise<string> {
  const workspace = await db.query<{ id: string }>("insert into public.workspaces (name, owner_user_id) values ($1, $2) returning id", [name, OWNER]);
  const id = workspace.rows[0]!.id;
  await db.query("insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, 'owner', 'active')", [id, OWNER]);
  await db.query("insert into public.workspace_onboarding (workspace_id, status, activated_at) values ($1, 'active', now())", [id]);
  return id;
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'workspace-owner@example.com')", [OWNER]);
  first = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
});

afterAll(async () => db.close());

describe("account workspace limits", () => {
  test("the account trial cannot create another workspace", async () => {
    const result = await asUser(db, OWNER, "select public.create_account_workspace('Trial extra')");
    expect(result.error).toContain("active subscription");
  });

  test("البداية includes only the initial workspace", async () => {
    await subscribe("start");
    const result = await asUser(db, OWNER, "select public.create_account_workspace('Start extra')");
    expect(result.error).toContain("Workspace limit reached");
  });

  test("النمو allows three total workspaces", async () => {
    await subscribe("growth");
    const success = await asUser<{ id: string }>(db, OWNER, "select public.create_account_workspace('Growth second') as id");
    expect(success.error).toBeNull();
    expect(typeof success.rows[0]!.id).toBe("string");

    await addWorkspace("Growth second");
    await addWorkspace("Growth third");
    const blocked = await asUser(db, OWNER, "select public.create_account_workspace('Growth fourth')");
    expect(blocked.error).toContain("Workspace limit reached");
  });

  test("الشاملة has no workspace limit", async () => {
    await subscribe("unlimited");
    const result = await asUser<{ id: string }>(db, OWNER, "select public.create_account_workspace('Unlimited extra') as id");
    expect(result.error).toBeNull();
    expect(typeof result.rows[0]!.id).toBe("string");
  });
});

describe("workspace separation", () => {
  test("the same platform period can exist in two companies but not twice in one", async () => {
    const second = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1 and id <> $2 order by created_at limit 1", [OWNER, first])).rows[0]!.id;
    const values = [OWNER, "2026-09-01", "2026-09-30"];
    await db.query("insert into public.periods (workspace_id, user_id, platform, label, period_start, period_end) values ($1, $2, 'hungerstation', 'September', $3, $4)", [first, ...values]);
    await db.query("insert into public.periods (workspace_id, user_id, platform, label, period_start, period_end) values ($1, $2, 'hungerstation', 'September', $3, $4)", [second, ...values]);
    await expect(db.query("insert into public.periods (workspace_id, user_id, platform, label, period_start, period_end) values ($1, $2, 'hungerstation', 'Duplicate', $3, $4)", [first, ...values])).rejects.toThrow();
  });

  test("only the selected workspace exposes its periods", async () => {
    await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [first, OWNER]);
    const result = await asUser<{ workspace_id: string }>(db, OWNER, "select workspace_id from public.periods");
    expect(result.error).toBeNull();
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.workspace_id === first)).toBe(true);
  });

  test("the account plan reports the shared workspace allowance", async () => {
    await subscribe("growth");
    const result = await asUser<{ plan: Record<string, unknown> }>(db, OWNER, "select public.my_workspace_plan($1) as plan", [first]);
    expect(result.error).toBeNull();
    expect(result.rows[0]!.plan["workspace_limit"]).toBe(3);
    expect(result.rows[0]!.plan["workspace_count"]).toBeGreaterThanOrEqual(3);
  });
});
