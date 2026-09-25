import { describe, expect, test } from "bun:test";

const read = (path: string) => Bun.file(path).text();

describe("workspace RBAC workflow", () => {
  test("keeps authorization in server-controlled membership data", async () => {
    const auth = await read("src/lib/server-auth.server.ts");
    const access = await read("src/lib/workspace-access.ts");

    expect(auth).toContain('.from("workspace_members")');
    expect(auth).toContain('.eq("status", "active")');
    expect(auth).toContain("actorUserId");
    expect(auth).toContain("workspaceId");
    expect(access).toContain("ROLE_PERMISSIONS");
    expect(access).not.toContain("user_metadata");
  });

  test("invites users only through server-side Supabase admin", async () => {
    const source = await read("src/lib/workspace-admin.server.ts");

    expect(source).toContain("auth.admin.inviteUserByEmail");
    expect(source).toContain("auth.admin.listUsers");
    expect(source).toContain('requireWorkspacePermission("users.manage")');
    expect(source).toContain('target.role === "owner"');
    expect(source).toContain("target.user_id === context.actorUserId");
  });

  test("migration creates workspace isolation and hardened helper functions", async () => {
    const sql = await read("drizzle/migrations/0026_workspace_rbac.sql");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workspaces");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workspace_members");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workspace_member_branches");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workspace_audit_events");
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain("REVOKE ALL ON FUNCTION private.has_workspace_permission");
    expect(sql).toContain("private.can_access_branch");
    expect(sql).toContain("private.can_access_telegram_evidence_object");
    expect(sql).toContain("WITH CHECK");
  });

  test("Telegram evidence persists workspace and canonical branch ids", async () => {
    const webhook = await read("src/lib/telegram-webhook.server.ts");
    const compensation = await read("src/lib/compensation-evidence.server.ts");

    expect(webhook).toContain("workspace_id: connection.workspace_id");
    expect(webhook).toContain("branch_id: connection.branch_id");
    expect(compensation).toContain("branch_id: branchId");
    expect(compensation).toContain("period.platform !== input.platform");
  });

  test("client navigation and server functions both enforce permissions", async () => {
    const shell = await read("src/components/AppShell.tsx");
    const functions = await read("src/lib/compensation-evidence.functions.ts");

    expect(shell).toContain("ROUTE_PERMISSIONS");
    expect(shell).toContain("routeDenied");
    expect(functions).toContain('requireWorkspacePermission("compensation.manage")');
    expect(functions).toContain('requireWorkspacePermission("telegram.manage")');
  });
});
