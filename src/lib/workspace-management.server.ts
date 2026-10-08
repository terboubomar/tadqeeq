import { requireServerUserAnyStatus } from "./server-auth.server";
import type { WorkspaceRole } from "./workspace-access";

export interface AccountWorkspace {
  id: string;
  name: string;
  role: WorkspaceRole;
  active: boolean;
}

export async function listMyWorkspacesOnServer(): Promise<AccountWorkspace[]> {
  const auth = await requireServerUserAnyStatus();
  const { data: memberships, error } = await auth.client
    .from("workspace_members")
    .select("workspace_id,role,workspaces(id,name)")
    .eq("user_id", auth.actorUserId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (memberships ?? []).flatMap((row: Record<string, unknown>) => {
    const workspace = row["workspaces"] as { id?: string; name?: string } | null;
    if (!workspace?.id || !workspace.name) return [];
    return [{
      id: workspace.id,
      name: workspace.name,
      role: row["role"] as WorkspaceRole,
      active: workspace.id === auth.workspaceId,
    }];
  });
}

export async function switchMyWorkspaceOnServer(workspaceId: string): Promise<string> {
  const auth = await requireServerUserAnyStatus();
  const { data, error } = await auth.client.rpc("switch_my_workspace", { p_workspace_id: workspaceId });
  if (error) throw new Error(error.message);
  if (typeof data !== "string") throw new Error("تعذّر تغيير مساحة العمل.");
  return data;
}

export async function createAccountWorkspaceOnServer(name: string): Promise<string> {
  const auth = await requireServerUserAnyStatus();
  if (auth.role !== "owner") throw new Error("مالك الحساب فقط يمكنه إضافة شركة.");
  if (auth.trial || !auth.planId) throw new Error("إضافة شركة متاحة بعد تفعيل الاشتراك.");
  if (auth.workspaceLimit !== null && auth.workspaceCount >= auth.workspaceLimit) {
    throw new Error("وصلت إلى حد مساحات العمل في باقتك.");
  }
  const { data, error } = await auth.client.rpc("create_account_workspace", { p_name: name.trim() });
  if (error) throw new Error(error.message);
  if (typeof data !== "string") throw new Error("تعذّر إنشاء مساحة العمل.");
  return data;
}
