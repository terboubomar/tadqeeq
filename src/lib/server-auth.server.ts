import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

import type { Database } from "@/integrations/supabase/types";

import {
  ROLE_PERMISSIONS,
  hasWorkspacePermission,
  roleHasGlobalBranchAccess,
  type WorkspacePermission,
  type WorkspaceRole,
} from "./workspace-access";

export type ServerUserClient = ReturnType<typeof createServerUserClient>;

export interface ServerUserAuth {
  accessToken: string;
  /** Authenticated person performing the action. */
  actorUserId: string;
  /**
   * Legacy data-owner user id.
   *
   * Existing Tadqeeq tables still carry user_id. During the workspace migration
   * this stays mapped to the workspace owner so existing engines and queries keep
   * working while workspace_id is the authorization boundary.
   */
  userId: string;
  workspaceId: string;
  workspaceName: string;
  membershipId: string;
  role: WorkspaceRole;
  permissions: readonly WorkspacePermission[];
  allowedBranchIds: string[];
  globalBranchAccess: boolean;
  client: ServerUserClient;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("إعدادات الخادم غير مكتملة.");
  }
  return value;
}

export function parseAuthorizationBearer(
  value: string | undefined | null,
): string {
  const match = (value?.trim() ?? "").match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى.");
  }
  return token;
}

export function createServerUserClient(accessToken: string) {
  return createClient<Database>(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_PUBLISHABLE_KEY"),
    {
      global: {
        headers: {
          Authorization: "Bearer " + accessToken,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

type WorkspaceMemberRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: "invited" | "active" | "suspended";
  created_at: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  owner_user_id: string;
};

async function loadWorkspaceContext(
  client: ServerUserClient,
  actorUserId: string,
): Promise<Omit<ServerUserAuth, "accessToken" | "client" | "actorUserId">> {
  // Generated Supabase types lag migrations during feature development.
  // Keep this cast isolated to the workspace boundary.
  const db = client as unknown as {
    // Workspace tables are introduced by migration 0026 before generated types refresh.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => any;
  };

  const [{ data: profile, error: profileError }, { data: memberships, error: memberError }] =
    await Promise.all([
      db
        .from("profiles")
        .select("active_workspace_id")
        .eq("id", actorUserId)
        .maybeSingle(),
      db
        .from("workspace_members")
        .select("id,workspace_id,user_id,role,status,created_at")
        .eq("user_id", actorUserId)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
    ]);

  if (profileError) throw new Error(profileError.message);
  if (memberError) throw new Error(memberError.message);

  const activeMemberships = (memberships ?? []) as WorkspaceMemberRow[];
  if (!activeMemberships.length) {
    throw new Error("لا يوجد حساب Tadqeeq نشط مرتبط بهذا المستخدم.");
  }

  const requestedWorkspaceId =
    typeof profile?.active_workspace_id === "string"
      ? profile.active_workspace_id
      : null;

  const membership =
    activeMemberships.find((item) => item.workspace_id === requestedWorkspaceId) ??
    activeMemberships.find((item) => item.role === "owner") ??
    activeMemberships[0];

  if (!membership) {
    throw new Error("تعذّر تحديد مساحة عمل Tadqeeq.");
  }

  const { data: workspace, error: workspaceError } = await db
    .from("workspaces")
    .select("id,name,owner_user_id")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (workspaceError) throw new Error(workspaceError.message);
  if (!workspace) {
    throw new Error("مساحة عمل Tadqeeq غير موجودة.");
  }

  const typedWorkspace = workspace as WorkspaceRow;

  if (requestedWorkspaceId !== membership.workspace_id) {
    const { error: updateError } = await db
      .from("profiles")
      .update({ active_workspace_id: membership.workspace_id })
      .eq("id", actorUserId);
    if (updateError) {
      console.error("Failed to persist active Tadqeeq workspace", updateError.message);
    }
  }

  const globalBranchAccess = roleHasGlobalBranchAccess(membership.role);
  let allowedBranchIds: string[] = [];

  if (!globalBranchAccess) {
    const { data: branchRows, error: branchError } = await db
      .from("workspace_member_branches")
      .select("branch_id")
      .eq("workspace_id", membership.workspace_id)
      .eq("workspace_member_id", membership.id);

    if (branchError) throw new Error(branchError.message);
    allowedBranchIds = (branchRows ?? [])
      .map((row: { branch_id?: string }) => row.branch_id)
      .filter((value: string | undefined): value is string => Boolean(value));
  }

  return {
    userId: typedWorkspace.owner_user_id,
    workspaceId: typedWorkspace.id,
    workspaceName: typedWorkspace.name,
    membershipId: membership.id,
    role: membership.role,
    permissions: ROLE_PERMISSIONS[membership.role],
    allowedBranchIds,
    globalBranchAccess,
  };
}

export async function requireServerUser(): Promise<ServerUserAuth> {
  const accessToken = parseAuthorizationBearer(
    getRequestHeader("authorization"),
  );
  const client = createServerUserClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user?.id) {
    throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى.");
  }

  const workspace = await loadWorkspaceContext(client, data.user.id);

  return {
    accessToken,
    actorUserId: data.user.id,
    client,
    ...workspace,
  };
}

export async function requireWorkspacePermission(
  permission: WorkspacePermission,
): Promise<ServerUserAuth> {
  const context = await requireServerUser();
  if (!hasWorkspacePermission(context.role, permission)) {
    throw new Error("ليس لديك صلاحية لتنفيذ هذا الإجراء.");
  }
  return context;
}

export function assertBranchAccess(
  context: Pick<ServerUserAuth, "globalBranchAccess" | "allowedBranchIds">,
  branchId: string | null | undefined,
): void {
  if (context.globalBranchAccess) return;
  if (!branchId || !context.allowedBranchIds.includes(branchId)) {
    throw new Error("ليس لديك صلاحية الوصول إلى هذا الفرع.");
  }
}
