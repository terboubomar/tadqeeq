
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  ASSIGNABLE_WORKSPACE_ROLES,
  roleHasGlobalBranchAccess,
  type WorkspaceRole,
} from "./workspace-access";
import { getPublicOrigin } from "./public-origin.server";
import { requireWorkspacePermission } from "./server-auth.server";

export interface WorkspaceBranchOption {
  id: string;
  name: string;
  active: boolean;
}

export interface WorkspaceMemberRecord {
  id: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: WorkspaceRole;
  status: "invited" | "active" | "suspended";
  branchIds: string[];
  joinedAt: string | null;
  createdAt: string;
  isCurrentUser: boolean;
}

export interface WorkspaceMembersBundle {
  members: WorkspaceMemberRecord[];
  branches: WorkspaceBranchOption[];
}

export interface InviteWorkspaceMemberInput {
  fullName: string;
  email: string;
  password?: string;
  role: Exclude<WorkspaceRole, "owner">;
  branchIds: string[];
}

export interface UpdateWorkspaceMemberInput {
  membershipId: string;
  role: Exclude<WorkspaceRole, "owner">;
  status: "active" | "suspended";
  branchIds: string[];
}

function adminDb() {
  // New workspace tables are introduced in the feature migration before generated
  // Supabase types are refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

async function validateBranches(
  workspaceId: string,
  role: WorkspaceRole,
  branchIds: string[],
): Promise<string[]> {
  if (roleHasGlobalBranchAccess(role)) return [];

  const unique = Array.from(new Set(branchIds));
  if (!unique.length) {
    throw new Error("اختر فرعاً واحداً على الأقل لهذا الدور.");
  }

  const { data, error } = await adminDb()
    .from("branch_registry")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .in("id", unique);

  if (error) throw new Error(error.message);
  const valid = (data ?? []).map((row: { id: string }) => row.id);
  if (valid.length !== unique.length) {
    throw new Error("أحد الفروع المحددة غير صالح لهذه الشركة.");
  }
  return unique;
}

async function setMemberBranches(
  workspaceId: string,
  membershipId: string,
  branchIds: string[],
): Promise<void> {
  const db = adminDb();
  const { error: deleteError } = await db
    .from("workspace_member_branches")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("workspace_member_id", membershipId);
  if (deleteError) throw new Error(deleteError.message);

  if (!branchIds.length) return;

  const { error: insertError } = await db
    .from("workspace_member_branches")
    .insert(
      branchIds.map((branchId) => ({
        workspace_id: workspaceId,
        workspace_member_id: membershipId,
        branch_id: branchId,
      })),
    );
  if (insertError) throw new Error(insertError.message);
}

async function auditAdminAction(
  workspaceId: string,
  actorUserId: string,
  eventType: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await adminDb().from("workspace_audit_events").insert({
    workspace_id: workspaceId,
    actor_user_id: actorUserId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
  if (error) {
    console.error("Failed to write workspace audit event", error.message);
  }
}

async function authUserByEmail(email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === target,
    );
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

function inviteRedirectUrl(): string | undefined {
  let origin: string | null = null;
  try {
    // Invites may use the admin's own origin when TADQEEQ_PUBLIC_URL is not set.
    origin = getPublicOrigin({ allowRequestOriginInProduction: true });
  } catch (error) {
    console.error("Invalid TADQEEQ_PUBLIC_URL", error);
  }
  return origin ? new URL("/accept-invite", origin).toString() : undefined;
}

export async function listWorkspaceMembersOnServer(): Promise<WorkspaceMembersBundle> {
  const context = await requireWorkspacePermission("users.manage");
  const db = adminDb();

  const [
    { data: members, error: membersError },
    { data: branches, error: branchesError },
  ] = await Promise.all([
    db
      .from("workspace_members")
      .select("id,user_id,role,status,joined_at,created_at")
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: true }),
    db
      .from("branch_registry")
      .select("id,name,active")
      .eq("workspace_id", context.workspaceId)
      .order("name", { ascending: true }),
  ]);

  if (membersError) throw new Error(membersError.message);
  if (branchesError) throw new Error(branchesError.message);

  const memberRows = (members ?? []) as Array<{
    id: string;
    user_id: string;
    role: WorkspaceRole;
    status: "invited" | "active" | "suspended";
    joined_at: string | null;
    created_at: string;
  }>;
  const userIds = memberRows.map((row) => row.user_id);
  const membershipIds = memberRows.map((row) => row.id);

  const [
    { data: profiles, error: profilesError },
    { data: scopes, error: scopesError },
  ] = await Promise.all([
    userIds.length
      ? db
          .from("profiles")
          .select("id,full_name,email")
          .in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    membershipIds.length
      ? db
          .from("workspace_member_branches")
          .select("workspace_member_id,branch_id")
          .eq("workspace_id", context.workspaceId)
          .in("workspace_member_id", membershipIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesError) throw new Error(profilesError.message);
  if (scopesError) throw new Error(scopesError.message);

  const profileRows = (profiles ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
  }>;
  const profileMap = new Map<
    string,
    { id: string; full_name: string | null; email: string | null }
  >(profileRows.map((row) => [row.id, row]));
  const branchesByMember = new Map<string, string[]>();
  for (const row of scopes ?? []) {
    const typed = row as { workspace_member_id: string; branch_id: string };
    const current = branchesByMember.get(typed.workspace_member_id) ?? [];
    current.push(typed.branch_id);
    branchesByMember.set(typed.workspace_member_id, current);
  }

  return {
    members: memberRows.map((row) => {
      const profile = profileMap.get(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        fullName: profile?.full_name ?? null,
        email: profile?.email ?? null,
        role: row.role,
        status: row.status,
        branchIds: branchesByMember.get(row.id) ?? [],
        joinedAt: row.joined_at,
        createdAt: row.created_at,
        isCurrentUser: row.user_id === context.actorUserId,
      };
    }),
    branches: (branches ?? []) as WorkspaceBranchOption[],
  };
}

export async function inviteWorkspaceMemberOnServer(
  input: InviteWorkspaceMemberInput,
): Promise<void> {
  const context = await requireWorkspacePermission("users.manage");

  if (!ASSIGNABLE_WORKSPACE_ROLES.includes(input.role)) {
    throw new Error("الدور المحدد غير مسموح.");
  }

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email || !fullName) {
    throw new Error("الاسم والبريد الإلكتروني مطلوبان.");
  }

  const branchIds = await validateBranches(
    context.workspaceId,
    input.role,
    input.branchIds,
  );

  let authUser = await authUserByEmail(email);
  const invited = false;
  let isNewUser = false;

  if (!authUser) {
    if (!input.password || input.password.length < 8) {
      throw new Error("كلمة المرور مطلوبة (8 أحرف على الأقل).");
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, tadqeeq_invited: true },
    });
    if (error || !data.user) {
      throw new Error(error?.message || "تعذّر إنشاء المستخدم.");
    }
    authUser = data.user;
    isNewUser = true;
  }

  const db = adminDb();
  const { data: existing, error: existingError } = await db
    .from("workspace_members")
    .select("id,status")
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) {
    throw new Error("هذا المستخدم مرتبط بالفعل بحساب الشركة.");
  }

  // A new user starts in this company. Someone who already has an account keeps their name and
  // the company they are working in; this one appears in their company switcher.
  await db.from("profiles").upsert(
    {
      id: authUser.id,
      full_name: fullName,
      email,
      active_workspace_id: context.workspaceId,
    },
    { onConflict: "id", ignoreDuplicates: !isNewUser },
  );

  const { data: membership, error: memberError } = await db
    .from("workspace_members")
    .insert({
      workspace_id: context.workspaceId,
      user_id: authUser.id,
      role: input.role,
      status: "active",
      invited_by: context.actorUserId,
      joined_at: invited ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (memberError) throw new Error(memberError.message);

  await setMemberBranches(context.workspaceId, membership.id, branchIds);
  await auditAdminAction(
    context.workspaceId,
    context.actorUserId,
    "user_invited",
    "workspace_member",
    membership.id,
    { email, role: input.role, branchIds, invited },
  );
}

export async function updateWorkspaceMemberOnServer(
  input: UpdateWorkspaceMemberInput,
): Promise<void> {
  const context = await requireWorkspacePermission("users.manage");
  const db = adminDb();

  const { data: target, error } = await db
    .from("workspace_members")
    .select("id,user_id,role,status,joined_at")
    .eq("id", input.membershipId)
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!target) throw new Error("المستخدم غير موجود.");
  if (target.role === "owner") {
    throw new Error("لا يمكن تعديل المالك من هذه الشاشة.");
  }
  if (target.user_id === context.actorUserId) {
    throw new Error("لا يمكنك تغيير دورك أو إيقاف حسابك بنفسك.");
  }
  if (!ASSIGNABLE_WORKSPACE_ROLES.includes(input.role)) {
    throw new Error("الدور المحدد غير مسموح.");
  }

  const branchIds = await validateBranches(
    context.workspaceId,
    input.role,
    input.branchIds,
  );

  const { error: updateError } = await db
    .from("workspace_members")
    .update({
      role: input.role,
      status: input.status,
      updated_at: new Date().toISOString(),
      ...(input.status === "active" && target.status !== "active" && !target.joined_at
        ? { joined_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", target.id)
    .eq("workspace_id", context.workspaceId);

  if (updateError) throw new Error(updateError.message);

  await setMemberBranches(context.workspaceId, target.id, branchIds);
  await auditAdminAction(
    context.workspaceId,
    context.actorUserId,
    input.status === "suspended" ? "user_suspended" : "user_access_changed",
    "workspace_member",
    target.id,
    {
      beforeRole: target.role,
      role: input.role,
      beforeStatus: target.status,
      status: input.status,
      branchIds,
    },
  );
}

export async function removeWorkspaceMemberOnServer(
  membershipId: string,
): Promise<void> {
  const context = await requireWorkspacePermission("users.manage");
  const db = adminDb();

  const { data: target, error } = await db
    .from("workspace_members")
    .select("id,user_id,role")
    .eq("id", membershipId)
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!target) throw new Error("المستخدم غير موجود.");
  if (target.role === "owner") {
    throw new Error("لا يمكن إزالة المالك.");
  }
  if (target.user_id === context.actorUserId) {
    throw new Error("لا يمكنك إزالة عضويتك بنفسك.");
  }

  const { error: deleteError } = await db
    .from("workspace_members")
    .delete()
    .eq("id", target.id)
    .eq("workspace_id", context.workspaceId);
  if (deleteError) throw new Error(deleteError.message);

  const { data: profile } = await db
    .from("profiles")
    .select("active_workspace_id")
    .eq("id", target.user_id)
    .maybeSingle();

  if (profile?.active_workspace_id === context.workspaceId) {
    await db
      .from("profiles")
      .update({ active_workspace_id: null })
      .eq("id", target.user_id);
  }

  await auditAdminAction(
    context.workspaceId,
    context.actorUserId,
    "user_removed",
    "workspace_member",
    target.id,
    { userId: target.user_id, role: target.role },
  );
}

export async function setWorkspaceMemberPasswordOnServer(
  membershipId: string,
  password: string,
): Promise<void> {
  const context = await requireWorkspacePermission("users.manage");
  if (!password || password.length < 8) {
    throw new Error("كلمة المرور مطلوبة (8 أحرف على الأقل).");
  }
  const db = adminDb();
  const { data: target, error } = await db
    .from("workspace_members")
    .select("id,user_id,role")
    .eq("id", membershipId)
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!target) throw new Error("المستخدم غير موجود.");
  if (target.role === "owner") throw new Error("لا يمكن تغيير كلمة مرور المالك من هنا.");

  const { count } = await db
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", target.user_id)
    .neq("workspace_id", context.workspaceId);
  if ((count ?? 0) > 0) {
    throw new Error("هذا المستخدم مرتبط بشركة أخرى — لا يمكن تغيير كلمة مروره.");
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    target.user_id,
    { password, email_confirm: true },
  );
  if (updateError) throw new Error(updateError.message);

  await auditAdminAction(
    context.workspaceId,
    context.actorUserId,
    "user_password_set",
    "workspace_member",
    target.id,
    { userId: target.user_id },
  );
}
