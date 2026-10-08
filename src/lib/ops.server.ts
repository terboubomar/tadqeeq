import { getRequestHeader } from "@tanstack/react-start/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { dataUrlBytes, sniffFile } from "./file-sniff";
import { hasVerifiedFactor, tokenClaims } from "./mfa";
import { buildOpsTasks, type OpsTask, type OpsTaskClient } from "./ops-tasks";
import { isPlanAddon, PLAN_ADDONS, PLAN_REQUEST_EVENT, TRIAL_UPLOAD_EVENT, type PlanAddon, type PlanFeature } from "./plans";
import {
  LIVE_SUBSCRIPTION_STATUSES,
  OPS_MFA_REQUIRED_MESSAGE,
  opsCan,
  opsMfaState,
  subscriptionAccessChange,
  type Cycle,
  type OpsMfaState,
  type OpsRole,
  type OpsSection,
  type SubscriptionStatus,
} from "./ops";
import { loadSuspension } from "./onboarding.server";
import { REACTIVATION_REQUEST_EVENT, type OnboardingStatus, type SuspensionInfo, type SuspensionReason } from "./onboarding";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;
type Row = Record<string, unknown>;
const RECEIPTS = "ops-receipts";
const LOGOS = "workspace-logos";

export interface OpsActor {
  userId: string;
  email: string | null;
  role: OpsRole;
  mfa: OpsMfaState;
}

/** Two-step sign-in is on unless the server secret OPS_MFA_REQUIRED is "false" (an escape hatch, not the default). */
function opsMfaRequired(): boolean {
  return (process.env["OPS_MFA_REQUIRED"] ?? "").trim().toLowerCase() !== "false";
}

/** The assurance level ("aal1" / "aal2") in a token that Supabase has already verified. */
export function getRequestHostOnServer(): string {
  return getRequestHeader("host") ?? "";
}

async function currentUser() {
  const header = getRequestHeader("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, aal: tokenClaims(token).aal };
}

export async function getOpsMeOnServer(): Promise<OpsActor | null> {
  const current = await currentUser();
  if (!current) return null;
  const { user, aal } = current;
  const { data } = await db().from("ops_staff").select("role").eq("user_id", user.id).maybeSingle();
  if (!data) return null;
  return { userId: user.id, email: user.email ?? null, role: data.role as OpsRole, mfa: opsMfaState(aal, opsMfaRequired()) };
}

async function requireOps(section: OpsSection): Promise<OpsActor> {
  const me = await getOpsMeOnServer();
  if (!me) throw new Error("لا تملك صلاحية الدخول إلى لوحة العمليات.");
  if (me.mfa === "required") throw new Error(OPS_MFA_REQUIRED_MESSAGE);
  if (!opsCan(me.role, section)) throw new Error("دورك لا يسمح بهذا الإجراء.");
  return me;
}

async function log(actor: OpsActor, action: string, entityType: string, entityId: string | null, workspaceId: string | null, metadata: Row = {}) {
  await db().from("ops_audit_log").insert({
    actor_user_id: actor.userId,
    actor_email: actor.email,
    action,
    entity_type: entityType,
    entity_id: entityId,
    workspace_id: workspaceId,
    metadata,
  });
}

const yearly = (price: number, cycle: string) => (cycle === "yearly" ? price : price * 12);
/** Yearly revenue of a subscription's add-ons (each is billed every few months). */
const addonsYearly = (addons: unknown) =>
  PLAN_ADDONS.filter((addon) => Array.isArray(addons) && addons.includes(addon.key)).reduce((sum, addon) => sum + (addon.price * 12) / addon.months, 0);

const today = () => new Date().toISOString().slice(0, 10);

// ---------------- Overview ----------------
export async function getOpsOverviewOnServer() {
  await requireOps("overview");
  const [{ data: subs }, { data: onb }, { data: pays }] = await Promise.all([
    db().from("subscriptions").select("*"),
    db().from("workspace_onboarding").select("workspace_id,status,created_at"),
    db().from("payments").select("amount,paid_on"),
  ]);
  const subRows = (subs ?? []) as Row[];
  const onbRows = (onb ?? []) as Row[];
  const payRows = (pays ?? []) as Row[];
  const t = today();
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const billable = subRows.filter((s) => s["status"] === "active" || s["status"] === "overdue");
  const arr = billable.reduce((a, s) => a + yearly(Number(s["price"]), String(s["cycle"])) + addonsYearly(s["addons"]), 0);
  const counts: Record<string, number> = {};
  for (const r of onbRows) counts[String(r["status"])] = (counts[String(r["status"])] ?? 0) + 1;

  const months: { month: string; signups: number; revenue: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push({ month: d.toISOString().slice(0, 7), signups: 0, revenue: 0 });
  }
  const idx = new Map(months.map((m, i) => [m.month, i]));
  for (const r of onbRows) {
    const i = idx.get(String(r["created_at"]).slice(0, 7));
    if (i !== undefined) months[i]!.signups++;
  }
  for (const p of payRows) {
    const i = idx.get(String(p["paid_on"]).slice(0, 7));
    if (i !== undefined) months[i]!.revenue += Number(p["amount"]);
  }
  const thisMonth = t.slice(0, 7);
  return {
    arr,
    mrr: arr / 12,
    totalClients: onbRows.length,
    active: counts["active"] ?? 0,
    pending: onbRows.length - (counts["active"] ?? 0) - (counts["suspended"] ?? 0),
    suspended: counts["suspended"] ?? 0,
    newThisMonth: onbRows.filter((r) => String(r["created_at"]).startsWith(thisMonth)).length,
    overdue: subRows.filter((s) => s["status"] === "overdue" || (s["status"] === "active" && s["ends_on"] && String(s["ends_on"]) < t)).length,
    renewalsDue: billable.filter((s) => s["ends_on"] && String(s["ends_on"]) >= t && String(s["ends_on"]) <= in30).length,
    collectedThisMonth: payRows.filter((p) => String(p["paid_on"]).startsWith(thisMonth)).reduce((a, p) => a + Number(p["amount"]), 0),
    collectedTotal: payRows.reduce((a, p) => a + Number(p["amount"]), 0),
    months,
  };
}

// ---------------- Clients ----------------
export interface OpsClient {
  workspaceId: string;
  name: string;
  status: OnboardingStatus;
  legalName: string | null;
  brandName: string | null;
  crNumber: string | null;
  vatNumber: string | null;
  contactName: string | null;
  contactMobile: string | null;
  contactEmail: string | null;
  contactNationalId: string | null;
  branchCount: number | null;
  logoUrl: string | null;
  meetingAt: string | null;
  adminNote: string | null;
  createdAt: string;
  ownerEmail: string | null;
  users: number;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionPrice: number | null;
  subscriptionCycle: Cycle | null;
  subscriptionEndsOn: string | null;
  paidTotal: number;
  /**
   * For a company an account added after subscribing: the name of the account's first company.
   * Its plan belongs to the owner account, so the subscription fields show the account's.
   */
  accountOf: string | null;
  /** The subscription fields come from another company of the same owner account. */
  subscriptionFromAccount: boolean;
  /** Archived clients are suspended and hidden from the default list. */
  archived: boolean;
  archivedAt: string | null;
}

export async function listOpsClientsOnServer(): Promise<OpsClient[]> {
  await requireOps("clients");
  return loadOpsClients();
}

/** Every client, or only `workspaceId` when given. Callers check ops access first. */
async function loadOpsClients(workspaceId?: string): Promise<OpsClient[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (q: any, column = "workspace_id") => (workspaceId ? q.eq(column, workspaceId) : q);
  const [{ data: ws }, { data: onb }, { data: members }, { data: subs }, { data: pays }, { data: profiles }, archives] = await Promise.all([
    scoped(db().from("workspaces").select("id,name,owner_user_id,created_at"), "id"),
    scoped(db().from("workspace_onboarding").select("*")),
    scoped(db().from("workspace_members").select("workspace_id,status")),
    scoped(db().from("subscriptions").select("workspace_id,price,cycle,status,ends_on,created_at").order("created_at", { ascending: false })),
    scoped(db().from("payments").select("workspace_id,amount")),
    db().from("profiles").select("id,email"),
    latestArchiveEvents(workspaceId),
  ]);
  const onbMap = new Map(((onb ?? []) as Row[]).map((r) => [String(r["workspace_id"]), r]));
  const emails = new Map(((profiles ?? []) as Row[]).map((r) => [String(r["id"]), (r["email"] as string) ?? null]));
  const subMap = new Map<string, Row>();
  for (const s of (subs ?? []) as Row[]) if (!subMap.has(String(s["workspace_id"]))) subMap.set(String(s["workspace_id"]), s);
  const userCount = new Map<string, number>();
  for (const m of (members ?? []) as Row[]) if (m["status"] === "active") userCount.set(String(m["workspace_id"]), (userCount.get(String(m["workspace_id"])) ?? 0) + 1);
  const paid = new Map<string, number>();
  for (const p of (pays ?? []) as Row[]) paid.set(String(p["workspace_id"]), (paid.get(String(p["workspace_id"])) ?? 0) + Number(p["amount"]));

  // Companies of the same owner account share its subscription (migration 0052).
  const owners = [...new Set(((ws ?? []) as Row[]).map((w) => String(w["owner_user_id"])))];
  const { data: ownedRows } = owners.length
    ? await db().from("workspaces").select("id,name,owner_user_id,created_at").in("owner_user_id", owners).order("created_at", { ascending: true })
    : { data: [] };
  const accountWorkspaces = new Map<string, Row[]>();
  for (const row of (ownedRows ?? []) as Row[]) {
    const owner = String(row["owner_user_id"]);
    accountWorkspaces.set(owner, [...(accountWorkspaces.get(owner) ?? []), row]);
  }
  const accountIds = ((ownedRows ?? []) as Row[]).map((row) => String(row["id"]));
  const { data: accountSubs } = accountIds.length
    ? await db().from("subscriptions").select("workspace_id,price,cycle,status,ends_on,created_at").in("workspace_id", accountIds).order("created_at", { ascending: false })
    : { data: [] };
  const accountSubFor = (owner: string): Row | undefined => {
    const ids = new Set((accountWorkspaces.get(owner) ?? []).map((row) => String(row["id"])));
    return ((accountSubs ?? []) as Row[]).find((sub) => ids.has(String(sub["workspace_id"])));
  };

  const out = await Promise.all(
    ((ws ?? []) as Row[]).map(async (w) => {
      const id = String(w["id"]);
      const o = onbMap.get(id) ?? {};
      const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : null);
      let logoUrl: string | null = null;
      if (s("logo_path")) {
        const { data } = await supabaseAdmin.storage.from(LOGOS).createSignedUrl(s("logo_path")!, 3600);
        logoUrl = data?.signedUrl ?? null;
      }
      const owner = String(w["owner_user_id"]);
      const first = accountWorkspaces.get(owner)?.[0];
      const accountOf = first && String(first["id"]) !== id ? String(first["name"]) : null;
      const ownSub = subMap.get(id);
      const sub = ownSub ?? accountSubFor(owner);
      return {
        workspaceId: id,
        name: String(w["name"]),
        status: (s("status") ?? "active") as OnboardingStatus,
        legalName: s("legal_name"),
        brandName: s("brand_name"),
        crNumber: s("cr_number"),
        vatNumber: s("vat_number"),
        contactName: s("contact_name"),
        contactMobile: s("contact_mobile"),
        contactEmail: s("contact_email"),
        contactNationalId: s("contact_national_id"),
        branchCount: typeof o["branch_count"] === "number" ? (o["branch_count"] as number) : null,
        logoUrl,
        meetingAt: s("meeting_at"),
        adminNote: s("admin_note"),
        createdAt: String(w["created_at"]),
        ownerEmail: emails.get(String(w["owner_user_id"])) ?? null,
        users: userCount.get(id) ?? 0,
        subscriptionStatus: (sub?.["status"] as SubscriptionStatus) ?? null,
        subscriptionPrice: sub ? Number(sub["price"]) : null,
        subscriptionCycle: (sub?.["cycle"] as Cycle) ?? null,
        subscriptionEndsOn: (sub?.["ends_on"] as string) ?? null,
        paidTotal: paid.get(id) ?? 0,
        accountOf,
        subscriptionFromAccount: !ownSub && sub !== undefined,
        archived: archives.get(id)?.action === ARCHIVE_ACTION,
        archivedAt: archives.get(id)?.action === ARCHIVE_ACTION ? archives.get(id)!.at : null,
      } satisfies OpsClient;
    }),
  );
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function setOpsClientStatusOnServer(input: {
  workspaceId: string;
  status: OnboardingStatus;
  adminNote?: string;
  /** Only for suspensions: shown to the client on the suspended screen. */
  reason?: SuspensionReason;
  clientMessage?: string;
}) {
  const actor = await requireOps("clients");
  if (actor.role === "support") throw new Error("دور الدعم لا يستطيع تغيير حالة العميل.");
  const now = new Date().toISOString();
  const patch: Row = { status: input.status, updated_at: now };
  if (input.adminNote !== undefined) patch["admin_note"] = input.adminNote.trim() || null;
  if (input.status === "onboarding") patch["paid_at"] = now;
  if (input.status === "active") patch["activated_at"] = now;
  // The subscription belongs to the owner account, so suspending or reactivating applies to every
  // company it owns; otherwise a suspended account keeps working in its other companies.
  const workspaceIds = ACCOUNT_WIDE_STATUSES.includes(input.status)
    ? await accountWorkspaceIds(input.workspaceId)
    : [input.workspaceId];
  const { data: existingRows, error: existingError } = await db()
    .from("workspace_onboarding")
    .select("workspace_id")
    .in("workspace_id", workspaceIds);
  if (existingError) throw new Error(existingError.message);
  const existing = new Set(((existingRows ?? []) as Row[]).map((r) => String(r["workspace_id"])));
  for (const workspaceId of workspaceIds) {
    const { error } = existing.has(workspaceId)
      ? await db().from("workspace_onboarding").update(patch).eq("workspace_id", workspaceId)
      : await db().from("workspace_onboarding").insert({ workspace_id: workspaceId, ...patch });
    if (error) throw new Error(error.message);
  }
  const suspension = input.status === "suspended" ? { reason: input.reason ?? "payment", message: input.clientMessage?.trim() || null } : {};
  for (const workspaceId of workspaceIds) {
    await log(actor, "client.status", "workspace", workspaceId, workspaceId, {
      status: input.status,
      ...suspension,
      ...(workspaceId === input.workspaceId ? {} : { viaWorkspaceId: input.workspaceId }),
    });
  }
}

/** Statuses that follow the owner account across all of its company workspaces. */
const ACCOUNT_WIDE_STATUSES: OnboardingStatus[] = ["suspended", "active"];

/** The workspace and every other company owned by the same account. */
async function accountWorkspaceIds(workspaceId: string): Promise<string[]> {
  const { data: ws, error } = await db().from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!ws?.owner_user_id) return [workspaceId];
  const { data: owned, error: ownedError } = await db().from("workspaces").select("id").eq("owner_user_id", ws.owner_user_id);
  if (ownedError) throw new Error(ownedError.message);
  const ids = ((owned ?? []) as Row[]).map((r) => String(r["id"]));
  return ids.includes(workspaceId) ? ids : [workspaceId, ...ids];
}

// ---------------- Edit / archive / delete ----------------
const ARCHIVE_ACTION = "client.archive";
const UNARCHIVE_ACTION = "client.unarchive";
const DELETE_ACTION = "client.delete";

type ArchiveEvent = { action: string; at: string; previousStatus: OnboardingStatus | null };

/** Latest archive/unarchive event per workspace (archive state lives in the ops audit log). */
async function latestArchiveEvents(workspaceId?: string): Promise<Map<string, ArchiveEvent>> {
  let query = db()
    .from("ops_audit_log")
    .select("workspace_id,action,metadata,created_at")
    .in("action", [ARCHIVE_ACTION, UNARCHIVE_ACTION])
    .order("created_at", { ascending: false });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const out = new Map<string, ArchiveEvent>();
  for (const r of (data ?? []) as Row[]) {
    const id = String(r["workspace_id"]);
    if (out.has(id)) continue;
    const meta = (r["metadata"] ?? {}) as Row;
    out.set(id, {
      action: String(r["action"]),
      at: String(r["created_at"]),
      previousStatus: typeof meta["previousStatus"] === "string" ? (meta["previousStatus"] as OnboardingStatus) : null,
    });
  }
  return out;
}

async function requireClientEditor(): Promise<OpsActor> {
  const actor = await requireOps("clients");
  if (actor.role === "support") throw new Error("دور الدعم لا يستطيع تعديل بيانات العميل.");
  return actor;
}

async function writeOnboarding(workspaceId: string, patch: Row) {
  const { data: existing } = await db().from("workspace_onboarding").select("workspace_id").eq("workspace_id", workspaceId).maybeSingle();
  const { error } = existing
    ? await db().from("workspace_onboarding").update(patch).eq("workspace_id", workspaceId)
    : await db().from("workspace_onboarding").insert({ workspace_id: workspaceId, ...patch });
  if (error) throw new Error(error.message);
}

export interface OpsClientEdit {
  workspaceId: string;
  name: string;
  legalName: string | null;
  brandName: string | null;
  crNumber: string | null;
  vatNumber: string | null;
  contactName: string | null;
  contactMobile: string | null;
  contactEmail: string | null;
  contactNationalId: string | null;
  branchCount: number | null;
  adminNote: string | null;
}

export async function updateOpsClientOnServer(input: OpsClientEdit) {
  const actor = await requireClientEditor();
  const { error } = await db().from("workspaces").update({ name: input.name }).eq("id", input.workspaceId);
  if (error) throw new Error(error.message);
  await writeOnboarding(input.workspaceId, {
    legal_name: input.legalName,
    brand_name: input.brandName,
    cr_number: input.crNumber,
    vat_number: input.vatNumber,
    contact_name: input.contactName,
    contact_mobile: input.contactMobile,
    contact_email: input.contactEmail,
    contact_national_id: input.contactNationalId,
    branch_count: input.branchCount,
    admin_note: input.adminNote,
    updated_at: new Date().toISOString(),
  });
  await log(actor, "client.update", "workspace", input.workspaceId, input.workspaceId, { name: input.name });
}

/** Archive = suspend access and hide from the default list; the previous status is kept for restoring. */
export async function setOpsClientArchivedOnServer(input: { workspaceId: string; archived: boolean }) {
  const actor = await requireClientEditor();
  const latest = (await latestArchiveEvents(input.workspaceId)).get(input.workspaceId);
  const isArchived = latest?.action === ARCHIVE_ACTION;
  if (isArchived === input.archived) return;

  if (input.archived) {
    const { data: onb } = await db().from("workspace_onboarding").select("status").eq("workspace_id", input.workspaceId).maybeSingle();
    const previousStatus = (onb?.status as OnboardingStatus | undefined) ?? "active";
    await writeOnboarding(input.workspaceId, { status: "suspended", updated_at: new Date().toISOString() });
    await log(actor, ARCHIVE_ACTION, "workspace", input.workspaceId, input.workspaceId, { previousStatus });
  } else {
    const restore = latest?.previousStatus && latest.previousStatus !== "suspended" ? latest.previousStatus : "pending_details";
    await writeOnboarding(input.workspaceId, { status: restore, updated_at: new Date().toISOString() });
    await log(actor, UNARCHIVE_ACTION, "workspace", input.workspaceId, input.workspaceId, { restoredStatus: restore });
  }
}

/**
 * Workspace-owned tables, children first; their foreign keys to workspaces are ON DELETE RESTRICT.
 * compensation_cases references telegram_order_evidence, which references telegram_branch_chats.
 */
const OWNED_TABLES_DELETE_ORDER = [
  "operation_adjustments",
  "operation_orders",
  "operation_imports",
  "recovery_case_events",
  "recovery_case_documents",
  "recovery_case_details",
  "compensation_appeal_marks",
  "compensation_cases",
  "telegram_order_evidence",
  "telegram_branch_chats",
  "exception_events",
  "format_change_alerts",
  "format_column_aliases",
  "platform_column_snapshots",
  "audit_source_files",
  "promotion_audits",
  "ads_roi_analyses",
  "ads_roi_brand_settings",
  "smart_watch_acceptances",
  "ai_usage",
  "hungerstation_branch_mappings",
  "contract_rule_events",
  "contract_fee_rules",
  "contract_documents",
  "contract_versions",
  "platform_contracts",
  "periods",
  "branch_registry",
];

/** Files stored for a workspace: [table, path column, bucket]. */
const WORKSPACE_FILES: Array<[string, string, string]> = [
  ["audit_source_files", "storage_path", "source-files"],
  ["format_change_alerts", "storage_path", "source-files"],
  ["contract_documents", "storage_path", "contract-files"],
  ["recovery_case_documents", "storage_path", "recovery-case-files"],
  ["telegram_order_evidence", "thumbnail_storage_path", "telegram-evidence-thumbnails"],
  ["payments", "receipt_path", RECEIPTS],
  ["workspace_onboarding", "logo_path", LOGOS],
];

async function collectWorkspaceFiles(workspaceId: string): Promise<Map<string, string[]>> {
  const byBucket = new Map<string, string[]>();
  for (const [table, column, bucket] of WORKSPACE_FILES) {
    const { data, error } = await db().from(table).select(column).eq("workspace_id", workspaceId);
    if (error) throw new Error(`${table}: ${error.message}`);
    const paths = ((data ?? []) as Row[]).map((r) => r[column]).filter((p): p is string => typeof p === "string" && p.length > 0);
    if (paths.length) byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), ...paths]);
  }
  return byBucket;
}

/**
 * Permanently deletes an archived client: its data, files, the workspace, and user accounts that
 * belong to no other workspace (ops staff and platform admins are always kept).
 */
export async function deleteOpsClientOnServer(input: { workspaceId: string; confirmName: string }) {
  const actor = await requireOps("clients");
  if (actor.role !== "owner") throw new Error("الحذف النهائي متاح لمالك لوحة العمليات فقط.");

  const { data: ws, error: wsError } = await db().from("workspaces").select("id,name,owner_user_id").eq("id", input.workspaceId).maybeSingle();
  if (wsError) throw new Error(wsError.message);
  if (!ws) throw new Error("العميل غير موجود.");
  if (input.confirmName.trim() !== String(ws.name).trim()) throw new Error("اسم الشركة المكتوب لا يطابق — لم يتم الحذف.");

  // Contract tables have database guards (approved versions are immutable, and every change writes an
  // audit event scoped to the signed-in user's workspace) that a server-side delete cannot pass. Stop
  // before deleting anything so the client is never left half-deleted.
  const { count: contracts, error: contractsError } = await db()
    .from("platform_contracts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", input.workspaceId);
  if (contractsError) throw new Error(contractsError.message);
  if (contracts) {
    throw new Error(
      `لا يمكن حذف ${ws.name} نهائياً لأن لديه عقود منصات محفوظة (${contracts})، وسجل العقود محمي في قاعدة البيانات. أبقِه مؤرشفاً — الأرشفة توقف وصوله بالكامل.`,
    );
  }

  const [{ data: onb }, { data: ownerProfile }] = await Promise.all([
    db().from("workspace_onboarding").select("legal_name,cr_number,contact_email,contact_mobile").eq("workspace_id", input.workspaceId).maybeSingle(),
    db().from("profiles").select("email").eq("id", ws.owner_user_id).maybeSingle(),
  ]);

  const files = await collectWorkspaceFiles(input.workspaceId);
  const { data: memberRows } = await db().from("workspace_members").select("user_id").eq("workspace_id", input.workspaceId);
  const memberIds = [...new Set(((memberRows ?? []) as Row[]).map((r) => String(r["user_id"])))];

  for (const table of OWNED_TABLES_DELETE_ORDER) {
    const { error } = await db().from(table).delete().eq("workspace_id", input.workspaceId);
    // A table whose migration has not been applied yet holds no rows to delete.
    if (error && (error.code === "42P01" || error.code === "PGRST205")) continue;
    if (error) throw new Error(`تعذّر حذف بيانات ${table}: ${error.message}`);
  }
  const { error: deleteError } = await db().from("workspaces").delete().eq("id", input.workspaceId);
  if (deleteError) throw new Error(`تعذّر حذف مساحة العمل: ${deleteError.message}`);

  let filesRemoved = 0;
  for (const [bucket, paths] of files) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk);
      if (error) console.error(`Failed to remove files from ${bucket}`, error.message);
      else filesRemoved += chunk.length;
    }
  }

  const [{ data: staff }, { data: admins }, { data: otherMemberships }] = await Promise.all([
    db().from("ops_staff").select("user_id").in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]),
    db().from("platform_admins").select("user_id").in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]),
    db().from("workspace_members").select("user_id").in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const keep = new Set([...((staff ?? []) as Row[]), ...((admins ?? []) as Row[]), ...((otherMemberships ?? []) as Row[])].map((r) => String(r["user_id"])));
  let usersDeleted = 0;
  let usersKept = 0;
  for (const userId of memberIds) {
    if (keep.has(userId)) {
      usersKept += 1;
      continue;
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      usersKept += 1;
      console.error("Failed to delete client user", userId, error.message);
    } else usersDeleted += 1;
  }

  await log(actor, DELETE_ACTION, "workspace", input.workspaceId, null, {
    name: ws.name,
    legalName: onb?.legal_name ?? null,
    crNumber: onb?.cr_number ?? null,
    contactEmail: onb?.contact_email ?? null,
    contactMobile: onb?.contact_mobile ?? null,
    ownerEmail: ownerProfile?.email ?? null,
    usersDeleted,
    usersKept,
    filesRemoved,
  });
  return { usersDeleted, usersKept, filesRemoved };
}

export interface DeletedOpsClient {
  workspaceId: string | null;
  name: string;
  legalName: string | null;
  crNumber: string | null;
  contactEmail: string | null;
  contactMobile: string | null;
  ownerEmail: string | null;
  usersDeleted: number;
  filesRemoved: number;
  deletedAt: string;
  deletedBy: string | null;
}

/** Permanently deleted clients, read back from the ops audit log. */
export async function listDeletedOpsClientsOnServer(): Promise<DeletedOpsClient[]> {
  await requireOps("clients");
  const { data, error } = await db()
    .from("ops_audit_log")
    .select("entity_id,actor_email,metadata,created_at")
    .eq("action", DELETE_ACTION)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => {
    const m = (r["metadata"] ?? {}) as Row;
    const text = (k: string) => (typeof m[k] === "string" && m[k] ? (m[k] as string) : null);
    return {
      workspaceId: (r["entity_id"] as string | null) ?? null,
      name: text("name") ?? "—",
      legalName: text("legalName"),
      crNumber: text("crNumber"),
      contactEmail: text("contactEmail"),
      contactMobile: text("contactMobile"),
      ownerEmail: text("ownerEmail"),
      usersDeleted: Number(m["usersDeleted"] ?? 0),
      filesRemoved: Number(m["filesRemoved"] ?? 0),
      deletedAt: String(r["created_at"]),
      deletedBy: (r["actor_email"] as string | null) ?? null,
    };
  });
}

export async function listClientNotesOnServer(workspaceId: string) {
  await requireOps("clients");
  const { data } = await db().from("client_notes").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  return ((data ?? []) as Row[]).map((r) => ({ id: String(r["id"]), body: String(r["body"]), author: (r["author_email"] as string) ?? "—", createdAt: String(r["created_at"]) }));
}

export async function addClientNoteOnServer(input: { workspaceId: string; body: string }) {
  const actor = await requireOps("clients");
  const { error } = await db().from("client_notes").insert({ workspace_id: input.workspaceId, author_user_id: actor.userId, author_email: actor.email, body: input.body.trim() });
  if (error) throw new Error(error.message);
  await log(actor, "client.note", "workspace", input.workspaceId, input.workspaceId);
}

// ---------------- Plans & subscriptions ----------------
export async function listPlansOnServer() {
  await requireOps("subscriptions");
  const { data } = await db().from("subscription_plans").select("*").order("sort_order").order("created_at");
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r["id"]), name: String(r["name"]), price: Number(r["price"]), cycle: r["cycle"] as Cycle, active: r["active"] === true,
    features: (Array.isArray(r["features"]) ? r["features"] : []) as PlanFeature[],
    uploadLimit: typeof r["upload_limit"] === "number" ? (r["upload_limit"] as number) : null,
    description: (r["description"] as string | null) ?? "",
    highlighted: r["highlighted"] === true,
    sortOrder: Number(r["sort_order"] ?? 0),
    code: typeof r["code"] === "string" ? (r["code"] as string) : null,
    orderLimit: typeof r["order_limit"] === "number" ? (r["order_limit"] as number) : null,
    priceYearly: r["price_yearly"] === null || r["price_yearly"] === undefined ? null : Number(r["price_yearly"]),
    customPrice: r["custom_price"] === true,
    workspaceLimit: typeof r["workspace_limit"] === "number" ? (r["workspace_limit"] as number) : null,
  }));
}

export async function savePlanOnServer(input: { id?: string; name: string; price: number; cycle: Cycle; active: boolean; features: PlanFeature[]; uploadLimit: number | null; description?: string; highlighted?: boolean; sortOrder?: number; orderLimit?: number | null; priceYearly?: number | null; customPrice?: boolean; workspaceLimit?: number | null }) {
  const actor = await requireOps("subscriptions");
  if (actor.role === "sales" || actor.role === "support") throw new Error("المالية أو المالك فقط يعدّل الباقات.");
  const row = {
    name: input.name.trim(), pricing: "fixed", price: input.price, cycle: input.cycle, active: input.active,
    features: input.features, upload_limit: input.uploadLimit, description: input.description?.trim() || null,
    highlighted: input.highlighted ?? false, sort_order: input.sortOrder ?? 0,
    // Order-based fields (migration 0037); only sent when the form has them.
    ...(input.orderLimit !== undefined ? { order_limit: input.orderLimit } : {}),
    ...(input.priceYearly !== undefined ? { price_yearly: input.priceYearly } : {}),
    ...(input.customPrice !== undefined ? { custom_price: input.customPrice } : {}),
    ...(input.workspaceLimit !== undefined ? { workspace_limit: input.workspaceLimit } : {}),
  };
  const { error } = input.id ? await db().from("subscription_plans").update(row).eq("id", input.id) : await db().from("subscription_plans").insert(row);
  if (error) throw new Error(error.message);
  await log(actor, input.id ? "plan.update" : "plan.create", "plan", input.id ?? null, null, row);
}

export async function listSubscriptionsOnServer() {
  await requireOps("subscriptions");
  const [{ data }, { data: ws }] = await Promise.all([
    db().from("subscriptions").select("*").order("created_at", { ascending: false }),
    db().from("workspaces").select("id,name"),
  ]);
  const names = new Map(((ws ?? []) as Row[]).map((w) => [String(w["id"]), String(w["name"])]));
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r["id"]),
    workspaceId: String(r["workspace_id"]),
    workspaceName: names.get(String(r["workspace_id"])) ?? "—",
    planId: (r["plan_id"] as string) ?? null,
    price: Number(r["price"]),
    branchCount: Number(r["branch_count"]),
    cycle: r["cycle"] as Cycle,
    status: r["status"] as SubscriptionStatus,
    startsOn: String(r["starts_on"]),
    endsOn: (r["ends_on"] as string) ?? null,
    notes: (r["notes"] as string) ?? null,
    addons: (Array.isArray(r["addons"]) ? r["addons"] : []).filter(isPlanAddon),
    updatedAt: String(r["updated_at"] ?? r["created_at"]),
  }));
}

/** Month (YYYY-MM-01) a period's data belongs to: its start date, else its upload date in Riyadh. */
function dataMonth(periodStart: unknown, createdAt: unknown): string {
  if (typeof periodStart === "string" && periodStart.length >= 7) return `${periodStart.slice(0, 7)}-01`;
  const riyadh = new Date(Date.parse(String(createdAt)) + 3 * 3600_000);
  return `${riyadh.toISOString().slice(0, 7)}-01`;
}

/** Calendar month before `month` (YYYY-MM-01). */
function previousMonth(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Each workspace's monthly orders for plan-limit follow-up: all platforms in the latest month its current data
 * covers, and the month before. Periods replaced by a re-upload are ignored (same rule as my_workspace_plan).
 */
export async function workspaceOrderUsageOnServer() {
  await requireOps("subscriptions");
  return loadOrderUsage();
}

async function loadOrderUsage() {
  const since = new Date(Date.now() - 400 * 86400_000).toISOString();
  const { data } = await db()
    .from("periods")
    .select("workspace_id,period_start,created_at,orders:summary->orders")
    .is("superseded_at", null)
    .gte("created_at", since);
  const byWorkspace = new Map<string, Map<string, number>>();
  for (const r of (data ?? []) as Row[]) {
    const id = String(r["workspace_id"]);
    const orders = typeof r["orders"] === "number" ? (r["orders"] as number) : 0;
    const months = byWorkspace.get(id) ?? new Map<string, number>();
    const month = dataMonth(r["period_start"], r["created_at"]);
    months.set(month, (months.get(month) ?? 0) + orders);
    byWorkspace.set(id, months);
  }
  return [...byWorkspace.entries()].map(([workspaceId, months]) => {
    const month = [...months.keys()].sort().at(-1)!;
    return { workspaceId, month, latest: months.get(month) ?? 0, previous: months.get(previousMonth(month)) ?? 0 };
  });
}

/** Each client's latest plan request from the app (plan, cycle, add-ons) that no subscription change has answered yet. */
export async function listPlanRequestsOnServer() {
  await requireOps("subscriptions");
  return loadOpenPlanRequests();
}

async function loadOpenPlanRequests() {
  const [{ data }, { data: subs }] = await Promise.all([
    db().from("workspace_audit_events").select("workspace_id,metadata,created_at").eq("event_type", PLAN_REQUEST_EVENT).order("created_at", { ascending: false }).limit(500),
    db().from("subscriptions").select("workspace_id,updated_at,created_at"),
  ]);
  // A subscription created or edited after the request answers it.
  const lastChange = new Map<string, number>();
  for (const r of (subs ?? []) as Row[]) {
    const id = String(r["workspace_id"]);
    const at = Date.parse(String(r["updated_at"] ?? r["created_at"]));
    if (at > (lastChange.get(id) ?? 0)) lastChange.set(id, at);
  }
  const latest = new Map<string, { workspaceId: string; planId: string | null; cycle: Cycle; addons: PlanAddon[]; requestedAt: string }>();
  for (const r of (data ?? []) as Row[]) {
    const workspaceId = String(r["workspace_id"]);
    if (latest.has(workspaceId)) continue;
    const m = (r["metadata"] ?? {}) as Row;
    latest.set(workspaceId, {
      workspaceId,
      planId: typeof m["planId"] === "string" ? (m["planId"] as string) : null,
      cycle: m["cycle"] === "yearly" ? "yearly" : "monthly",
      addons: (Array.isArray(m["addons"]) ? m["addons"] : []).filter(isPlanAddon),
      requestedAt: String(r["created_at"]),
    });
  }
  return [...latest.values()].filter((r) => (lastChange.get(r.workspaceId) ?? 0) < Date.parse(r.requestedAt));
}

export async function saveSubscriptionOnServer(input: {
  id?: string; workspaceId: string; planId: string | null; price: number; branchCount: number; cycle: Cycle; status: SubscriptionStatus; startsOn: string; endsOn: string | null; notes?: string; addons?: string[];
}) {
  const actor = await requireOps("subscriptions");
  if (actor.role === "support") throw new Error("لا تملك صلاحية تعديل الاشتراكات.");
  const row = {
    workspace_id: input.workspaceId, plan_id: input.planId, price: input.price, branch_count: input.branchCount, cycle: input.cycle,
    status: input.status, starts_on: input.startsOn, ends_on: input.endsOn || null, notes: input.notes?.trim() || null, updated_at: new Date().toISOString(),
    // Add-ons (migration 0037); only sent when the form has them.
    ...(input.addons !== undefined ? { addons: input.addons.filter(isPlanAddon) } : {}),
  };
  const { data: saved, error } = input.id
    ? await db().from("subscriptions").update(row).eq("id", input.id).select("id").single()
    : await db().from("subscriptions").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  await syncAccessWithSubscription(actor, input.workspaceId, String(saved.id), input.status);
  await log(actor, input.id ? "subscription.update" : "subscription.create", "subscription", input.id ?? null, input.workspaceId, { status: input.status, price: input.price, cycle: input.cycle });
}

/** Keeps the client's account in step with the subscription just saved (rules in subscriptionAccessChange). */
async function syncAccessWithSubscription(actor: OpsActor, workspaceId: string, subscriptionId: string, status: SubscriptionStatus) {
  const [{ data: o }, { count: otherLive }, archives] = await Promise.all([
    db().from("workspace_onboarding").select("status,paid_at,activated_at").eq("workspace_id", workspaceId).maybeSingle(),
    db().from("subscriptions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("status", LIVE_SUBSCRIPTION_STATUSES).neq("id", subscriptionId),
    latestArchiveEvents(workspaceId),
  ]);
  const change = subscriptionAccessChange({
    status,
    onboardingStatus: (o?.status as OnboardingStatus | undefined) ?? null,
    otherLiveSubscription: !!otherLive,
    archived: archives.get(workspaceId)?.action === ARCHIVE_ACTION,
  });
  if (!change) return;
  const now = new Date().toISOString();
  const patch = change === "suspend" ? { status: "suspended", updated_at: now } : { status: "active", updated_at: now, paid_at: o.paid_at ?? now, activated_at: o.activated_at ?? now };
  const { error } = await db().from("workspace_onboarding").update(patch).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  await log(actor, "client.status", "workspace", workspaceId, workspaceId, change === "suspend" ? { status: "suspended", reason: "payment", source: "subscription" } : { status: "active", source: "subscription" });
}

// ---------------- Payments ----------------
export async function listPaymentsOnServer() {
  await requireOps("payments");
  const [{ data }, { data: ws }] = await Promise.all([
    db().from("payments").select("*").order("paid_on", { ascending: false }),
    db().from("workspaces").select("id,name"),
  ]);
  const names = new Map(((ws ?? []) as Row[]).map((w) => [String(w["id"]), String(w["name"])]));
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r["id"]), workspaceId: String(r["workspace_id"]), workspaceName: names.get(String(r["workspace_id"])) ?? "—",
    amount: Number(r["amount"]), paidOn: String(r["paid_on"]), reference: (r["reference"] as string) ?? null, notes: (r["notes"] as string) ?? null, hasReceipt: !!r["receipt_path"],
  }));
}

export async function recordPaymentOnServer(input: { workspaceId: string; amount: number; paidOn: string; reference?: string; notes?: string; receiptDataUrl?: string }) {
  const actor = await requireOps("payments");
  let receiptPath: string | null = null;
  if (input.receiptDataUrl) {
    // Stored with the type read from the file's bytes: PDF, PNG, JPEG or WEBP only (never HTML or SVG).
    const bytes = dataUrlBytes(input.receiptDataUrl);
    const sniffed = bytes ? sniffFile(bytes) : null;
    if (!bytes || !sniffed) throw new Error("صيغة الإيصال غير مدعومة. ارفع PDF أو صورة PNG / JPG / WEBP.");
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("حجم الإيصال يجب ألا يتجاوز 5MB.");
    receiptPath = `${input.workspaceId}/${Date.now()}.${sniffed.ext}`;
    const { error } = await supabaseAdmin.storage.from(RECEIPTS).upload(receiptPath, bytes, { contentType: sniffed.mime });
    if (error) throw new Error("تعذّر رفع الإيصال.");
  }
  const { data: sub } = await db().from("subscriptions").select("id").eq("workspace_id", input.workspaceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db().from("payments").insert({
    workspace_id: input.workspaceId, subscription_id: sub?.id ?? null, amount: input.amount, paid_on: input.paidOn,
    reference: input.reference?.trim() || null, notes: input.notes?.trim() || null, receipt_path: receiptPath, recorded_by: actor.userId,
  });
  if (error) throw new Error(error.message);
  await log(actor, "payment.record", "payment", null, input.workspaceId, { amount: input.amount, paidOn: input.paidOn });
}

export async function deletePaymentOnServer(id: string) {
  const actor = await requireOps("payments");
  const { data: row } = await db().from("payments").select("*").eq("id", id).maybeSingle();
  if (!row) return;
  if (row.receipt_path) await supabaseAdmin.storage.from(RECEIPTS).remove([row.receipt_path]);
  await db().from("payments").delete().eq("id", id);
  await log(actor, "payment.delete", "payment", id, row.workspace_id, { amount: row.amount });
}

export async function getReceiptUrlOnServer(id: string) {
  await requireOps("payments");
  const { data: row } = await db().from("payments").select("receipt_path").eq("id", id).maybeSingle();
  if (!row?.receipt_path) throw new Error("لا يوجد إيصال.");
  const { data } = await supabaseAdmin.storage.from(RECEIPTS).createSignedUrl(row.receipt_path, 600);
  return data?.signedUrl ?? null;
}

// ---------------- Usage ----------------
// ---------------- Client profile ----------------
export interface OpsClientProfile {
  client: OpsClient;
  journey: { signedUpAt: string; submittedAt: string | null; meetingAt: string | null; meetingNote: string | null; paidAt: string | null; activatedAt: string | null };
  usage: { audits: number; uploads: number; aiCalls30d: number; evidence: number; trialUploads: number; lastUpload: string | null; lastLogin: string | null };
  members: { id: string; email: string | null; fullName: string | null; role: string; status: string; joinedAt: string | null; lastLogin: string | null; isOwner: boolean; twoFactor: boolean }[];
  branches: { id: string; name: string; active: boolean; hungerstation: boolean; jahez: boolean; keeta: boolean }[];
  periods: { id: string; label: string | null; platform: string; start: string | null; end: string | null; createdAt: string; superseded: boolean }[];
  /** null when the viewer's role cannot see subscriptions or payments. */
  subscriptions: { id: string; planName: string | null; price: number; cycle: Cycle; status: SubscriptionStatus; branchCount: number; addons: PlanAddon[]; startsOn: string; endsOn: string | null; notes: string | null }[] | null;
  payments: { id: string; amount: number; paidOn: string; reference: string | null; notes: string | null; hasReceipt: boolean }[] | null;
  timeline: { id: string; source: "ops" | "client"; action: string; actor: string; details: string; createdAt: string }[];
  /** Set only while the client is suspended. */
  suspension: SuspensionInfo | null;
}

export async function getOpsClientProfileOnServer(workspaceId: string): Promise<OpsClientProfile> {
  const actor = await requireOps("clients");
  const [client] = await loadOpsClients(workspaceId);
  if (!client) throw new Error("العميل غير موجود أو تم حذفه.");
  const canSubs = opsCan(actor.role, "subscriptions");
  const canPays = opsCan(actor.role, "payments");
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const count = (table: string, extra?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const q = db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
    return extra ? extra(q) : q;
  };
  const [
    { data: onb },
    { data: ws },
    { data: members },
    { data: branches },
    { data: periods },
    { data: lastFile },
    audits,
    uploads,
    ai,
    evidence,
    trial,
    { data: opsEvents },
    { data: clientEvents },
    subs,
    pays,
    { data: plans },
    logins,
  ] = await Promise.all([
    db().from("workspace_onboarding").select("created_at,updated_at,submitted_at,meeting_at,meeting_note,paid_at,activated_at").eq("workspace_id", workspaceId).maybeSingle(),
    db().from("workspaces").select("owner_user_id,created_at").eq("id", workspaceId).maybeSingle(),
    db().from("workspace_members").select("id,user_id,role,status,joined_at,created_at").eq("workspace_id", workspaceId).order("created_at"),
    db().from("branch_registry").select("id,name,active,hungerstation_id,jahez_id,keeta_id").eq("workspace_id", workspaceId).order("name"),
    db().from("periods").select("id,label,platform,period_start,period_end,created_at,superseded_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
    db().from("audit_source_files").select("created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(1),
    count("periods"),
    count("audit_source_files"),
    count("ai_usage", (q) => q.gte("created_at", since)),
    count("telegram_order_evidence"),
    db().from("workspace_audit_events").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("event_type", TRIAL_UPLOAD_EVENT),
    db().from("ops_audit_log").select("id,action,actor_email,metadata,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
    db().from("workspace_audit_events").select("id,event_type,actor_user_id,metadata,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
    canSubs ? db().from("subscriptions").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }) : Promise.resolve({ data: null }),
    canPays ? db().from("payments").select("*").eq("workspace_id", workspaceId).order("paid_on", { ascending: false }) : Promise.resolve({ data: null }),
    canSubs ? db().from("subscription_plans").select("id,name") : Promise.resolve({ data: [] }),
    lastSignIns(),
  ]);

  const memberRows = (members ?? []) as Row[];
  const userIds = [...new Set([...memberRows.map((m) => String(m["user_id"])), ...((clientEvents ?? []) as Row[]).map((e) => String(e["actor_user_id"]))])];
  const { data: profiles } = userIds.length
    ? await db().from("profiles").select("id,email,full_name").in("id", userIds)
    : { data: [] };
  const profile = new Map(((profiles ?? []) as Row[]).map((p) => [String(p["id"]), p]));
  const planNames = new Map(((plans ?? []) as Row[]).map((p) => [String(p["id"]), String(p["name"])]));
  const text = (r: Row | null | undefined, k: string) => (r && typeof r[k] === "string" && r[k] ? (r[k] as string) : null);
  const ownerId = String((ws as Row | null)?.["owner_user_id"] ?? "");
  const activeLogins = memberRows.filter((m) => m["status"] === "active").map((m) => logins.get(String(m["user_id"]))).filter(Boolean) as string[];

  const suspension = client.status === "suspended" ? await loadSuspension(workspaceId, text(onb as Row, "updated_at")) : null;
  const twoFactor = await usersWithTwoFactor(memberRows.map((m) => String(m["user_id"])));

  return {
    client,
    suspension,
    journey: {
      signedUpAt: text(ws as Row, "created_at") ?? client.createdAt,
      submittedAt: text(onb as Row, "submitted_at"),
      meetingAt: text(onb as Row, "meeting_at"),
      meetingNote: text(onb as Row, "meeting_note"),
      paidAt: text(onb as Row, "paid_at"),
      activatedAt: text(onb as Row, "activated_at"),
    },
    usage: {
      audits: audits.count ?? 0,
      uploads: uploads.count ?? 0,
      aiCalls30d: ai.count ?? 0,
      evidence: evidence.count ?? 0,
      trialUploads: trial.count ?? 0,
      lastUpload: text(((lastFile ?? []) as Row[])[0], "created_at"),
      lastLogin: activeLogins.sort().at(-1) ?? null,
    },
    members: memberRows.map((m) => {
      const p = profile.get(String(m["user_id"]));
      return {
        id: String(m["id"]),
        email: text(p, "email"),
        fullName: text(p, "full_name"),
        role: String(m["role"]),
        status: String(m["status"]),
        joinedAt: text(m, "joined_at") ?? text(m, "created_at"),
        lastLogin: logins.get(String(m["user_id"])) ?? null,
        isOwner: String(m["user_id"]) === ownerId,
        twoFactor: twoFactor.has(String(m["user_id"])),
      };
    }),
    branches: ((branches ?? []) as Row[]).map((b) => ({
      id: String(b["id"]),
      name: String(b["name"]),
      active: b["active"] !== false,
      hungerstation: !!b["hungerstation_id"],
      jahez: !!b["jahez_id"],
      keeta: !!b["keeta_id"],
    })),
    periods: ((periods ?? []) as Row[]).map((p) => ({
      id: String(p["id"]),
      label: text(p, "label"),
      platform: String(p["platform"]),
      start: text(p, "period_start"),
      end: text(p, "period_end"),
      createdAt: String(p["created_at"]),
      superseded: !!p["superseded_at"],
    })),
    subscriptions: subs.data
      ? ((subs.data ?? []) as Row[]).map((s) => ({
          id: String(s["id"]),
          planName: s["plan_id"] ? planNames.get(String(s["plan_id"])) ?? null : null,
          price: Number(s["price"]),
          cycle: s["cycle"] as Cycle,
          status: s["status"] as SubscriptionStatus,
          branchCount: Number(s["branch_count"]),
          addons: (Array.isArray(s["addons"]) ? s["addons"] : []).filter(isPlanAddon),
          startsOn: String(s["starts_on"]),
          endsOn: text(s, "ends_on"),
          notes: text(s, "notes"),
        }))
      : null,
    payments: pays.data
      ? ((pays.data ?? []) as Row[]).map((p) => ({
          id: String(p["id"]),
          amount: Number(p["amount"]),
          paidOn: String(p["paid_on"]),
          reference: text(p, "reference"),
          notes: text(p, "notes"),
          hasReceipt: !!p["receipt_path"],
        }))
      : null,
    timeline: [
      ...((opsEvents ?? []) as Row[]).map((e) => ({
        id: `ops-${String(e["id"])}`,
        source: "ops" as const,
        action: String(e["action"]),
        actor: text(e, "actor_email") ?? "—",
        details: JSON.stringify(e["metadata"] ?? {}),
        createdAt: String(e["created_at"]),
      })),
      ...((clientEvents ?? []) as Row[]).map((e) => ({
        id: `client-${String(e["id"])}`,
        source: "client" as const,
        action: String(e["event_type"]),
        actor: text(profile.get(String(e["actor_user_id"])), "email") ?? String(e["actor_user_id"]).slice(0, 8),
        details: JSON.stringify(e["metadata"] ?? {}),
        createdAt: String(e["created_at"]),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/** Users (of the given ids) who turned on the optional two-step sign-in. */
async function usersWithTwoFactor(userIds: string[]): Promise<Set<string>> {
  const results = await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
      return hasVerifiedFactor(data?.factors) ? userId : null;
    }),
  );
  return new Set(results.filter((id): id is string => id !== null));
}

/** A client lost their phone: remove their authenticator so they can sign in with the password and set it up again. */
export async function resetMemberTwoFactorOnServer(input: { workspaceId: string; membershipId: string }): Promise<{ removed: number }> {
  const actor = await requireOps("clients");
  const { data: member } = await db()
    .from("workspace_members")
    .select("user_id")
    .eq("id", input.membershipId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (!member) throw new Error("المستخدم غير موجود في هذا العميل.");
  const userId = String(member.user_id);
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(error.message);
  let removed = 0;
  for (const factor of data?.factors ?? []) {
    const { error: deleteError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (deleteError) throw new Error(deleteError.message);
    removed += 1;
  }
  const { data: profile } = await db().from("profiles").select("email").eq("id", userId).maybeSingle();
  await log(actor, "mfa.reset", "user", userId, input.workspaceId, { email: (profile?.email as string | undefined) ?? null, removed });
  return { removed };
}

// ---------------- Contact messages (/contact) ----------------
export interface OpsContactMessage {
  id: string;
  topic: string;
  name: string;
  company: string | null;
  email: string;
  mobile: string;
  message: string;
  status: "new" | "handled";
  createdAt: string;
  handledAt: string | null;
  handledBy: string | null;
}

export async function listContactMessagesOnServer(): Promise<OpsContactMessage[]> {
  await requireOps("clients");
  const { data, error } = await db()
    .from("contact_messages")
    .select("id,topic,name,company,email,mobile,message,status,created_at,handled_at,handled_by")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const handlerIds = [...new Set(rows.map((r) => r["handled_by"]).filter((v): v is string => typeof v === "string"))];
  const { data: staff } = handlerIds.length ? await db().from("ops_staff").select("user_id,email,full_name").in("user_id", handlerIds) : { data: [] };
  const staffName = new Map(((staff ?? []) as Row[]).map((r) => [String(r["user_id"]), String(r["full_name"] ?? r["email"] ?? "")]));
  return rows.map((r) => ({
    id: String(r["id"]),
    topic: String(r["topic"]),
    name: String(r["name"]),
    company: typeof r["company"] === "string" ? r["company"] : null,
    email: String(r["email"]),
    mobile: String(r["mobile"]),
    message: String(r["message"]),
    status: r["status"] === "handled" ? "handled" : "new",
    createdAt: String(r["created_at"]),
    handledAt: typeof r["handled_at"] === "string" ? r["handled_at"] : null,
    handledBy: typeof r["handled_by"] === "string" ? staffName.get(r["handled_by"]) || null : null,
  }));
}

export async function setContactMessageHandledOnServer(input: { id: string; handled: boolean }): Promise<void> {
  const actor = await requireOps("clients");
  const { error } = await db()
    .from("contact_messages")
    .update(input.handled ? { status: "handled", handled_at: new Date().toISOString(), handled_by: actor.userId } : { status: "new", handled_at: null, handled_by: null })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  await log(actor, input.handled ? "contact.handled" : "contact.reopened", "contact_message", input.id, null);
}

// ---------------- Tasks (action center) ----------------
/** Last sign-in per user; one admin page covers every account the platform has today. */
async function lastSignIns(): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const out = new Map<string, string>();
  for (const u of data?.users ?? []) if (u.last_sign_in_at) out.set(u.id, u.last_sign_in_at);
  return out;
}

export async function getOpsTasksOnServer(): Promise<{ tasks: OpsTask[]; finance: boolean; archivedCount: number; newMessages: number }> {
  const actor = await requireOps("clients");
  const finance = opsCan(actor.role, "subscriptions");
  const [{ data: ws }, { data: onb }, { data: subs }, { data: members }, { data: trial }, archives, logins, planRequests, usage, { data: plans }] = await Promise.all([
    db().from("workspaces").select("id,name,created_at"),
    db().from("workspace_onboarding").select("workspace_id,status,meeting_at,updated_at,contact_mobile,contact_email"),
    db().from("subscriptions").select("workspace_id,plan_id,status,ends_on,created_at").order("created_at", { ascending: false }),
    db().from("workspace_members").select("workspace_id,user_id,status"),
    db().from("workspace_audit_events").select("workspace_id").eq("event_type", TRIAL_UPLOAD_EVENT),
    latestArchiveEvents(),
    lastSignIns(),
    finance ? loadOpenPlanRequests() : Promise.resolve([]),
    finance ? loadOrderUsage() : Promise.resolve([]),
    finance ? db().from("subscription_plans").select("id,order_limit") : Promise.resolve({ data: [] }),
  ]);
  const requestedAt = new Map(planRequests.map((r) => [r.workspaceId, r.requestedAt]));
  const usageOf = new Map(usage.map((u) => [u.workspaceId, u]));
  const limitOf = new Map(((plans ?? []) as Row[]).map((p) => [String(p["id"]), typeof p["order_limit"] === "number" ? (p["order_limit"] as number) : null]));
  const { data: requests } = await db()
    .from("workspace_audit_events")
    .select("workspace_id,created_at")
    .eq("event_type", REACTIVATION_REQUEST_EVENT)
    .order("created_at", { ascending: false });
  const latestRequest = new Map<string, string>();
  for (const r of (requests ?? []) as Row[]) if (!latestRequest.has(String(r["workspace_id"]))) latestRequest.set(String(r["workspace_id"]), String(r["created_at"]));
  const onbMap = new Map(((onb ?? []) as Row[]).map((r) => [String(r["workspace_id"]), r]));
  const subMap = new Map<string, Row>();
  for (const s of (subs ?? []) as Row[]) if (!subMap.has(String(s["workspace_id"]))) subMap.set(String(s["workspace_id"]), s);
  const trialCount = new Map<string, number>();
  for (const t of (trial ?? []) as Row[]) trialCount.set(String(t["workspace_id"]), (trialCount.get(String(t["workspace_id"])) ?? 0) + 1);
  const lastLogin = new Map<string, string>();
  for (const m of (members ?? []) as Row[]) {
    if (m["status"] !== "active") continue;
    const at = logins.get(String(m["user_id"]));
    const id = String(m["workspace_id"]);
    if (at && (!lastLogin.has(id) || lastLogin.get(id)! < at)) lastLogin.set(id, at);
  }

  let archivedCount = 0;
  const clients: OpsTaskClient[] = ((ws ?? []) as Row[]).map((w) => {
    const id = String(w["id"]);
    const o = onbMap.get(id) ?? {};
    const text = (k: string) => (typeof o[k] === "string" && o[k] ? (o[k] as string) : null);
    const sub = subMap.get(id);
    const archived = archives.get(id)?.action === ARCHIVE_ACTION;
    if (archived) archivedCount += 1;
    return {
      workspaceId: id,
      name: String(w["name"]),
      status: (text("status") ?? "active") as OnboardingStatus,
      createdAt: String(w["created_at"]),
      updatedAt: text("updated_at"),
      meetingAt: text("meeting_at"),
      contactMobile: text("contact_mobile"),
      contactEmail: text("contact_email"),
      archived,
      trialUploads: trialCount.get(id) ?? 0,
      lastLogin: lastLogin.get(id) ?? null,
      // Only requests sent after the latest status change belong to the current suspension.
      reactivationRequestedAt: (() => {
        const at = latestRequest.get(id);
        const changed = text("updated_at");
        return at && (!changed || at > changed) ? at : null;
      })(),
      subscription: sub ? { status: sub["status"] as SubscriptionStatus, endsOn: (sub["ends_on"] as string | null) ?? null } : null,
      planRequestedAt: requestedAt.get(id) ?? null,
      overLimit: (() => {
        const limit = sub && LIVE_SUBSCRIPTION_STATUSES.includes(sub["status"] as SubscriptionStatus) ? limitOf.get(String(sub["plan_id"])) ?? null : null;
        const u = usageOf.get(id);
        return limit !== null && !!u && u.latest > limit && u.previous > limit;
      })(),
    };
  });
  const { count: newMessages } = await db().from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new");
  return { tasks: buildOpsTasks(clients, new Date(), { finance }), finance, archivedCount, newMessages: newMessages ?? 0 };
}

export async function getOpsUsageOnServer() {
  await requireOps("usage");
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: ws }, { data: periods }, { data: files }, { data: ai }, { data: ev }, { data: members }, lastLogin] = await Promise.all([
    db().from("workspaces").select("id,name"),
    db().from("periods").select("workspace_id,created_at"),
    db().from("audit_source_files").select("workspace_id,created_at"),
    db().from("ai_usage").select("workspace_id").gte("created_at", since),
    db().from("telegram_order_evidence").select("workspace_id"),
    db().from("workspace_members").select("workspace_id,user_id,status"),
    lastSignIns(),
  ]);
  const tally = (rows: unknown) => {
    const m = new Map<string, number>();
    for (const r of (rows ?? []) as Row[]) m.set(String(r["workspace_id"]), (m.get(String(r["workspace_id"])) ?? 0) + 1);
    return m;
  };
  const last = (rows: unknown) => {
    const m = new Map<string, string>();
    for (const r of (rows ?? []) as Row[]) {
      const k = String(r["workspace_id"]);
      const v = String(r["created_at"]);
      if (!m.has(k) || m.get(k)! < v) m.set(k, v);
    }
    return m;
  };
  const p = tally(periods), f = tally(files), a = tally(ai), e = tally(ev), lastUpload = last(files);
  return ((ws ?? []) as Row[]).map((w) => {
    const id = String(w["id"]);
    const mem = ((members ?? []) as Row[]).filter((m) => m["workspace_id"] === id && m["status"] === "active");
    const logins = mem.map((m) => lastLogin.get(String(m["user_id"]))).filter(Boolean) as string[];
    return {
      workspaceId: id, name: String(w["name"]), users: mem.length, audits: p.get(id) ?? 0, uploads: f.get(id) ?? 0,
      aiCalls30d: a.get(id) ?? 0, evidence: e.get(id) ?? 0, lastUpload: lastUpload.get(id) ?? null,
      lastLogin: logins.sort().at(-1) ?? null,
    };
  });
}

// ---------------- Logs ----------------
export async function getOpsLogsOnServer() {
  await requireOps("logs");
  const [{ data: ops }, { data: wsEvents }, { data: ws }, { data: profiles }] = await Promise.all([
    db().from("ops_audit_log").select("*").order("created_at", { ascending: false }).limit(200),
    db().from("workspace_audit_events").select("*").order("created_at", { ascending: false }).limit(200),
    db().from("workspaces").select("id,name"),
    db().from("profiles").select("id,email"),
  ]);
  const names = new Map(((ws ?? []) as Row[]).map((w) => [String(w["id"]), String(w["name"])]));
  const emails = new Map(((profiles ?? []) as Row[]).map((p) => [String(p["id"]), (p["email"] as string | null) ?? null]));
  const a = ((ops ?? []) as Row[]).map((r) => {
    const meta = (r["metadata"] ?? {}) as Row;
    // Deleted clients keep their name in the event metadata only.
    const workspace = (r["workspace_id"] ? names.get(String(r["workspace_id"])) : null) ?? (typeof meta["name"] === "string" ? meta["name"] : null) ?? "—";
    return { id: String(r["id"]), source: "ops" as const, action: String(r["action"]), actor: (r["actor_email"] as string) ?? "—", workspace, details: JSON.stringify(meta), createdAt: String(r["created_at"]) };
  });
  const b = ((wsEvents ?? []) as Row[]).map((r) => ({ id: String(r["id"]), source: "client" as const, action: String(r["event_type"]), actor: emails.get(String(r["actor_user_id"])) ?? String(r["actor_user_id"]).slice(0, 8), workspace: names.get(String(r["workspace_id"])) ?? "—", details: JSON.stringify(r["metadata"] ?? {}), createdAt: String(r["created_at"]) }));
  return [...a, ...b].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 300);
}

// ---------------- Staff ----------------
export async function listOpsStaffOnServer() {
  await requireOps("staff");
  const { data } = await db().from("ops_staff").select("*").order("created_at");
  return ((data ?? []) as Row[]).map((r) => ({ userId: String(r["user_id"]), email: (r["email"] as string) ?? null, fullName: (r["full_name"] as string) ?? null, role: r["role"] as OpsRole }));
}

export async function addOpsStaffOnServer(input: { email: string; fullName?: string; role: OpsRole; password?: string }) {
  const actor = await requireOps("staff");
  const email = input.email.trim().toLowerCase();
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  let user = list?.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    if (!input.password || input.password.length < 8) throw new Error("هذا البريد ليس له حساب — أدخل كلمة مرور (8 أحرف على الأقل).");
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName ?? "", tadqeeq_invited: true, ops_staff: true },
    });
    if (error || !data.user) throw new Error(error?.message ?? "تعذّر إنشاء الحساب.");
    user = data.user;
  }
  const { error } = await db().from("ops_staff").upsert({ user_id: user.id, email, full_name: input.fullName?.trim() || null, role: input.role }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await log(actor, "staff.add", "ops_staff", user.id, null, { email, role: input.role });
}

export async function removeOpsStaffOnServer(userId: string) {
  const actor = await requireOps("staff");
  if (userId === actor.userId) throw new Error("لا يمكنك إزالة نفسك.");
  await db().from("ops_staff").delete().eq("user_id", userId);
  await log(actor, "staff.remove", "ops_staff", userId, null);
}
