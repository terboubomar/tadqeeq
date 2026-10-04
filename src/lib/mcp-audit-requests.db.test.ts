import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0040: MCP access by plan, and audit requests opened from an AI assistant. */
const OWNER = "00000000-0000-4000-8000-0000000004a1";
const OTHER = "00000000-0000-4000-8000-0000000004b1";

let db: PGlite;
let ws: string;
let otherWs: string;

const access = async (user: string) =>
  (await asUser<{ a: Record<string, unknown> }>(db, user, "select public.mcp_access() as a")).rows[0]!.a;

/** Runs one statement as a signed-in user and keeps its writes (asUser always rolls back). */
async function asUserCommitted<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    await tx.exec("set local role authenticated");
    return (await tx.query<T>(sql, params)).rows;
  });
}

async function subscribe(workspaceId: string, code: string) {
  await db.query("update public.subscriptions set status = 'cancelled' where workspace_id = $1", [workspaceId]);
  await db.query(
    "insert into public.subscriptions (workspace_id, plan_id, price, cycle, status) select $1, id, 799, 'monthly', 'active' from public.subscription_plans where code = $2",
    [workspaceId, code],
  );
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  for (const [id, email] of [[OWNER, "mcp-owner@example.com"], [OTHER, "mcp-other@example.com"]] as const) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }
  ws = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
  otherWs = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OTHER])).rows[0]!.id;
});

afterAll(async () => {
  await db.close();
});

describe("mcp_access", () => {
  test("is closed during the trial, on other plans and while suspended", async () => {
    await db.query("insert into public.workspace_onboarding (workspace_id, status) values ($1, 'pending_details') on conflict (workspace_id) do update set status = 'pending_details'", [ws]);
    expect(await access(OWNER)).toMatchObject({ email: "mcp-owner@example.com", workspace_id: ws, role: "owner", allowed: false, reason: "trial" });

    await db.query("update public.workspace_onboarding set status = 'active' where workspace_id = $1", [ws]);
    await subscribe(ws, "growth");
    expect(await access(OWNER)).toMatchObject({ plan_code: "growth", allowed: false, reason: "plan" });

    await subscribe(ws, "unlimited");
    expect(await access(OWNER)).toMatchObject({ plan_code: "unlimited", plan_name: "الشاملة", allowed: true, reason: null });

    await db.query("update public.workspace_onboarding set status = 'suspended' where workspace_id = $1", [ws]);
    expect(await access(OWNER)).toMatchObject({ allowed: false, reason: "suspended" });
    await db.query("update public.workspace_onboarding set status = 'active' where workspace_id = $1", [ws]);
  });
});

describe("audit requests", () => {
  test("only الشاملة can open one, and the period completes it", async () => {
    const id = (await asUserCommitted<{ id: string }>(OWNER, "select public.mcp_create_audit_request('hungerstation', 1.8, ' سبتمبر ') as id"))[0]!.id;

    const own = await asUser<{ platform: string; bank_fee_pct: string; label: string; status: string }>(db, OWNER, "select platform, bank_fee_pct, label, status from public.mcp_audit_requests where id = $1", [id]);
    expect(own.rows).toEqual([{ platform: "hungerstation", bank_fee_pct: "1.8", label: "سبتمبر", status: "pending" }]);

    // Another company cannot see or complete it.
    expect((await asUser(db, OTHER, "select id from public.mcp_audit_requests where id = $1", [id])).rows).toEqual([]);
    const blocked = await asUser(db, OTHER, "select public.mcp_create_audit_request('keeta', null, null)");
    expect(blocked.error).toContain("MCP not available");

    const period = (
      await db.query<{ id: string }>(
        "insert into public.periods (workspace_id, user_id, platform, label, summary) values ($1, $2, 'hungerstation', 'p', '{}') returning id",
        [ws, OWNER],
      )
    ).rows[0]!.id;
    const wrongPlatform = (
      await db.query<{ id: string }>(
        "insert into public.periods (workspace_id, user_id, platform, label, summary) values ($1, $2, 'keeta', 'k', '{}') returning id",
        [ws, OWNER],
      )
    ).rows[0]!.id;
    const done = async (user: string, periodId: string) =>
      (await asUserCommitted<{ ok: boolean }>(user, "select public.mcp_complete_audit_request($1, $2) as ok", [id, periodId]))[0]!.ok;

    expect(await done(OTHER, period)).toBe(false);
    expect(await done(OWNER, wrongPlatform)).toBe(false);
    expect(await done(OWNER, period)).toBe(true);
    expect(await done(OWNER, period)).toBe(false);

    const after = await asUser<{ status: string; period_id: string }>(db, OWNER, "select status, period_id from public.mcp_audit_requests where id = $1", [id]);
    expect(after.rows).toEqual([{ status: "completed", period_id: period }]);
  });

  test("expired requests cannot be completed", async () => {
    const id = (await asUserCommitted<{ id: string }>(OWNER, "select public.mcp_create_audit_request('jahez', null, null) as id"))[0]!.id;
    await db.query("update public.mcp_audit_requests set expires_at = now() - interval '1 minute' where id = $1", [id]);
    const period = (
      await db.query<{ id: string }>("insert into public.periods (workspace_id, user_id, platform, label, summary) values ($1, $2, 'jahez', 'j', '{}') returning id", [ws, OWNER])
    ).rows[0]!.id;
    const { rows } = await asUser<{ ok: boolean }>(db, OWNER, "select public.mcp_complete_audit_request($1, $2) as ok", [id, period]);
    expect(rows[0]!.ok).toBe(false);
    expect(otherWs).toBeTruthy();
  });
});
