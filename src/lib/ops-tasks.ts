import type { OnboardingStatus } from "./onboarding";
import type { SubscriptionStatus } from "./ops";
import { TRIAL_UPLOAD_LIMIT } from "./plans";

export type OpsTaskKind =
  | "reactivation_request"
  | "plan_request"
  | "trial_used"
  | "new_signup"
  | "meeting_missed"
  | "meeting_upcoming"
  | "awaiting_payment"
  | "ready_to_activate"
  | "overdue"
  | "renewal_due"
  | "over_limit"
  | "no_subscription"
  | "inactive";

/** Task groups in the order they are shown; `finance` groups are only built for roles that see subscriptions. */
export const OPS_TASK_GROUPS: { kind: OpsTaskKind; title: string; hint: string; finance?: boolean }[] = [
  { kind: "reactivation_request", title: "طلبات إعادة التفعيل", hint: "عملاء موقوفون طلبوا إعادة التفعيل — تأكد من السداد ثم فعّل الحساب." },
  { kind: "plan_request", title: "طلبات باقات", hint: "اختار العميل باقة من داخل حسابه — أرسل الفاتورة، وبعد التحويل أنشئ الاشتراك أو حدّثه.", finance: true },
  { kind: "trial_used", title: "جرّبوا المنصة ولم يشتركوا", hint: "رفعوا ملف التجربة — أفضل وقت للتواصل وعرض الاشتراك." },
  { kind: "new_signup", title: "تسجيلات جديدة", hint: "لم يكملوا بيانات الشركة بعد." },
  { kind: "meeting_missed", title: "اجتماعات مضت ولم تُحدَّث", hint: "حدّث الحالة بعد الاجتماع: بانتظار التحويل أو إيقاف." },
  { kind: "meeting_upcoming", title: "اجتماعات قادمة", hint: "مرتبة حسب الموعد." },
  { kind: "awaiting_payment", title: "بانتظار التحويل", hint: "تابع التحويل البنكي ثم سجّل الدفعة." },
  { kind: "ready_to_activate", title: "جاهزون للتفعيل", hint: "تم الدفع — أكمل التهيئة وفعّل الحساب." },
  { kind: "overdue", title: "اشتراكات متأخرة", hint: "انتهت أو متأخرة السداد.", finance: true },
  { kind: "renewal_due", title: "تجديدات خلال 14 يوماً", hint: "ذكّر العميل قبل انتهاء الاشتراك.", finance: true },
  { kind: "over_limit", title: "تجاوزوا حد الباقة شهرين", hint: "طلباتهم أعلى من حد باقتهم في آخر شهرين — رقِّ الباقة من الاشتراكات.", finance: true },
  { kind: "no_subscription", title: "مفعّلون بلا اشتراك", hint: "حساب مفعّل بدون اشتراك مسجّل.", finance: true },
  { kind: "inactive", title: "عملاء غير نشطين", hint: "مفعّلون ولم يدخل أحد منهم منذ 14 يوماً." },
];

export interface OpsTaskClient {
  workspaceId: string;
  name: string;
  status: OnboardingStatus;
  createdAt: string;
  updatedAt: string | null;
  meetingAt: string | null;
  contactMobile: string | null;
  contactEmail: string | null;
  archived: boolean;
  trialUploads: number;
  lastLogin: string | null;
  /** Sent by a suspended client after the latest status change. */
  reactivationRequestedAt: string | null;
  subscription: { status: SubscriptionStatus; endsOn: string | null } | null;
  /** A plan the client requested from the app that no subscription change has answered yet. */
  planRequestedAt?: string | null;
  /** Monthly orders above the plan's limit in the latest two months of data. */
  overLimit?: boolean;
}

export interface OpsTask {
  kind: OpsTaskKind;
  workspaceId: string;
  name: string;
  contactMobile: string | null;
  contactEmail: string | null;
  /** The date the task is about: signup, meeting, last update, subscription end or last login. */
  date: string | null;
}

const DAY = 864e5;
export const INACTIVE_DAYS = 14;
export const RENEWAL_DAYS = 14;

export function buildOpsTasks(clients: OpsTaskClient[], now: Date, opts: { finance: boolean }): OpsTask[] {
  const today = now.toISOString().slice(0, 10);
  const renewalLimit = new Date(now.getTime() + RENEWAL_DAYS * DAY).toISOString().slice(0, 10);
  const inactiveBefore = new Date(now.getTime() - INACTIVE_DAYS * DAY).toISOString();
  const tasks: OpsTask[] = [];

  for (const c of clients) {
    if (c.archived) continue;
    const add = (kind: OpsTaskKind, date: string | null) =>
      tasks.push({ kind, workspaceId: c.workspaceId, name: c.name, contactMobile: c.contactMobile, contactEmail: c.contactEmail, date });

    if (opts.finance && c.planRequestedAt) add("plan_request", c.planRequestedAt);

    switch (c.status) {
      case "pending_details":
        add(c.trialUploads >= TRIAL_UPLOAD_LIMIT ? "trial_used" : "new_signup", c.createdAt);
        break;
      case "meeting_booked":
        if (c.meetingAt && c.meetingAt >= now.toISOString()) add("meeting_upcoming", c.meetingAt);
        else add("meeting_missed", c.meetingAt ?? c.updatedAt ?? c.createdAt);
        break;
      case "awaiting_payment":
        add("awaiting_payment", c.updatedAt ?? c.createdAt);
        break;
      case "onboarding":
        add("ready_to_activate", c.updatedAt ?? c.createdAt);
        break;
      case "active": {
        const sub = c.subscription;
        if (opts.finance) {
          if (!sub) add("no_subscription", c.createdAt);
          else if (sub.status === "overdue" || (sub.status === "active" && sub.endsOn && sub.endsOn < today)) add("overdue", sub.endsOn);
          else if (sub.status === "active" && sub.endsOn && sub.endsOn <= renewalLimit) add("renewal_due", sub.endsOn);
          if (sub && c.overLimit) add("over_limit", null);
        }
        const seen = c.lastLogin ?? c.createdAt;
        if (seen < inactiveBefore) add("inactive", c.lastLogin);
        break;
      }
      case "suspended":
        if (c.reactivationRequestedAt) add("reactivation_request", c.reactivationRequestedAt);
        break;
    }
  }

  const order = new Map(OPS_TASK_GROUPS.map((g, i) => [g.kind, i]));
  // Upcoming meetings and renewals soonest first; everything else oldest (most waiting) first.
  return tasks.sort((a, b) => order.get(a.kind)! - order.get(b.kind)! || (a.date ?? "").localeCompare(b.date ?? ""));
}

/** Ready-to-send reminder for a renewal or overdue task (WhatsApp text and email subject/body); null for other tasks. */
export function renewalReminder(task: Pick<OpsTask, "kind" | "name">, endDate: string): { subject: string; body: string } | null {
  if (task.kind !== "renewal_due" && task.kind !== "overdue") return null;
  const lead =
    task.kind === "renewal_due"
      ? `نذكّركم بأن اشتراككم في تدقيق ينتهي في ${endDate}.`
      : `انتهى اشتراككم في تدقيق في ${endDate} ولم يصلنا التجديد بعد.`;
  return {
    subject: "تذكير بتجديد اشتراك تدقيق",
    body: `مرحباً ${task.name}،\n${lead} للتجديد يكفي الرد على هذه الرسالة وسنرسل لكم الفاتورة.\n\nشكراً لكم،\nفريق تدقيق`,
  };
}
