import { describe, expect, test } from "bun:test";

describe("workspace member administration", () => {
  test("invites users only through server-side Supabase admin after permission check", async () => {
    const server = await Bun.file("src/lib/workspace-admin.server.ts").text();
    expect(server).toContain('requireWorkspacePermission("users.manage")');
    expect(server).toContain("supabaseAdmin.auth.admin.inviteUserByEmail");
    expect(server).toContain("authUserByEmail");
    expect(server).toContain('event_type: eventType');
  });

  test("protects owner, self-role changes and branch assignments", async () => {
    const server = await Bun.file("src/lib/workspace-admin.server.ts").text();
    expect(server).toContain('if (target.role === "owner")');
    expect(server).toContain("target.user_id === context.actorUserId");
    expect(server).toContain('.eq("workspace_id", workspaceId)');
    expect(server).toContain('.eq("active", true)');
    expect(server).toContain("workspace_member_branches");
  });

  test("authenticated context keeps actor separate from legacy data owner", async () => {
    const auth = await Bun.file("src/lib/server-auth.server.ts").text();
    expect(auth).toContain("actorUserId");
    expect(auth).toContain("workspaceId");
    expect(auth).toContain("membershipId");
    expect(auth).toContain("allowedBranchIds");
    expect(auth).toContain("userId: typedWorkspace.owner_user_id");
    expect(auth).toContain("requireWorkspacePermission");
  });

  test("team and invite routes are registered and invite acceptance sets password", async () => {
    const tree = await Bun.file("src/routeTree.gen.ts").text();
    const invite = await Bun.file("src/routes/accept-invite.tsx").text();
    expect(tree).toContain("'/team'");
    expect(tree).toContain("'/accept-invite'");
    expect(invite).toContain("supabase.auth.updateUser({ password })");
  });

  test("client UI never imports the Supabase service role", async () => {
    const team = await Bun.file("src/routes/_authenticated/team.tsx").text();
    const provider = await Bun.file("src/components/WorkspaceAccessProvider.tsx").text();
    expect(team).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(provider).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(team).not.toContain("client.server");
  });
});
