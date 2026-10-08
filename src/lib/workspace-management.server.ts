import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { requireServerUserAnyStatus } from "./server-auth.server";
import type { WorkspaceRole } from "./workspace-access";

export interface AccountWorkspace {
  id: string;
  name: string;
  role: WorkspaceRole;
  active: boolean;
  /** The signed-in user owns this company (rather than being invited to it). */
  owned: boolean;
}

/** The database's refusals, in the words the person reads. */
const RPC_MESSAGES: Array<[RegExp, string]> = [
  [/active subscription is required/i, "إضافة شركة متاحة بعد تفعيل الاشتراك."],
  [/active account is required/i, "حسابك غير مفعّل حالياً. تواصل معنا لتفعيله ثم أضف الشركة."],
  [/workspace limit reached/i, "وصلت إلى حد الشركات في باقتك. رقِّ الباقة لإضافة المزيد."],
  [/name must be between/i, "اسم الشركة يجب أن يكون بين حرف و160 حرفاً."],
  [/not an active member/i, "لم تعد عضواً في هذه الشركة."],
  [/authentication required|profile not found/i, "انتهت الجلسة. سجّل الدخول من جديد."],
  [/could not find the function|schema cache/i, "الخدمة غير جاهزة بعد. حاول بعد قليل أو تواصل معنا."],
];

export function workspaceErrorMessage(message: string, fallback: string): string {
  return RPC_MESSAGES.find(([pattern]) => pattern.test(message))?.[1] ?? fallback;
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
      owned: row["role"] === "owner",
    }];
  });
}

export async function switchMyWorkspaceOnServer(workspaceId: string): Promise<string> {
  const auth = await requireServerUserAnyStatus();
  const { data, error } = await auth.client.rpc("switch_my_workspace", { p_workspace_id: workspaceId });
  if (error) throw new Error(workspaceErrorMessage(error.message, "تعذّر تغيير الشركة."));
  if (typeof data !== "string") throw new Error("تعذّر تغيير مساحة العمل.");
  return data;
}

export async function createAccountWorkspaceOnServer(name: string): Promise<string> {
  const auth = await requireServerUserAnyStatus();
  if (auth.role !== "owner") throw new Error("مالك الحساب فقط يمكنه إضافة شركة.");
  if (auth.trial || !auth.planId) throw new Error("إضافة شركة متاحة بعد تفعيل الاشتراك.");
  if (auth.workspaceLimit !== null && auth.workspaceCount >= auth.workspaceLimit) {
    throw new Error("وصلت إلى حد الشركات في باقتك. رقِّ الباقة لإضافة المزيد.");
  }
  const { data, error } = await auth.client.rpc("create_account_workspace", { p_name: name.trim() });
  if (error) throw new Error(workspaceErrorMessage(error.message, "تعذّر إنشاء الشركة."));
  if (typeof data !== "string") throw new Error("تعذّر إنشاء مساحة العمل.");
  return data;
}

/** Renames a company the signed-in user owns. */
export async function renameAccountWorkspaceOnServer(workspaceId: string, name: string): Promise<void> {
  const auth = await requireServerUserAnyStatus();
  const value = name.trim();
  if (value.length < 1 || value.length > 160) throw new Error("اسم الشركة يجب أن يكون بين حرف و160 حرفاً.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: workspace, error } = await db.from("workspaces").select("id,name,owner_user_id").eq("id", workspaceId).maybeSingle();
  if (error) throw new Error("تعذّر تغيير اسم الشركة.");
  if (!workspace || workspace.owner_user_id !== auth.actorUserId) throw new Error("مالك الشركة فقط يمكنه تغيير اسمها.");
  if (workspace.name === value) return;

  const { error: updateError } = await db.from("workspaces").update({ name: value }).eq("id", workspaceId);
  if (updateError) throw new Error("تعذّر تغيير اسم الشركة.");
  const { error: auditError } = await db.from("workspace_audit_events").insert({
    workspace_id: workspaceId,
    actor_user_id: auth.actorUserId,
    event_type: "workspace.renamed",
    entity_type: "workspace",
    entity_id: workspaceId,
    metadata: { from: workspace.name, to: value },
  });
  if (auditError) console.error("Failed to write workspace audit event", auditError.message);
}
