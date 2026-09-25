import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  isValidCr,
  isValidMeetingSlot,
  isValidNationalId,
  isValidVat,
  normalizeDigits,
  normalizeSaudiMobile,
  type OnboardingRecord,
  type OnboardingStatus,
} from "./onboarding";
import { requireServerUserAnyStatus } from "./server-auth.server";

const LOGO_BUCKET = "workspace-logos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

type Row = Record<string, unknown>;

async function toRecord(row: Row, workspaceName: string): Promise<OnboardingRecord> {
  let logoUrl: string | null = null;
  if (typeof row.logo_path === "string" && row.logo_path) {
    const { data } = await supabaseAdmin.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(row.logo_path, 3600);
    logoUrl = data?.signedUrl ?? null;
  }
  const s = (k: string) => (typeof row[k] === "string" ? (row[k] as string) : null);
  return {
    workspaceId: row.workspace_id as string,
    workspaceName,
    status: row.status as OnboardingStatus,
    legalName: s("legal_name"),
    brandName: s("brand_name"),
    crNumber: s("cr_number"),
    vatNumber: s("vat_number"),
    contactName: s("contact_name"),
    contactMobile: s("contact_mobile"),
    contactNationalId: s("contact_national_id"),
    contactEmail: s("contact_email"),
    branchCount: typeof row.branch_count === "number" ? row.branch_count : null,
    logoUrl,
    meetingAt: s("meeting_at"),
    meetingNote: s("meeting_note"),
    adminNote: s("admin_note"),
    submittedAt: s("submitted_at"),
    paidAt: s("paid_at"),
    activatedAt: s("activated_at"),
    createdAt: s("created_at") ?? "",
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
  return toRecord(row, ctx.workspaceName);
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
    const bytes = Buffer.from(match[3], "base64");
    if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("حجم الشعار يجب ألا يتجاوز 2MB.");
    const ext = match[2] === "jpeg" ? "jpg" : match[2] === "svg+xml" ? "svg" : match[2];
    logoPath = `${ctx.workspaceId}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(LOGO_BUCKET)
      .upload(logoPath, bytes, { contentType: match[1], upsert: true });
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
    ((rows ?? []) as Row[]).map((row) => toRecord(row, names.get(row.workspace_id as string) ?? "—")),
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
  if (input.adminNote !== undefined) patch.admin_note = input.adminNote.trim() || null;
  if (input.status === "onboarding") patch.paid_at = now;
  if (input.status === "active") patch.activated_at = now;
  const { error } = await db()
    .from("workspace_onboarding")
    .update(patch)
    .eq("workspace_id", input.workspaceId);
  if (error) throw new Error(error.message);
}
