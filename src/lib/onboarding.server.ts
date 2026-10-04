import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  isValidCr,
  isValidMeetingSlot,
  isValidNationalId,
  isValidVat,
  normalizeDigits,
  latestSuspension,
  normalizeSaudiMobile,
  REACTIVATION_REQUEST_EVENT,
  type OnboardingRecord,
  type OnboardingStatus,
  type SuspensionInfo,
} from "./onboarding";
import { isPlanAddon, PLAN_REQUEST_EVENT, type PlanAddon } from "./plans";
import { requireServerUserAnyStatus } from "./server-auth.server";

const LOGO_BUCKET = "workspace-logos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

type Row = Record<string, unknown>;

async function toRecord(row: Row, workspaceName: string): Promise<OnboardingRecord> {
  let logoUrl: string | null = null;
  if (typeof row["logo_path"] === "string" && row["logo_path"]) {
    const { data } = await supabaseAdmin.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(row["logo_path"], 3600);
    logoUrl = data?.signedUrl ?? null;
  }
  const s = (k: string) => (typeof row[k] === "string" ? (row[k] as string) : null);
  return {
    workspaceId: row["workspace_id"] as string,
    workspaceName,
    status: row["status"] as OnboardingStatus,
    legalName: s("legal_name"),
    brandName: s("brand_name"),
    crNumber: s("cr_number"),
    vatNumber: s("vat_number"),
    contactName: s("contact_name"),
    contactMobile: s("contact_mobile"),
    contactNationalId: s("contact_national_id"),
    contactEmail: s("contact_email"),
    branchCount: typeof row["branch_count"] === "number" ? row["branch_count"] : null,
    logoUrl,
    meetingAt: s("meeting_at"),
    meetingNote: s("meeting_note"),
    adminNote: s("admin_note"),
    submittedAt: s("submitted_at"),
    paidAt: s("paid_at"),
    activatedAt: s("activated_at"),
    createdAt: s("created_at") ?? "",
    suspension: null,
  };
}

export async function getMyOnboardingOnServer(): Promise<OnboardingRecord> {
  const ctx = await requireServerUserAnyStatus();
  const { data, error } = await db()
    .from("workspace_onboarding")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row: Row = data ?? {
    workspace_id: ctx.workspaceId,
    status: "active",
    created_at: new Date().toISOString(),
  };
  const record = await toRecord(row, ctx.workspaceName);
  if (record.status === "suspended") {
    record.suspension = await loadSuspension(ctx.workspaceId, typeof row["updated_at"] === "string" ? row["updated_at"] : null);
  }
  return record;
}

/** Why and since when the workspace is suspended, its last subscription, and any reactivation request. */
export async function loadSuspension(workspaceId: string, statusUpdatedAt: string | null): Promise<SuspensionInfo> {
  const [{ data: events }, { data: request }, { data: sub }] = await Promise.all([
    db()
      .from("ops_audit_log")
      .select("action,metadata,created_at")
      .eq("workspace_id", workspaceId)
      .in("action", ["client.status", "client.archive", "subscription.create", "subscription.update"])
      .order("created_at", { ascending: false })
      .limit(20),
    db()
      .from("workspace_audit_events")
      .select("created_at")
      .eq("workspace_id", workspaceId)
      .eq("event_type", REACTIVATION_REQUEST_EVENT)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from("subscriptions")
      .select("plan_id,price,cycle,status,ends_on")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const latest = latestSuspension(
    ((events ?? []) as Row[]).map((e) => ({
      action: String(e["action"]),
      metadata: (e["metadata"] ?? null) as Record<string, unknown> | null,
      createdAt: String(e["created_at"]),
    })),
  );
  let planName: string | null = null;
  if (sub?.plan_id) {
    const { data: plan } = await db().from("subscription_plans").select("name").eq("id", sub.plan_id).maybeSingle();
    planName = (plan?.name as string | undefined) ?? null;
  }
  const since = latest.since ?? statusUpdatedAt;
  const requestedAt = typeof request?.created_at === "string" ? request.created_at : null;
  return {
    ...latest,
    since,
    // A request made before the current suspension belongs to an earlier one.
    reactivationRequestedAt: requestedAt && (!since || requestedAt > since) ? requestedAt : null,
    subscription: sub
      ? {
          planName,
          price: Number(sub.price),
          cycle: sub.cycle === "yearly" ? "yearly" : "monthly",
          status: String(sub.status),
          endsOn: typeof sub.ends_on === "string" ? sub.ends_on : null,
        }
      : null,
  };
}

/** A suspended client asks the ops team to reactivate the account; shows up in the ops task list. */
export async function requestReactivationOnServer(input: { note?: string }): Promise<{ requestedAt: string }> {
  const ctx = await requireServerUserAnyStatus();
  const { data: onb } = await db().from("workspace_onboarding").select("status,updated_at").eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (onb?.status !== "suspended") throw new Error("حسابك غير موقوف.");
  const current = await loadSuspension(ctx.workspaceId, typeof onb?.updated_at === "string" ? onb.updated_at : null);
  if (current.reactivationRequestedAt) return { requestedAt: current.reactivationRequestedAt };
  const { data, error } = await db()
    .from("workspace_audit_events")
    .insert({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.actorUserId,
      event_type: REACTIVATION_REQUEST_EVENT,
      entity_type: "workspace",
      entity_id: ctx.workspaceId,
      metadata: { note: input.note?.trim() || null },
    })
    .select("created_at")
    .single();
  if (error) throw new Error(error.message);
  return { requestedAt: String(data.created_at) };
}

export interface PlanRequest {
  planId: string;
  cycle: "monthly" | "yearly";
  addons: PlanAddon[];
  requestedAt: string;
}

/** The workspace's latest plan request from the app, if any. */
export async function getMyPlanRequestOnServer(): Promise<PlanRequest | null> {
  const ctx = await requireServerUserAnyStatus();
  const { data } = await db()
    .from("workspace_audit_events")
    .select("metadata,created_at")
    .eq("workspace_id", ctx.workspaceId)
    .eq("event_type", PLAN_REQUEST_EVENT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const m = (data.metadata ?? {}) as Row;
  if (typeof m["planId"] !== "string") return null;
  return {
    planId: m["planId"],
    cycle: m["cycle"] === "yearly" ? "yearly" : "monthly",
    addons: (Array.isArray(m["addons"]) ? m["addons"] : []).filter(isPlanAddon),
    requestedAt: String(data.created_at),
  };
}

/** Records the plan the customer picked; the team activates it after the invoice is paid. */
export async function requestPlanOnServer(input: { planId: string; cycle: "monthly" | "yearly"; addons: string[] }): Promise<PlanRequest> {
  const ctx = await requireServerUserAnyStatus();
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new Error("مالك الحساب أو المدير فقط يستطيع طلب باقة.");
  const { data: plan } = await db().from("subscription_plans").select("id,active").eq("id", input.planId).maybeSingle();
  if (!plan || plan.active !== true) throw new Error("الباقة غير متاحة.");
  const addons = input.addons.filter(isPlanAddon);
  const { data, error } = await db()
    .from("workspace_audit_events")
    .insert({
      workspace_id: ctx.workspaceId,
      actor_user_id: ctx.actorUserId,
      event_type: PLAN_REQUEST_EVENT,
      entity_type: "workspace",
      entity_id: ctx.workspaceId,
      metadata: { planId: input.planId, cycle: input.cycle, addons },
    })
    .select("created_at")
    .single();
  if (error) throw new Error(error.message);
  return { planId: input.planId, cycle: input.cycle, addons, requestedAt: String(data.created_at) };
}

export interface SubmitOnboardingInput {
  legalName: string;
  brandName: string;
  crNumber: string;
  vatNumber: string;
  contactName: string;
  contactMobile: string;
  contactNationalId: string;
  contactEmail: string;
  branchCount: number;
  meetingAt: string;
  meetingNote?: string;
  logoDataUrl?: string;
}

export async function submitOnboardingOnServer(input: SubmitOnboardingInput): Promise<void> {
  const ctx = await requireServerUserAnyStatus();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new Error("مالك الحساب فقط يستطيع إكمال بيانات الشركة.");
  }
  const { data: current } = await db()
    .from("workspace_onboarding")
    .select("status,logo_path")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  const status = (current?.status ?? "pending_details") as OnboardingStatus;
  if (status !== "pending_details" && status !== "meeting_booked") {
    throw new Error("تم استلام بياناتك — تواصل معنا لأي تعديل.");
  }

  if (!input.legalName.trim() || !input.brandName.trim()) throw new Error("اسم الشركة والعلامة التجارية مطلوبان.");
  if (!isValidCr(input.crNumber)) throw new Error("رقم السجل التجاري يجب أن يكون 10 أرقام.");
  if (!isValidVat(input.vatNumber)) throw new Error("الرقم الضريبي يجب أن يكون 15 رقماً يبدأ وينتهي بـ 3.");
  const mobile = normalizeSaudiMobile(input.contactMobile);
  if (!mobile) throw new Error("رقم الجوال يجب أن يكون سعودياً (05XXXXXXXX).");
  if (!isValidNationalId(input.contactNationalId)) throw new Error("رقم الهوية/الإقامة يجب أن يكون 10 أرقام يبدأ بـ 1 أو 2.");
  if (!Number.isInteger(input.branchCount) || input.branchCount < 1 || input.branchCount > 5000) throw new Error("عدد الفروع غير صحيح.");
  if (!isValidMeetingSlot(input.meetingAt)) throw new Error("اختر موعداً من الأحد إلى الخميس بين 10 صباحاً و5 مساءً.");

  let logoPath: string | null = (current?.logo_path as string | null) ?? null;
  if (input.logoDataUrl) {
    const match = input.logoDataUrl.match(/^data:(image\/(png|jpeg|svg\+xml|webp));base64,(.+)$/);
    if (!match) throw new Error("صيغة الشعار غير مدعومة (PNG / JPG / SVG / WEBP).");
    const bytes = Buffer.from(match[3] ?? "", "base64");
    if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("حجم الشعار يجب ألا يتجاوز 2MB.");
    const kind = match[2] ?? "png";
    const ext = kind === "jpeg" ? "jpg" : kind === "svg+xml" ? "svg" : kind;
    logoPath = `${ctx.workspaceId}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(LOGO_BUCKET)
      .upload(logoPath, bytes, { contentType: match[1] ?? "image/png", upsert: true });
    if (upErr) throw new Error("تعذّر رفع الشعار.");
  }

  const now = new Date().toISOString();
  const { error } = await db()
    .from("workspace_onboarding")
    .upsert(
      {
        workspace_id: ctx.workspaceId,
        status: "meeting_booked",
        legal_name: input.legalName.trim(),
        brand_name: input.brandName.trim(),
        cr_number: normalizeDigits(input.crNumber),
        vat_number: normalizeDigits(input.vatNumber),
        contact_name: input.contactName.trim(),
        contact_mobile: mobile,
        contact_national_id: normalizeDigits(input.contactNationalId),
        contact_email: input.contactEmail.trim().toLowerCase(),
        branch_count: input.branchCount,
        logo_path: logoPath,
        meeting_at: new Date(input.meetingAt).toISOString(),
        meeting_note: input.meetingNote?.trim() || null,
        submitted_at: now,
        updated_at: now,
      },
      { onConflict: "workspace_id" },
    );
  if (error) throw new Error(error.message);

  await db()
    .from("workspaces")
    .update({ name: input.brandName.trim().slice(0, 160), updated_at: now })
    .eq("id", ctx.workspaceId);
}

async function requirePlatformAdmin() {
  const ctx = await requireServerUserAnyStatus();
  if (!ctx.isPlatformAdmin) throw new Error("هذه الصفحة لمالك المنصة فقط.");
  return ctx;
}

export async function listTenantsOnServer(): Promise<OnboardingRecord[]> {
  await requirePlatformAdmin();
  const [{ data: rows, error }, { data: workspaces }] = await Promise.all([
    db().from("workspace_onboarding").select("*").order("created_at", { ascending: false }),
    db().from("workspaces").select("id,name"),
  ]);
  if (error) throw new Error(error.message);
  const names = new Map<string, string>(
    ((workspaces ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]),
  );
  return Promise.all(
    ((rows ?? []) as Row[]).map((row) => toRecord(row, names.get(row["workspace_id"] as string) ?? "—")),
  );
}

export async function setTenantStatusOnServer(input: {
  workspaceId: string;
  status: OnboardingStatus;
  adminNote?: string;
}): Promise<void> {
  const ctx = await requirePlatformAdmin();
  if (input.workspaceId === ctx.workspaceId && input.status !== "active") {
    throw new Error("لا يمكنك إيقاف مساحة عملك.");
  }
  const now = new Date().toISOString();
  const patch: Row = { status: input.status, updated_at: now };
  if (input.adminNote !== undefined) patch["admin_note"] = input.adminNote.trim() || null;
  if (input.status === "onboarding") patch["paid_at"] = now;
  if (input.status === "active") patch["activated_at"] = now;
  const { error } = await db()
    .from("workspace_onboarding")
    .update(patch)
    .eq("workspace_id", input.workspaceId);
  if (error) throw new Error(error.message);
}
