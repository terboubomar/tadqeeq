export type OnboardingStatus =
  | "pending_details"
  | "meeting_booked"
  | "awaiting_payment"
  | "onboarding"
  | "active"
  | "suspended";

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  pending_details: "بانتظار بيانات الشركة",
  meeting_booked: "تم حجز الاجتماع",
  awaiting_payment: "بانتظار التحويل",
  onboarding: "جاري التهيئة",
  active: "مفعّل",
  suspended: "موقوف",
};

export const ONBOARDING_STEPS: OnboardingStatus[] = [
  "pending_details",
  "meeting_booked",
  "awaiting_payment",
  "onboarding",
  "active",
];

export interface OnboardingRecord {
  workspaceId: string;
  workspaceName: string;
  status: OnboardingStatus;
  legalName: string | null;
  brandName: string | null;
  crNumber: string | null;
  vatNumber: string | null;
  contactName: string | null;
  contactMobile: string | null;
  contactNationalId: string | null;
  contactEmail: string | null;
  branchCount: number | null;
  logoUrl: string | null;
  meetingAt: string | null;
  meetingNote: string | null;
  adminNote: string | null;
  submittedAt: string | null;
  paidAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  /** Set only while the workspace is suspended. */
  suspension: SuspensionInfo | null;
}

export type SuspensionReason = "payment" | "request" | "other";

export const SUSPENSION_REASONS: Record<SuspensionReason, { label: string; title: string; body: string }> = {
  payment: {
    label: "المدفوعات (لا يوجد اشتراك ساري أو لم يُسدَّد)",
    title: "تم إيقاف حسابك بسبب المدفوعات",
    body: "لا يوجد اشتراك ساري لحسابك أو لم نستلم سداد الاشتراك، لذلك أوقفنا جميع ميزات تدقيق مؤقتاً حتى تجديد الاشتراك.",
  },
  request: {
    label: "بطلب من العميل",
    title: "تم إيقاف حسابك بناءً على طلبك",
    body: "أوقفنا حسابك مؤقتاً كما طلبت. يمكنك طلب إعادة التفعيل في أي وقت.",
  },
  other: {
    label: "سبب آخر",
    title: "تم إيقاف حسابك مؤقتاً",
    body: "أوقف فريق تدقيق حسابك مؤقتاً. تواصل معنا لمعرفة التفاصيل وإعادة التفعيل.",
  },
};

export const isSuspensionReason = (v: unknown): v is SuspensionReason => typeof v === "string" && v in SUSPENSION_REASONS;

export interface SuspensionInfo {
  reason: SuspensionReason;
  /** Message the ops team wrote for the client when suspending. */
  message: string | null;
  since: string | null;
  /** Latest reactivation request sent after the suspension, if any. */
  reactivationRequestedAt: string | null;
  subscription: { planName: string | null; price: number; cycle: "monthly" | "yearly"; status: string; endsOn: string | null } | null;
}

export const REACTIVATION_REQUEST_EVENT = "reactivation.request";
/** At most one reactivation request an hour, even across suspensions (docs/SECURITY_BUILD_SPEC.md, L2). */
export const REACTIVATION_REQUEST_REPEAT_MS = 60 * 60_000;

/** True when the last request was made less than `windowMs` before `now`. */
export function requestedWithin(lastRequestedAt: string | null, now: Date, windowMs: number): boolean {
  if (!lastRequestedAt) return false;
  const at = Date.parse(lastRequestedAt);
  return Number.isFinite(at) && now.getTime() - at < windowMs;
}

/**
 * Why the workspace is suspended, from ops audit events newest first. Suspensions without a
 * recorded reason (older ones, or from a cancelled subscription) are treated as payment.
 */
export function latestSuspension(events: { action: string; metadata: Record<string, unknown> | null; createdAt: string }[]): {
  reason: SuspensionReason;
  message: string | null;
  since: string | null;
} {
  for (const e of events) {
    const m = e.metadata ?? {};
    if (e.action === "client.status") {
      if (m["status"] !== "suspended") break;
      return {
        reason: isSuspensionReason(m["reason"]) ? m["reason"] : "payment",
        message: typeof m["message"] === "string" && m["message"].trim() ? m["message"].trim() : null,
        since: e.createdAt,
      };
    }
    if (e.action === "client.archive") return { reason: "other", message: null, since: e.createdAt };
    if ((e.action === "subscription.create" || e.action === "subscription.update") && (m["status"] === "suspended" || m["status"] === "cancelled")) {
      return { reason: "payment", message: null, since: e.createdAt };
    }
  }
  return { reason: "payment", message: null, since: null };
}

const toAsciiDigits = (value: string) =>
  value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s-]/g, "");

export function normalizeDigits(value: string): string {
  return toAsciiDigits(value.trim());
}

export function isValidCr(value: string): boolean {
  return /^[1-7]\d{9}$/.test(normalizeDigits(value));
}

export function isValidVat(value: string): boolean {
  return /^3\d{13}3$/.test(normalizeDigits(value));
}

export function normalizeSaudiMobile(value: string): string | null {
  let v = normalizeDigits(value).replace(/^\+/, "");
  if (v.startsWith("00966")) v = v.slice(5);
  else if (v.startsWith("966")) v = v.slice(3);
  else if (v.startsWith("0")) v = v.slice(1);
  return /^5\d{8}$/.test(v) ? `+966${v}` : null;
}

export function isValidNationalId(value: string): boolean {
  return /^[12]\d{9}$/.test(normalizeDigits(value));
}

/** Sun–Thu, 10:00–17:00 Riyadh time (UTC+3). */
export function isValidMeetingSlot(iso: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getTime() < Date.now() + 60 * 60 * 1000) return false;
  const riyadh = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const day = riyadh.getUTCDay();
  const hour = riyadh.getUTCHours();
  return day >= 0 && day <= 4 && hour >= 10 && hour < 17;
}

export const MEETING_HOURS = [10, 11, 12, 13, 14, 15, 16];

/** The company details a new account fills in on its first sign-in (/onboarding). */
export interface CompanyProfileInput {
  legalName: string;
  crNumber: string;
  /** Optional: small restaurants may not be VAT-registered. */
  vatNumber: string;
  brandName: string;
  contactName: string;
  contactEmail: string;
  contactMobile: string;
}

export type CompanyProfileField = keyof CompanyProfileInput | "logo";

/** Field errors for the company details, in Arabic; an empty object means valid. */
export function companyProfileErrors(input: CompanyProfileInput, hasLogo: boolean): Partial<Record<CompanyProfileField, string>> {
  const errors: Partial<Record<CompanyProfileField, string>> = {};
  if (!input.legalName.trim()) errors.legalName = "اسم الشركة مطلوب";
  if (!isValidCr(input.crNumber)) errors.crNumber = "رقم السجل التجاري 10 أرقام";
  if (input.vatNumber.trim() && !isValidVat(input.vatNumber)) errors.vatNumber = "الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3";
  if (!input.brandName.trim()) errors.brandName = "العلامة التجارية مطلوبة";
  if (!hasLogo) errors.logo = "أرفق شعار العلامة";
  if (!input.contactName.trim()) errors.contactName = "اسم المسؤول مطلوب";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail.trim())) errors.contactEmail = "بريد إلكتروني غير صحيح";
  if (!normalizeSaudiMobile(input.contactMobile)) errors.contactMobile = "جوال سعودي 05XXXXXXXX";
  return errors;
}

/**
 * Whether this person must fill in the company details before using the app: the owner or an admin of a new
 * (trial) workspace whose company name or CR is still empty. Invited members, active customers and platform
 * admins never are.
 */
export function needsCompanyProfile(input: {
  status: string;
  role: string;
  isPlatformAdmin: boolean;
  legalName: string | null;
  crNumber: string | null;
}): boolean {
  if (input.isPlatformAdmin) return false;
  if (input.status !== "pending_details") return false;
  if (input.role !== "owner" && input.role !== "admin") return false;
  return !input.legalName?.trim() || !input.crNumber?.trim();
}
