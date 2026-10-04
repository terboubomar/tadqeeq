import { ONBOARDING_STATUS_LABELS, type OnboardingStatus } from "./onboarding";
import { isTrialStatus } from "./plans";

export type OpsRole = "owner" | "finance" | "sales" | "support";
export type OpsSection = "overview" | "clients" | "subscriptions" | "payments" | "usage" | "logs" | "staff";

export const OPS_ROLE_LABELS: Record<OpsRole, string> = {
  owner: "مالك",
  finance: "مالية",
  sales: "مبيعات",
  support: "دعم",
};

export const OPS_ACCESS: Record<OpsRole, readonly OpsSection[]> = {
  owner: ["overview", "clients", "subscriptions", "payments", "usage", "logs", "staff"],
  finance: ["overview", "clients", "subscriptions", "payments", "logs"],
  sales: ["overview", "clients", "subscriptions"],
  support: ["clients", "usage", "logs"],
};

export function opsCan(role: OpsRole | null | undefined, section: OpsSection): boolean {
  return !!role && OPS_ACCESS[role].includes(section);
}

export type SubscriptionStatus = "trial" | "active" | "overdue" | "cancelled" | "suspended";
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: "تجريبي",
  active: "نشط",
  overdue: "متأخر السداد",
  cancelled: "ملغى",
  suspended: "موقوف",
};

/** Subscription statuses that keep a client's account open. */
export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = ["trial", "active", "overdue"];

/**
 * What saving a subscription does to the client's account:
 * - suspended/cancelled locks it, unless another live subscription (the new plan after an upgrade) keeps it open;
 * - active opens a suspended account and ends the free trial of a client not activated yet.
 * Archived clients are left alone (they are restored from the archive).
 */
export function subscriptionAccessChange(input: {
  status: SubscriptionStatus;
  onboardingStatus: OnboardingStatus | null;
  otherLiveSubscription: boolean;
  archived: boolean;
}): "suspend" | "activate" | null {
  const { status, onboardingStatus } = input;
  if (!onboardingStatus || input.archived) return null;
  if (status === "suspended" || status === "cancelled") {
    return input.otherLiveSubscription || onboardingStatus === "suspended" ? null : "suspend";
  }
  if (status === "active" && (onboardingStatus === "suspended" || isTrialStatus(onboardingStatus))) return "activate";
  return null;
}

export type Cycle = "monthly" | "yearly";
export const CYCLE_LABELS: Record<Cycle, string> = { monthly: "شهري", yearly: "سنوي" };

export function isOpsHost(host: string): boolean {
  const h = host.toLowerCase();
  return h.startsWith("ops.");
}

/** Hosts where the ops area may be opened (ops subdomain, local dev, Lovable previews). */
export function opsAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return isOpsHost(h) || h.startsWith("localhost") || h.startsWith("127.0.0.1") || h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com");
}

export const sarFmt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n)) + " ر.س";

/** Readable names for ops and client audit events shown in the logs. */
export const OPS_ACTION_LABELS: Record<string, string> = {
  "client.status": "تغيير حالة العميل",
  "client.update": "تعديل بيانات العميل",
  "client.note": "ملاحظة على العميل",
  "client.archive": "أرشفة عميل",
  "client.unarchive": "استعادة عميل من الأرشيف",
  "client.delete": "حذف عميل نهائياً",
  "subscription.create": "إنشاء اشتراك",
  "subscription.update": "تعديل اشتراك",
  "plan.create": "إنشاء باقة",
  "plan.update": "تعديل باقة",
  "payment.record": "تسجيل دفعة",
  "payment.delete": "حذف دفعة",
  "staff.add": "إضافة عضو للفريق",
  "staff.remove": "إزالة عضو من الفريق",
  "trial.upload": "رفع ملف التجربة",
  "plan.request": "طلب باقة من التطبيق",
  "reactivation.request": "طلب إعادة تفعيل",
  user_invited: "دعوة مستخدم",
  user_access_changed: "تغيير صلاحيات مستخدم",
  user_suspended: "إيقاف مستخدم",
  user_removed: "إزالة مستخدم",
  user_password_set: "تعيين كلمة مرور",
};

export const opsActionLabel = (action: string) => OPS_ACTION_LABELS[action] ?? action;

/** One-line Arabic summary of an audit event's details, for timelines. Empty when there is nothing useful to add. */
export function opsEventSummary(action: string, detailsJson: string): string {
  let d: Record<string, unknown> = {};
  try {
    d = JSON.parse(detailsJson) as Record<string, unknown>;
  } catch {
    return "";
  }
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  switch (action) {
    case "client.status": {
      const s = str("status");
      return s ? `الحالة: ${ONBOARDING_STATUS_LABELS[s as OnboardingStatus] ?? s}` : "";
    }
    case "client.unarchive": {
      const s = str("restoredStatus");
      return s ? `أُعيد إلى: ${ONBOARDING_STATUS_LABELS[s as OnboardingStatus] ?? s}` : "";
    }
    case "client.update":
      return str("name") ? `الاسم: ${str("name")}` : "";
    case "subscription.create":
    case "subscription.update": {
      const status = str("status");
      const price = num("price");
      const cycle = str("cycle");
      return [
        status ? SUBSCRIPTION_STATUS_LABELS[status as SubscriptionStatus] ?? status : null,
        price !== null ? sarFmt(price) : null,
        cycle ? CYCLE_LABELS[cycle as Cycle] ?? cycle : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "payment.record":
      return num("amount") !== null ? sarFmt(num("amount")!) : "";
    case "trial.upload":
      return str("platform") ?? "";
    case "user_invited":
    case "user_access_changed":
      return [str("email"), str("role")].filter(Boolean).join(" · ");
    default:
      return "";
  }
}
