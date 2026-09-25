import { getRequestHeader } from "@tanstack/react-start/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { opsCan, type Cycle, type OpsRole, type OpsSection, type SubscriptionStatus } from "./ops";
import type { OnboardingStatus } from "./onboarding";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;
type Row = Record<string, unknown>;
const RECEIPTS = "ops-receipts";
const LOGOS = "workspace-logos";

export interface OpsActor {
  userId: string;
  email: string | null;
  role: OpsRole;
}

async function currentUser() {
  const header = getRequestHeader("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function getOpsMeOnServer(): Promise<OpsActor | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data } = await db().from("ops_staff").select("role").eq("user_id", user.id).maybeSingle();
  if (!data) return null;
  return { userId: user.id, email: user.email ?? null, role: data.role as OpsRole };
}

async function requireOps(section: OpsSection): Promise<OpsActor> {
  const me = await getOpsMeOnServer();
  if (!me) throw new Error("لا تملك صلاحية الدخول إلى لوحة العمليات.");
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
const today = () => new Date().toISOString().slice(0, 10);

// ---------------- Overview ----------------
export async function getOpsOverviewOnServer() {
  await requireOps("overview");
  const [{ data: subs }, { data: onb }, { data: pays }] = await Promise.all([
    db().from("subscriptions").select("workspace_id,price,cycle,status,ends_on,created_at"),
    db().from("workspace_onboarding").select("workspace_id,status,created_at"),
    db().from("payments").select("amount,paid_on"),
  ]);
  const subRows = (subs ?? []) as Row[];
  const onbRows = (onb ?? []) as Row[];
  const payRows = (pays ?? []) as Row[];
  const t = today();
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const billable = subRows.filter((s) => s["status"] === "active" || s["status"] === "overdue");
  const arr = billable.reduce((a, s) => a + yearly(Number(s["price"]), String(s["cycle"])), 0);
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
}

export async function listOpsClientsOnServer(): Promise<OpsClient[]> {
  await requireOps("clients");
  const [{ data: ws }, { data: onb }, { data: members }, { data: subs }, { data: pays }, { data: profiles }] = await Promise.all([
    db().from("workspaces").select("id,name,owner_user_id,created_at"),
    db().from("workspace_onboarding").select("*"),
    db().from("workspace_members").select("workspace_id,status"),
    db().from("subscriptions").select("workspace_id,price,cycle,status,ends_on,created_at").order("created_at", { ascending: false }),
    db().from("payments").select("workspace_id,amount"),
    db().from("profiles").select("id,email"),
  ]);
  const onbMap = new Map(((onb ?? []) as Row[]).map((r) => [String(r["workspace_id"]), r]));
  const emails = new Map(((profiles ?? []) as Row[]).map((r) => [String(r["id"]), (r["email"] as string) ?? null]));
  const subMap = new Map<string, Row>();
  for (const s of (subs ?? []) as Row[]) if (!subMap.has(String(s["workspace_id"]))) subMap.set(String(s["workspace_id"]), s);
  const userCount = new Map<string, number>();
  for (const m of (members ?? []) as Row[]) if (m["status"] === "active") userCount.set(String(m["workspace_id"]), (userCount.get(String(m["workspace_id"])) ?? 0) + 1);
  const paid = new Map<string, number>();
  for (const p of (pays ?? []) as Row[]) paid.set(String(p["workspace_id"]), (paid.get(String(p["workspace_id"])) ?? 0) + Number(p["amount"]));

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
      const sub = subMap.get(id);
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
      } satisfies OpsClient;
    }),
  );
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function setOpsClientStatusOnServer(input: { workspaceId: string; status: OnboardingStatus; adminNote?: string }) {
  const actor = await requireOps("clients");
  if (actor.role === "support") throw new Error("دور الدعم لا يستطيع تغيير حالة العميل.");
  const now = new Date().toISOString();
  const patch: Row = { status: input.status, updated_at: now };
  if (input.adminNote !== undefined) patch["admin_note"] = input.adminNote.trim() || null;
  if (input.status === "onboarding") patch["paid_at"] = now;
  if (input.status === "active") patch["activated_at"] = now;
  const { data: existing } = await db().from("workspace_onboarding").select("workspace_id").eq("workspace_id", input.workspaceId).maybeSingle();
  const { error } = existing
    ? await db().from("workspace_onboarding").update(patch).eq("workspace_id", input.workspaceId)
    : await db().from("workspace_onboarding").insert({ workspace_id: input.workspaceId, ...patch });
  if (error) throw new Error(error.message);
  await log(actor, "client.status", "workspace", input.workspaceId, input.workspaceId, { status: input.status });
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
  const { data } = await db().from("subscription_plans").select("*").order("created_at");
  return ((data ?? []) as Row[]).map((r) => ({ id: String(r["id"]), name: String(r["name"]), pricing: r["pricing"] as "fixed" | "per_branch", price: Number(r["price"]), cycle: r["cycle"] as Cycle, active: r["active"] === true }));
}

export async function savePlanOnServer(input: { id?: string; name: string; pricing: "fixed" | "per_branch"; price: number; cycle: Cycle; active: boolean }) {
  const actor = await requireOps("subscriptions");
  if (actor.role === "sales" || actor.role === "support") throw new Error("المالية أو المالك فقط يعدّل الباقات.");
  const row = { name: input.name.trim(), pricing: input.pricing, price: input.price, cycle: input.cycle, active: input.active };
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
  }));
}

export async function saveSubscriptionOnServer(input: {
  id?: string; workspaceId: string; planId: string | null; price: number; branchCount: number; cycle: Cycle; status: SubscriptionStatus; startsOn: string; endsOn: string | null; notes?: string;
}) {
  const actor = await requireOps("subscriptions");
  if (actor.role === "support") throw new Error("لا تملك صلاحية تعديل الاشتراكات.");
  const row = {
    workspace_id: input.workspaceId, plan_id: input.planId, price: input.price, branch_count: input.branchCount, cycle: input.cycle,
    status: input.status, starts_on: input.startsOn, ends_on: input.endsOn || null, notes: input.notes?.trim() || null, updated_at: new Date().toISOString(),
  };
  const { error } = input.id ? await db().from("subscriptions").update(row).eq("id", input.id) : await db().from("subscriptions").insert(row);
  if (error) throw new Error(error.message);
  // Sync workspace access with subscription state.
  if (input.status === "suspended" || input.status === "cancelled") {
    await db().from("workspace_onboarding").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("workspace_id", input.workspaceId);
  } else if (input.status === "active") {
    const { data: o } = await db().from("workspace_onboarding").select("status").eq("workspace_id", input.workspaceId).maybeSingle();
    if (o?.status === "suspended") await db().from("workspace_onboarding").update({ status: "active", updated_at: new Date().toISOString() }).eq("workspace_id", input.workspaceId);
  }
  await log(actor, input.id ? "subscription.update" : "subscription.create", "subscription", input.id ?? null, input.workspaceId, { status: input.status, price: input.price, cycle: input.cycle });
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
    const m = input.receiptDataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
    if (!m) throw new Error("صيغة الإيصال غير مدعومة.");
    const mime = m[1] ?? "application/octet-stream";
    const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const bytes = Buffer.from(m[2] ?? "", "base64");
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("حجم الإيصال يجب ألا يتجاوز 5MB.");
    receiptPath = `${input.workspaceId}/${Date.now()}.${ext}`;
    const { error } = await supabaseAdmin.storage.from(RECEIPTS).upload(receiptPath, bytes, { contentType: mime });
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
export async function getOpsUsageOnServer() {
  await requireOps("usage");
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: ws }, { data: periods }, { data: files }, { data: ai }, { data: ev }, { data: members }, users] = await Promise.all([
    db().from("workspaces").select("id,name"),
    db().from("periods").select("workspace_id,created_at"),
    db().from("audit_source_files").select("workspace_id,created_at"),
    db().from("ai_usage").select("workspace_id").gte("created_at", since),
    db().from("telegram_order_evidence").select("workspace_id"),
    db().from("workspace_members").select("workspace_id,user_id,status"),
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const lastLogin = new Map<string, string>();
  for (const u of users.data?.users ?? []) if (u.last_sign_in_at) lastLogin.set(u.id, u.last_sign_in_at);
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
  const [{ data: ops }, { data: wsEvents }, { data: ws }] = await Promise.all([
    db().from("ops_audit_log").select("*").order("created_at", { ascending: false }).limit(200),
    db().from("workspace_audit_events").select("*").order("created_at", { ascending: false }).limit(200),
    db().from("workspaces").select("id,name"),
  ]);
  const names = new Map(((ws ?? []) as Row[]).map((w) => [String(w["id"]), String(w["name"])]));
  const a = ((ops ?? []) as Row[]).map((r) => ({ id: String(r["id"]), source: "ops" as const, action: String(r["action"]), actor: (r["actor_email"] as string) ?? "—", workspace: r["workspace_id"] ? names.get(String(r["workspace_id"])) ?? "—" : "—", details: JSON.stringify(r["metadata"] ?? {}), createdAt: String(r["created_at"]) }));
  const b = ((wsEvents ?? []) as Row[]).map((r) => ({ id: String(r["id"]), source: "client" as const, action: String(r["event_type"]), actor: String(r["actor_user_id"]).slice(0, 8), workspace: names.get(String(r["workspace_id"])) ?? "—", details: JSON.stringify(r["metadata"] ?? {}), createdAt: String(r["created_at"]) }));
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
