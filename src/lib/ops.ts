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
  user_invited: "دعوة مستخدم",
  user_access_changed: "تغيير صلاحيات مستخدم",
  user_suspended: "إيقاف مستخدم",
  user_removed: "إزالة مستخدم",
  user_password_set: "تعيين كلمة مرور",
};

export const opsActionLabel = (action: string) => OPS_ACTION_LABELS[action] ?? action;
