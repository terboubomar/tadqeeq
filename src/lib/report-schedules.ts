/**
 * Scheduled report emails: when a schedule is due, who it goes to, and what the email says.
 * Pure functions shared by the schedules page and the scheduled job (report-schedules.server).
 */
import type { StoredPeriod } from "./periods";
import {
  buildTrendMonths,
  commissionPct,
  compareFigures,
  platformCostPct,
  type TrendFigures,
  type TrendPlatform,
} from "./report-trends";

export type ScheduleFrequency = "monthly" | "weekly" | "on_upload";

export interface ReportSchedule {
  id: string;
  workspaceId: string;
  name: string;
  frequency: ScheduleFrequency;
  /** 1-28 for monthly schedules. */
  dayOfMonth: number | null;
  /** 0 = Sunday … 6 = Saturday, for weekly schedules. */
  weekday: number | null;
  recipients: string[];
  active: boolean;
  lastSentAt: string | null;
  lastPeriodId: string | null;
  lastError: string | null;
  createdAt: string;
}

export const MAX_RECIPIENTS = 10;

export const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  monthly: "شهرياً",
  weekly: "أسبوعياً",
  on_upload: "عند رفع فترة جديدة",
};

export const WEEKDAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

/** Today's date, day of month and weekday in Riyadh, where schedules are set. */
export function riyadhToday(now: Date): { date: string; month: string; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const date = `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts["weekday"] ?? "");
  return { date, month: date.slice(0, 7), day: Number(parts["day"]), weekday };
}

/**
 * Whether a schedule should send now. Monthly: on or after its day, once per Riyadh month (a missed run catches up
 * later that month). Weekly: on its weekday, once that day. On upload: when the newest period is one it has not
 * sent and was saved after the schedule was created.
 */
export function isScheduleDue(
  schedule: Pick<ReportSchedule, "frequency" | "dayOfMonth" | "weekday" | "active" | "lastSentAt" | "lastPeriodId" | "createdAt">,
  now: Date,
  latestPeriod: Pick<StoredPeriod, "id" | "created_at"> | null,
): boolean {
  if (!schedule.active) return false;
  const today = riyadhToday(now);
  const last = schedule.lastSentAt ? riyadhToday(new Date(schedule.lastSentAt)) : null;
  if (schedule.frequency === "monthly") {
    return schedule.dayOfMonth !== null && today.day >= schedule.dayOfMonth && last?.month !== today.month;
  }
  if (schedule.frequency === "weekly") {
    return schedule.weekday !== null && today.weekday === schedule.weekday && last?.date !== today.date;
  }
  return (
    latestPeriod !== null &&
    latestPeriod.id !== schedule.lastPeriodId &&
    Date.parse(latestPeriod.created_at) > Date.parse(schedule.createdAt)
  );
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

/** Splits a typed list (commas, semicolons, spaces or new lines) into unique lower-case addresses. */
export function parseRecipients(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;،]+/)) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    if (!EMAIL.test(value)) invalid.push(raw.trim());
    else if (!valid.includes(value)) valid.push(value);
  }
  return { valid, invalid };
}

export function describeTiming(schedule: Pick<ReportSchedule, "frequency" | "dayOfMonth" | "weekday">): string {
  if (schedule.frequency === "monthly") return `شهرياً في اليوم ${schedule.dayOfMonth ?? 1}`;
  if (schedule.frequency === "weekly") return `أسبوعياً يوم ${WEEKDAY_LABELS[schedule.weekday ?? 0]}`;
  return "بعد رفع كل فترة جديدة";
}

const PLATFORM_LABEL: Record<TrendPlatform, string> = { hungerstation: "هنقرستيشن", keeta: "كيتا", jahez: "جاهز" };

const money = (value: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);

function monthLabel(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? month
    : date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** "+12.3% عن أغسطس 2026" / "+1.2 نقطة"; null without a month before. */
function changeText(value: number | null, kind: "relative" | "points"): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const amount = Math.abs(value) * 100;
  return kind === "relative" ? `${sign}${amount.toFixed(1)}%` : `${sign}${amount.toFixed(1)} نقطة`;
}

export interface ReportDigestFigure {
  label: string;
  value: string;
  /** e.g. "+4.2%" or "+0.8 نقطة"; null when there is no month before. */
  change: string | null;
  /** Whether the change is good news (sales up) or bad (costs up); null when flat or unknown. */
  good: boolean | null;
}

export interface ReportDigest {
  monthLabel: string;
  previousMonthLabel: string | null;
  figures: ReportDigestFigure[];
  platforms: { name: string; sales: string; costPct: string; commissionPct: string }[];
  /** The upload that triggered an on-upload email. */
  newPeriodLabel: string | null;
  periodCount: number;
}

const goodWhen = (value: number | null, up: boolean) => (value === null || Math.abs(value) < 0.0005 ? null : value > 0 === up);

/** The email's content: the latest month's figures against the month before, and each platform's line. */
export function buildReportDigest(periods: StoredPeriod[], newPeriod: Pick<StoredPeriod, "label"> | null = null): ReportDigest | null {
  const months = buildTrendMonths(periods);
  const latest = months[months.length - 1];
  if (!latest) return null;
  const previous = months[months.length - 2] ?? null;
  const change = compareFigures(latest.total, previous?.total ?? null);
  const t: TrendFigures = latest.total;
  return {
    monthLabel: monthLabel(latest.month),
    previousMonthLabel: previous ? monthLabel(previous.month) : null,
    figures: [
      { label: "المبيعات", value: `${money(t.grossSales)} ر.س`, change: changeText(change.salesChange, "relative"), good: goodWhen(change.salesChange, true) },
      { label: "الطلبات", value: new Intl.NumberFormat("en-US").format(t.orders), change: changeText(change.ordersChange, "relative"), good: goodWhen(change.ordersChange, true) },
      { label: "تكلفة المنصة", value: pct(platformCostPct(t)), change: changeText(change.costPctChange, "points"), good: goodWhen(change.costPctChange, false) },
      { label: "نسبة العمولة", value: pct(commissionPct(t)), change: changeText(change.commissionPctChange, "points"), good: goodWhen(change.commissionPctChange, false) },
    ],
    platforms: (Object.keys(latest.byPlatform) as TrendPlatform[]).map((platform) => {
      const f = latest.byPlatform[platform]!;
      return { name: PLATFORM_LABEL[platform], sales: `${money(f.grossSales)} ر.س`, costPct: pct(platformCostPct(f)), commissionPct: pct(commissionPct(f)) };
    }),
    newPeriodLabel: newPeriod?.label ?? null,
    periodCount: t.periods,
  };
}
