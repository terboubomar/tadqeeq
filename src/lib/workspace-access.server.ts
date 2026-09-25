import { requireServerUser } from "./server-auth.server";
import type { WorkspacePermission, WorkspaceRole } from "./workspace-access";

export interface WorkspaceClientContext {
  actorUserId: string;
  dataOwnerUserId: string;
  workspaceId: string;
  workspaceName: string;
  membershipId: string;
  role: WorkspaceRole;
  permissions: readonly WorkspacePermission[];
  allowedBranchIds: string[];
  globalBranchAccess: boolean;
  fullName: string | null;
  email: string | null;
  onboardingStatus: string;
  isPlatformAdmin: boolean;
}

export async function getMyWorkspaceContextOnServer(): Promise<WorkspaceClientContext> {
  const context = await requireServerUser();
  const { data: profile, error } = await context.client
    .from("profiles")
    .select("full_name,email")
    .eq("id", context.actorUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    actorUserId: context.actorUserId,
    dataOwnerUserId: context.userId,
    workspaceId: context.workspaceId,
    workspaceName: context.workspaceName,
    membershipId: context.membershipId,
    role: context.role,
    permissions: context.permissions,
    allowedBranchIds: context.allowedBranchIds,
    globalBranchAccess: context.globalBranchAccess,
    fullName: profile?.full_name ?? null,
    email: profile?.email ?? null,
    onboardingStatus: context.onboardingStatus,
    isPlatformAdmin: context.isPlatformAdmin,
  };
}
