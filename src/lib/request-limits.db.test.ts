import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0043: MCP link limit per hour, and no auto-created company for staff or removed members. */
const OLD_ACCOUNT = "00000000-0000-4000-8000-0000000043a1";
const OPS = "00000000-0000-4000-8000-0000000043b1";
const ADMIN = "00000000-0000-4000-8000-0000000043c1";
const REMOVED = "00000000-0000-4000-8000-0000000043d1";
const OWNER = "00000000-0000-4000-8000-0000000043e1";

let db: PGlite;

const ensure = async (user: string) =>
  (await asUser<{ ws: string | null }>(db, user, "select public.ensure_my_workspace() as ws")).rows[0]!.ws;

beforeAll(async () => {
  db = await createMigratedDatabase();
  for (const id of [OLD_ACCOUNT, OPS, ADMIN, REMOVED, OWNER]) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id.slice(-4)}@example.com`]);
  }
  // Accounts without any company membership.
  await db.query("delete from public.workspace_members where user_id = any($1::uuid[])", [[OLD_ACCOUNT, OPS, ADMIN, REMOVED]]);
  await db.query("insert into public.ops_staff (user_id, role) values ($1, 'support')", [OPS]);
  await db.query("insert into public.platform_admins (user_id) values ($1)", [ADMIN]);
  const ownerWs = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
  await db.query(
    "insert into public.workspace_audit_events (workspace_id, actor_user_id, event_type, entity_type, metadata) values ($1, $2, 'user_removed', 'workspace_member', $3::jsonb)",
    [ownerWs, OWNER, JSON.stringify({ userId: REMOVED, role: "viewer" })],
  );
});

afterAll(async () => {
  await db.close();
});

describe("ensure_my_workspace", () => {
  test("still creates a company for an older account without one", async () => {
    expect(await ensure(OLD_ACCOUNT)).toBeTruthy();
  });

  test("skips ops staff, platform admins and removed members", async () => {
    expect(await ensure(OPS)).toBeNull();
    expect(await ensure(ADMIN)).toBeNull();
    expect(await ensure(REMOVED)).toBeNull();
  });

  test("does nothing for a user who already has a company", async () => {
    expect(await ensure(OWNER)).toBeNull();
  });
});

describe("mcp_create_audit_request", () => {
  test("allows at most 30 links per company per hour", async () => {
    await activateAllWorkspaces(db);
    const ws = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
    await db.query(
      "insert into public.subscriptions (workspace_id, plan_id, price, cycle, status) select $1, id, 799, 'monthly', 'active' from public.subscription_plans where code = 'unlimited'",
      [ws],
    );
    const create = () => asUser<{ id: string }>(db, OWNER, "select public.mcp_create_audit_request('keeta', null, null) as id");

    await db.query(
      "insert into public.mcp_audit_requests (workspace_id, user_id, platform, created_at) select $1, $2, 'keeta', now() - interval '2 hours' from generate_series(1, 40)",
      [ws, OWNER],
    );
    expect((await create()).error).toBeNull();

    await db.query(
      "insert into public.mcp_audit_requests (workspace_id, user_id, platform) select $1, $2, 'keeta' from generate_series(1, 30)",
      [ws, OWNER],
    );
    expect((await create()).error).toContain("Too many audit links");
  });
});
