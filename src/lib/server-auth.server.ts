import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

import type { Database } from "@/integrations/supabase/types";

import {
  ROLE_PERMISSIONS,
  roleHasGlobalBranchAccess,
  type WorkspacePermission,
  type WorkspaceRole,
} from "./workspace-access";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { logEvent } from "./observability";
import {
  featuresWithAddons,
  isPlanAddon,
  isPlanFeature,
  isTrialStatus,
  resolvePlanAccess,
  TRIAL_UPLOAD_EVENT,
  type PlanAddon,
  type PlanFeature,
} from "./plans";

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
  onboardingStatus: string;
  isPlatformAdmin: boolean;
  planName: string | null;
  planFeatures: PlanFeature[] | null;
  uploadLimit: number | null;
  /** Uploads counted against uploadLimit: this month on a plan, all-time during the trial. */
  uploadsThisMonth: number;
  /** Orders the plan is sized for each month (soft: never blocks an upload); null = no limit. */
  orderLimit: number | null;
  /** Orders in the latest month the company's current data covers, all platforms together. */
  monthlyOrders: number;
  /** That month (YYYY-MM-01), or null before any upload. */
  ordersMonth: string | null;
  addons: PlanAddon[];
  /** Signed up but not activated yet: runs as a free trial limited to analysis. */
  trial: boolean;
  /** Allowed by the member's role but closed by the plan or trial. */
  planLockedPermissions: readonly WorkspacePermission[];
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

  const rpc = client as unknown as {
    rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
  };
  const [{ data: onboardingRow }, { data: adminFlag }, { data: planData }] = await Promise.all([
    db
      .from("workspace_onboarding")
      .select("status")
      .eq("workspace_id", typedWorkspace.id)
      .maybeSingle(),
    rpc.rpc("is_platform_admin"),
    rpc.rpc("my_workspace_plan", { p_workspace_id: typedWorkspace.id }),
  ]);

  const plan = (planData ?? {}) as Record<string, unknown>;
  const rawFeatures = plan["features"];
  const addons = Array.isArray(plan["addons"]) ? plan["addons"].filter(isPlanAddon) : [];
  // Add-ons open their sections on top of the plan's.
  const planFeatures = featuresWithAddons(Array.isArray(rawFeatures) ? rawFeatures.filter(isPlanFeature) : null, addons);
  const onboardingStatus = typeof onboardingRow?.status === "string" ? onboardingRow.status : "active";
  const isPlatformAdmin = adminFlag === true;

  const trialUploads =
    isTrialStatus(onboardingStatus) && !isPlatformAdmin ? await countTrialUploads(db, typedWorkspace.id) : 0;

  const access = resolvePlanAccess({
    rolePermissions: ROLE_PERMISSIONS[membership.role],
    onboardingStatus,
    isPlatformAdmin,
    planFeatures,
    uploadLimit: typeof plan["upload_limit"] === "number" ? plan["upload_limit"] : null,
    uploadsThisMonth: typeof plan["uploads_this_month"] === "number" ? plan["uploads_this_month"] : 0,
    trialUploads,
  });

  return {
    onboardingStatus,
    isPlatformAdmin,
    userId: typedWorkspace.owner_user_id,
    workspaceId: typedWorkspace.id,
    workspaceName: typedWorkspace.name,
    membershipId: membership.id,
    role: membership.role,
    permissions: access.permissions,
    allowedBranchIds,
    globalBranchAccess,
    planName: typeof plan["plan_name"] === "string" ? plan["plan_name"] : null,
    planFeatures,
    uploadLimit: access.uploadLimit,
    uploadsThisMonth: access.uploadsUsed,
    orderLimit: typeof plan["order_limit"] === "number" ? plan["order_limit"] : null,
    // monthly_orders since migration 0038; orders_this_month before it.
    monthlyOrders: typeof plan["monthly_orders"] === "number" ? plan["monthly_orders"] : typeof plan["orders_this_month"] === "number" ? plan["orders_this_month"] : 0,
    ordersMonth: typeof plan["orders_month"] === "string" ? plan["orders_month"] : null,
    addons,
    trial: access.trial,
    planLockedPermissions: access.planLockedPermissions,
  };
}

/**
 * Uploads a trial workspace has made. Periods can be deleted by the user, so the permanent
 * trial.upload audit events (written with the service role, read-only for users) also count.
 */
type CountResult = { count: number | null; error: { message: string } | null };
type CountQuery = PromiseLike<CountResult> & { eq: (column: string, value: string) => CountQuery };
type CountClient = {
  from: (table: string) => { select: (columns: string, options: { count: "exact"; head: true }) => CountQuery };
};

async function countTrialUploads(db: unknown, workspaceId: string): Promise<number> {
  const [periods, events] = await Promise.all([
    (db as CountClient).from("periods").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    (supabaseAdmin as unknown as CountClient)
      .from("workspace_audit_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("event_type", TRIAL_UPLOAD_EVENT),
  ]);
  if (periods.error) throw new Error(periods.error.message);
  if (events.error) console.error("Failed to count trial uploads", events.error.message);
  return Math.max(periods.count ?? 0, events.count ?? 0);
}

export async function requireServerUserAnyStatus(): Promise<ServerUserAuth> {
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

/** Signed-in user whose workspace is activated, or on the free trial (limited by its permissions). */
export async function requireServerUser(): Promise<ServerUserAuth> {
  const context = await requireServerUserAnyStatus();
  if (context.onboardingStatus !== "active" && !context.trial && !context.isPlatformAdmin) {
    throw new Error("الحساب موقوف مؤقتاً — تواصل معنا لإعادة التفعيل.");
  }
  return context;
}

export async function requireWorkspacePermission(
  permission: WorkspacePermission,
): Promise<ServerUserAuth> {
  const context = await requireServerUser();
  if (!context.permissions.includes(permission)) {
    logEvent("permission_denied", {
      permission,
      role: context.role,
      workspace_id: context.workspaceId,
      actor_user_id: context.actorUserId,
    }, "warn");
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
    logEvent("permission_denied", { reason: "branch", branch_id: branchId ?? null }, "warn");
    throw new Error("ليس لديك صلاحية الوصول إلى هذا الفرع.");
  }
}
