import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0042: plan features enforced in the database, and periods written by the server only. */
const OWNER = "00000000-0000-4000-8000-0000000005a1";

let db: PGlite;
let ws: string;

const can = async (permission: string) =>
  (await asUser<{ ok: boolean }>(db, OWNER, "select private.has_workspace_permission($1, $2) as ok", [ws, permission])).rows[0]!.ok;

async function onboarding(status: string) {
  await db.query(
    "insert into public.workspace_onboarding (workspace_id, status) values ($1, $2) on conflict (workspace_id) do update set status = excluded.status",
    [ws, status],
  );
}

async function subscribe(code: string | null, addons: string[] = []) {
  await db.query("update public.subscriptions set status = 'cancelled' where workspace_id = $1", [ws]);
  if (!code) return;
  await db.query(
    "insert into public.subscriptions (workspace_id, plan_id, price, cycle, status, addons) select $1, id, 0, 'monthly', 'active', $3::jsonb from public.subscription_plans where code = $2",
    [ws, code, JSON.stringify(addons)],
  );
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'plan-limits@example.com')", [OWNER]);
  ws = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
});

afterAll(async () => {
  await db.close();
});

describe("plan limits in the database", () => {
  test("the free trial opens only the invoice check", async () => {
    await onboarding("pending_details");
    await subscribe(null);
    expect(await can("financials.read")).toBe(true);
    expect(await can("contracts.manage")).toBe(false);
    expect(await can("compensation.manage")).toBe(false);
    expect(await can("ai.use")).toBe(false);
    // Not tied to a plan feature: unchanged.
    expect(await can("imports.create")).toBe(true);
    expect(await can("periods.read")).toBe(true);
  });

  test("an active client without a plan keeps everything, as the app does", async () => {
    await onboarding("active");
    await subscribe(null);
    for (const permission of ["contracts.manage", "compensation.manage", "ai.use", "exceptions.manage"]) {
      expect(await can(permission)).toBe(true);
    }
  });

  test("النمو has contracts and exceptions but not compensation or AI, until the add-on", async () => {
    await onboarding("active");
    await subscribe("growth");
    expect(await can("contracts.manage")).toBe(true);
    expect(await can("exceptions.manage")).toBe(true);
    expect(await can("compensation.manage")).toBe(false);
    expect(await can("telegram.read")).toBe(false);
    expect(await can("ai.use")).toBe(false);

    await subscribe("growth", ["compensation_ai"]);
    expect(await can("compensation.manage")).toBe(true);
    expect(await can("ai.use")).toBe(true);
  });

  test("الشاملة has everything", async () => {
    await subscribe("unlimited");
    for (const permission of ["contracts.manage", "compensation.manage", "telegram.manage", "recovery.manage", "ai.use", "financials.read"]) {
      expect(await can(permission)).toBe(true);
    }
  });

  test("role rules still apply on top of the plan", async () => {
    const MEMBER = "00000000-0000-4000-8000-0000000005b1";
    await db.query("insert into auth.users (id, email) values ($1, 'viewer@example.com')", [MEMBER]);
    await db.query("insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, 'viewer', 'active')", [ws, MEMBER]);
    await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [ws, MEMBER]);
    const viewer = async (permission: string) =>
      (await asUser<{ ok: boolean }>(db, MEMBER, "select private.has_workspace_permission($1, $2) as ok", [ws, permission])).rows[0]!.ok;
    expect(await viewer("contracts.read")).toBe(true);
    expect(await viewer("contracts.manage")).toBe(false);
    expect(await viewer("imports.create")).toBe(false);
  });
});

describe("periods are written by the server only", () => {
  test("a member cannot insert or update a period directly, but can still read and delete", async () => {
    const insert = await asUser(db, OWNER, "insert into public.periods (workspace_id, user_id, platform, label, summary) values ($1, $2, 'keeta', 'forged', '{\"orders\": 999999}')", [ws, OWNER]);
    expect(insert.error).toContain("permission denied");

    const period = (
      await db.query<{ id: string }>("insert into public.periods (workspace_id, user_id, platform, label, summary) values ($1, $2, 'keeta', 'real', '{}') returning id", [ws, OWNER])
    ).rows[0]!.id;
    const update = await asUser(db, OWNER, "update public.periods set summary = '{\"orders\": 1}' where id = $1", [period]);
    expect(update.error).toContain("permission denied");

    const read = await asUser<{ id: string }>(db, OWNER, "select id from public.periods where id = $1", [period]);
    expect(read.rows).toEqual([{ id: period }]);
    const removed = await asUser(db, OWNER, "delete from public.periods where id = $1", [period]);
    expect(removed.error).toBeNull();
    expect(removed.affected).toBe(1);
  });
});
