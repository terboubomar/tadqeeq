/**
 * Client health for the ops console: green / amber / red from four signals. The worst signal decides the level,
 * and every signal that is not green gives a reason. Signals the viewer's role cannot load are left out.
 */

export type HealthLevel = "green" | "amber" | "red";

export interface HealthInput {
  /** Latest login of any member; undefined when the viewer cannot see usage, null when nobody has logged in. */
  lastLogin?: string | null;
  /** Latest file upload; undefined when unknown, null when nothing was uploaded. */
  lastUpload?: string | null;
  /** Subscription status and end date; undefined when unknown, null status when there is no subscription. */
  subscriptionStatus?: string | null;
  subscriptionEndsOn?: string | null;
  /** Orders in the latest data month and the plan's monthly limit (null for no limit). */
  orders?: number;
  orderLimit?: number | null;
}

export interface HealthSignal {
  key: "login" | "upload" | "subscription" | "usage";
  level: HealthLevel;
  reason: string;
}

export interface ClientHealth {
  level: HealthLevel;
  signals: HealthSignal[];
}

const DAY = 864e5;
const RANK: Record<HealthLevel, number> = { green: 0, amber: 1, red: 2 };

export const HEALTH_LABELS: Record<HealthLevel, string> = { green: "جيدة", amber: "تحتاج متابعة", red: "تحتاج تدخلاً" };

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

function age(days: number): string {
  return days <= 0 ? "اليوم" : days === 1 ? "أمس" : `قبل ${days} يوم`;
}

export function clientHealth(input: HealthInput, now: Date = new Date()): ClientHealth {
  const signals: HealthSignal[] = [];

  if (input.lastLogin !== undefined) {
    if (input.lastLogin === null) signals.push({ key: "login", level: "red", reason: "لم يسجّل أحد الدخول" });
    else {
      const days = daysSince(input.lastLogin, now);
      signals.push({ key: "login", level: days <= 7 ? "green" : days <= 14 ? "amber" : "red", reason: `آخر دخول ${age(days)}` });
    }
  }

  if (input.lastUpload !== undefined) {
    if (input.lastUpload === null) signals.push({ key: "upload", level: "red", reason: "لم يرفع أي ملف" });
    else {
      const days = daysSince(input.lastUpload, now);
      signals.push({ key: "upload", level: days <= 14 ? "green" : days <= 30 ? "amber" : "red", reason: `آخر رفع ${age(days)}` });
    }
  }

  if (input.subscriptionStatus !== undefined) {
    const status = input.subscriptionStatus;
    const today = now.toISOString().slice(0, 10);
    const ends = input.subscriptionEndsOn ?? null;
    if (status === null) signals.push({ key: "subscription", level: "red", reason: "بدون اشتراك" });
    else if (status === "overdue") signals.push({ key: "subscription", level: "red", reason: "الاشتراك متأخر السداد" });
    else if (status === "active" && ends && ends < today) signals.push({ key: "subscription", level: "red", reason: "الاشتراك انتهى" });
    else if (status === "active" && ends && (Date.parse(`${ends}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY <= 14) {
      signals.push({ key: "subscription", level: "amber", reason: "الاشتراك ينتهي خلال 14 يوماً" });
    } else if (status === "active") signals.push({ key: "subscription", level: "green", reason: "الاشتراك نشط" });
    else if (status === "trial") signals.push({ key: "subscription", level: "amber", reason: "فترة تجريبية" });
    else signals.push({ key: "subscription", level: "red", reason: "الاشتراك غير نشط" });
  }

  if (input.orders !== undefined && input.orderLimit) {
    const share = input.orders / input.orderLimit;
    signals.push({
      key: "usage",
      level: share <= 0.9 ? "green" : share <= 1 ? "amber" : "red",
      reason: share > 1 ? "تجاوز حد الباقة" : `استخدم ${Math.round(share * 100)}% من حد الباقة`,
    });
  }

  const level = signals.reduce<HealthLevel>((worst, signal) => (RANK[signal.level] > RANK[worst] ? signal.level : worst), "green");
  return { level, signals };
}
