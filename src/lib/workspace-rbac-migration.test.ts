import { describe, expect, test } from "bun:test";

async function migration() {
  return Bun.file("drizzle/migrations/0026_workspace_rbac.sql").text();
}

describe("workspace RBAC migration", () => {
  test("creates workspace membership and audit structures", async () => {
    const sql = await migration();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workspaces");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workspace_members");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workspace_member_branches");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workspace_audit_events");
    expect(sql).toContain("active_workspace_id");
  });

  test("keeps authorization helpers private and revokes public execution", async () => {
    const sql = await migration();
    expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS private");
    expect(sql).toContain("REVOKE ALL ON SCHEMA private FROM PUBLIC");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION private.has_workspace_permission");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION private.has_workspace_permission(uuid,text) FROM PUBLIC",
    );
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION private.has_workspace_permission(uuid,text) TO authenticated");
  });

  test("enforces workspace owner identity on legacy user_id rows", async () => {
    const sql = await migration();
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS workspaces_id_owner_key");
    expect(sql).toContain("FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspaces(id, owner_user_id)");
    expect(sql).toContain("owner_tables text[] := ARRAY[");
    expect(sql).toContain("'periods'");
    expect(sql).toContain("'telegram_order_evidence'");
    expect(sql).toContain("'compensation_cases'");
  });

  test("protects active workspace selection and branch-scoped compensation", async () => {
    const sql = await migration();
    expect(sql).toContain("CREATE POLICY profile_self_update");
    expect(sql).toContain("wm.user_id = (select auth.uid())");
    expect(sql).toContain("wm.status = 'active'");
    expect(sql).toContain("CREATE POLICY compensation_cases_workspace_select");
    expect(sql).toContain("private.can_access_branch(workspace_id, branch_id)");
    expect(sql).toContain("CREATE POLICY telegram_order_evidence_workspace_select");
  });

  test("removes anonymous table access and keeps service-role server access", async () => {
    const sql = await migration();
    expect(sql).toContain("REVOKE ALL ON public.workspaces FROM anon, authenticated");
    expect(sql).toContain("GRANT SELECT ON public.workspaces TO authenticated");
    expect(sql).toContain("GRANT ALL ON public.workspaces TO service_role");
    expect(sql).toContain("REVOKE ALL ON public.telegram_order_evidence FROM anon, authenticated");
  });

  test("does not authorize from editable user metadata", async () => {
    const sql = await migration();
    expect(sql).not.toContain("auth.jwt() -> 'user_metadata'");
    expect(sql).not.toContain('auth.jwt() ->> "user_role"');
  });

  test("migration is registered in the drizzle journal", async () => {
    const journal = JSON.parse(
      await Bun.file("drizzle/migrations/meta/_journal.json").text(),
    ) as { entries: Array<{ idx: number; tag: string }> };
    const entry = journal.entries.find((item) => item.tag === "0026_workspace_rbac");
    expect(entry).toBeDefined();
    expect(entry?.idx).toBe(26);
  });
});
