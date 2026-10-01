import { COMPENSATION_FOLLOW_UP_DAYS } from "./limits";

// Pure KPI math for the compensation center overview. Kept free of server
// imports so it can be unit-tested and reused on the client.

export type CompensationPlatformKey = "hungerstation" | "keeta" | "jahez";

export type CompensationCaseStatus =
  | "draft"
  | "ready"
  | "submitted"
  | "accepted"
  | "rejected"
  | "recovered"
  | "closed";

export const CASE_STATUSES: CompensationCaseStatus[] = [
  "draft",
  "ready",
  "submitted",
  "accepted",
  "recovered",
  "rejected",
  "closed",
];

export const CASE_STATUS_LABELS: Record<CompensationCaseStatus, string> = {
  draft: "مسودة",
  ready: "جاهزة",
  submitted: "مرسلة",
  accepted: "مقبولة",
  rejected: "مرفوضة",
  recovered: "مسترَدة",
  closed: "مغلقة",
};

export const PLATFORM_LABELS: Record<CompensationPlatformKey, string> = {
  hungerstation: "هنقرستيشن",
  keeta: "كيتا",
  jahez: "جاهز",
};

export type OverviewRange = "30d" | "quarter" | "year" | "all";

export const RANGE_LABELS: Record<OverviewRange, string> = {
  "30d": "30 يوماً",
  quarter: "90 يوماً",
  year: "هذه السنة",
  all: "الكل",
};

export interface OverviewCase {
  id?: string;
  orderNumber?: string;
  platform: string;
  branchName: string | null;
  compensationAmount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** Holds the status history and recovered amount under `workflow`. */
  auditContext?: unknown;
}

// ---------------------------------------------------------------------------
// Case workflow: status history, actual recovered amount and rejection reason.
// Stored in audit_context.workflow so every status change keeps its date.
// ---------------------------------------------------------------------------

export interface CaseWorkflowEntry {
  status: CompensationCaseStatus;
  at: string;
  note?: string | null;
}

export interface CaseWorkflow {
  history: CaseWorkflowEntry[];
  /** What the platform actually paid back; null until the case is recovered. */
  recoveredAmount: number | null;
  rejectionReason: string | null;
}

const MAX_HISTORY = 60;

function isStatus(value: unknown): value is CompensationCaseStatus {
  return typeof value === "string" && (CASE_STATUSES as string[]).includes(value);
}

export function readCaseWorkflow(auditContext: unknown): CaseWorkflow {
  const empty: CaseWorkflow = { history: [], recoveredAmount: null, rejectionReason: null };
  if (!auditContext || typeof auditContext !== "object" || Array.isArray(auditContext)) return empty;
  const raw = (auditContext as Record<string, unknown>)["workflow"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const value = raw as Record<string, unknown>;
  const history = Array.isArray(value["history"])
    ? value["history"].flatMap((entry): CaseWorkflowEntry[] => {
        if (!entry || typeof entry !== "object") return [];
        const e = entry as Record<string, unknown>;
        if (!isStatus(e["status"]) || typeof e["at"] !== "string") return [];
        return [{ status: e["status"], at: e["at"], note: typeof e["note"] === "string" ? e["note"] : null }];
      })
    : [];
  const recovered = typeof value["recoveredAmount"] === "number" && Number.isFinite(value["recoveredAmount"])
    ? value["recoveredAmount"]
    : null;
  return {
    history,
    recoveredAmount: recovered,
    rejectionReason: typeof value["rejectionReason"] === "string" ? value["rejectionReason"] : null,
  };
}

/** Next workflow state after a save. Recovered money survives closing the case. */
export function advanceCaseWorkflow(
  previous: CaseWorkflow,
  previousStatus: string | null,
  next: {
    status: CompensationCaseStatus;
    compensationAmount: number;
    recoveredAmount?: number | null;
    note?: string | null;
  },
  at: string,
): CaseWorkflow {
  const note = next.note?.trim() || null;
  const changed = previousStatus !== next.status;
  const history = changed
    ? [...previous.history, { status: next.status, at, note }].slice(-MAX_HISTORY)
    : previous.history;

  let recoveredAmount: number | null = null;
  if (next.status === "recovered") {
    const requested =
      next.recoveredAmount ??
      (previousStatus === "recovered" ? previous.recoveredAmount : null) ??
      next.compensationAmount;
    recoveredAmount = round2(Math.min(Math.max(requested, 0), next.compensationAmount));
  } else if (next.status === "closed" && (previousStatus === "recovered" || previousStatus === "closed")) {
    recoveredAmount =
      previousStatus === "recovered" && previous.recoveredAmount === null
        ? next.compensationAmount
        : previous.recoveredAmount;
  }

  let rejectionReason: string | null = null;
  if (next.status === "rejected") {
    rejectionReason = note ?? (previousStatus === "rejected" ? previous.rejectionReason : null);
  } else if (next.status === "closed" && (previousStatus === "rejected" || previousStatus === "closed")) {
    rejectionReason = previous.rejectionReason;
  }

  return { history, recoveredAmount, rejectionReason };
}

/** Last time the case entered the given status, from the history. */
export function statusEnteredAt(item: Pick<OverviewCase, "auditContext">, status: CompensationCaseStatus): string | null {
  const history = readCaseWorkflow(item.auditContext).history;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]!.status === status) return history[i]!.at;
  }
  return null;
}

/** Money actually recovered for a case (partial refunds and closed-after-recovery included). */
export function caseRecoveredAmount(item: OverviewCase): number {
  const workflow = readCaseWorkflow(item.auditContext);
  if (item.status === "recovered") return workflow.recoveredAmount ?? item.compensationAmount;
  if (item.status === "closed" && workflow.recoveredAmount !== null) return workflow.recoveredAmount;
  return 0;
}

export function isCaseRecovered(item: OverviewCase): boolean {
  if (item.status === "recovered") return true;
  return item.status === "closed" && readCaseWorkflow(item.auditContext).recoveredAmount !== null;
}

function recoveredAt(item: OverviewCase): string {
  return statusEnteredAt(item, "recovered") ?? item.updatedAt;
}

/** Days after which a case needs a nudge: ready but not sent, or sent with no platform answer. */
export const FOLLOW_UP_DAYS = COMPENSATION_FOLLOW_UP_DAYS;

export interface CaseFollowUp {
  kind: "not_sent" | "awaiting_platform" | "awaiting_payment";
  days: number;
  label: string;
}

export function caseFollowUp(item: OverviewCase, now: Date = new Date()): CaseFollowUp | null {
  if (item.status !== "ready" && item.status !== "submitted" && item.status !== "accepted") return null;
  const since = statusEnteredAt(item, item.status) ?? item.updatedAt;
  const days = Math.floor((now.getTime() - time(since)) / DAY_MS);
  if (days < FOLLOW_UP_DAYS[item.status]) return null;
  if (item.status === "ready") return { kind: "not_sent", days, label: `جاهزة ولم تُرسل منذ ${days} يوم` };
  if (item.status === "submitted") {
    return { kind: "awaiting_platform", days, label: `بلا رد من المنصة منذ ${days} يوم` };
  }
  return { kind: "awaiting_payment", days, label: `مقبولة ولم تُسترد منذ ${days} يوم` };
}

export interface OverviewConnection {
  branchName: string;
  active: boolean;
  chatId: number | null;
}

export interface CompensationOverview {
  caseCount: number;
  claimedAmount: number;
  recoveredAmount: number;
  /** Recovered amount divided by the amount already sent to a platform. */
  recoveryRate: number | null;
  pendingAmount: number;
  pendingCount: number;
  readyCount: number;
  rejectedCount: number;
  rejectedAmount: number;
  /** Claimed minus actually paid on recovered cases (partial refunds). */
  recoveryShortfall: number;
  followUps: Array<{
    id: string;
    orderNumber: string;
    platform: string;
    branchName: string | null;
    amount: number;
    status: string;
    followUp: CaseFollowUp;
  }>;
  followUpAmount: number;
  avgDaysToRecover: number | null;
  previousRecoveredAmount: number | null;
  statusCounts: Record<CompensationCaseStatus, number>;
  byPlatform: Array<{ platform: CompensationPlatformKey; claimed: number; recovered: number; count: number }>;
  months: Array<{ key: string; label: string; claimed: number; recovered: number }>;
  branches: Array<{
    name: string;
    count: number;
    claimed: number;
    recovered: number;
    recoveryRate: number | null;
    telegramLinked: boolean;
  }>;
  linkedBranches: number;
  totalConnections: number;
}

const SENT_STATUSES = new Set(["submitted", "accepted", "rejected", "recovered", "closed"]);
const PENDING_STATUSES = new Set(["submitted", "accepted"]);
const DAY_MS = 86_400_000;

const MONTH_LABEL = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { month: "short" });

export function rangeStart(range: OverviewRange, now: Date): Date | null {
  if (range === "all") return null;
  if (range === "year") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days = range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * DAY_MS);
}

function time(value: string): number {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPlatform(value: string): value is CompensationPlatformKey {
  return value === "hungerstation" || value === "keeta" || value === "jahez";
}

export function buildCompensationOverview(
  allCases: OverviewCase[],
  connections: OverviewConnection[],
  options: { range: OverviewRange; platform: CompensationPlatformKey | "all"; now?: Date },
): CompensationOverview {
  const now = options.now ?? new Date();
  const start = rangeStart(options.range, now);
  const platformCases = allCases.filter(
    (item) => options.platform === "all" || item.platform === options.platform,
  );
  const cases = start
    ? platformCases.filter((item) => time(item.createdAt) >= start.getTime())
    : platformCases;

  const statusCounts = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<
    CompensationCaseStatus,
    number
  >;

  let claimed = 0;
  let recovered = 0;
  let sent = 0;
  let pending = 0;
  let pendingCount = 0;
  let rejectedAmount = 0;
  let shortfall = 0;
  let recoverDays = 0;
  let recoverCount = 0;

  for (const item of cases) {
    const amount = Number.isFinite(item.compensationAmount) ? item.compensationAmount : 0;
    if (item.status in statusCounts) statusCounts[item.status as CompensationCaseStatus] += 1;
    claimed += amount;
    if (SENT_STATUSES.has(item.status)) sent += amount;
    if (PENDING_STATUSES.has(item.status)) {
      pending += amount;
      pendingCount += 1;
    }
    if (item.status === "rejected") rejectedAmount += amount;
    if (isCaseRecovered(item)) {
      const paid = caseRecoveredAmount(item);
      recovered += paid;
      shortfall += Math.max(0, amount - paid);
      const from = statusEnteredAt(item, "submitted") ?? item.createdAt;
      const days = (time(recoveredAt(item)) - time(from)) / DAY_MS;
      if (days >= 0) {
        recoverDays += days;
        recoverCount += 1;
      }
    }
  }

  let previousRecoveredAmount: number | null = null;
  if (start && options.range !== "year") {
    const span = now.getTime() - start.getTime();
    const prevStart = start.getTime() - span;
    previousRecoveredAmount = round2(
      platformCases
        .filter((item) => {
          const t = time(item.createdAt);
          return isCaseRecovered(item) && t >= prevStart && t < start.getTime();
        })
        .reduce((sum, item) => sum + caseRecoveredAmount(item), 0),
    );
  }

  const byPlatform = (["hungerstation", "jahez", "keeta"] as const).map((platform) => {
    const rows = cases.filter((item) => item.platform === platform);
    return {
      platform,
      count: rows.length,
      claimed: round2(rows.reduce((sum, item) => sum + item.compensationAmount, 0)),
      recovered: round2(rows.reduce((sum, item) => sum + caseRecoveredAmount(item), 0)),
    };
  });

  const months: CompensationOverview["months"] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: MONTH_LABEL.format(d),
      claimed: 0,
      recovered: 0,
    });
  }
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  const monthKey = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  for (const item of platformCases) {
    const claimedMonth = months[monthIndex.get(monthKey(item.createdAt)) ?? -1];
    if (claimedMonth) claimedMonth.claimed += item.compensationAmount;
    if (isCaseRecovered(item)) {
      const recoveredMonth = months[monthIndex.get(monthKey(recoveredAt(item))) ?? -1];
      if (recoveredMonth) recoveredMonth.recovered += caseRecoveredAmount(item);
    }
  }
  for (const m of months) {
    m.claimed = round2(m.claimed);
    m.recovered = round2(m.recovered);
  }

  const linked = new Set(
    connections
      .filter((c) => c.active && c.chatId !== null)
      .map((c) => c.branchName.trim()),
  );
  const branchMap = new Map<string, { count: number; claimed: number; recovered: number; sent: number }>();
  for (const item of cases) {
    const name = item.branchName?.trim() || "غير محدد";
    const row = branchMap.get(name) ?? { count: 0, claimed: 0, recovered: 0, sent: 0 };
    row.count += 1;
    row.claimed += item.compensationAmount;
    if (SENT_STATUSES.has(item.status)) row.sent += item.compensationAmount;
    row.recovered += caseRecoveredAmount(item);
    branchMap.set(name, row);
  }
  const branches = [...branchMap.entries()]
    .map(([name, row]) => ({
      name,
      count: row.count,
      claimed: round2(row.claimed),
      recovered: round2(row.recovered),
      recoveryRate: row.sent > 0 ? row.recovered / row.sent : null,
      telegramLinked: linked.has(name),
    }))
    .sort((a, b) => b.claimed - a.claimed);

  // Follow-ups are today's to-do list, so they ignore the date range.
  const followUps = platformCases
    .flatMap((item) => {
      const followUp = caseFollowUp(item, now);
      if (!followUp) return [];
      return [
        {
          id: item.id ?? "",
          orderNumber: item.orderNumber ?? "",
          platform: item.platform,
          branchName: item.branchName,
          amount: item.compensationAmount,
          status: item.status,
          followUp,
        },
      ];
    })
    .sort((a, b) => b.followUp.days - a.followUp.days || b.amount - a.amount);

  return {
    caseCount: cases.length,
    claimedAmount: round2(claimed),
    recoveredAmount: round2(recovered),
    recoveryRate: sent > 0 ? recovered / sent : null,
    pendingAmount: round2(pending),
    pendingCount,
    readyCount: statusCounts.ready,
    rejectedCount: statusCounts.rejected,
    rejectedAmount: round2(rejectedAmount),
    recoveryShortfall: round2(shortfall),
    followUps,
    followUpAmount: round2(followUps.reduce((sum, item) => sum + item.amount, 0)),
    avgDaysToRecover: recoverCount > 0 ? recoverDays / recoverCount : null,
    previousRecoveredAmount,
    statusCounts,
    byPlatform,
    months,
    branches,
    linkedBranches: linked.size,
    totalConnections: connections.length,
  };
}

export function platformLabel(value: string): string {
  return isPlatform(value) ? PLATFORM_LABELS[value] : value;
}

export function caseStatusLabel(value: string): string {
  return CASE_STATUS_LABELS[value as CompensationCaseStatus] ?? value;
}

/** Workflow order shown as a stepper; rejected/closed branch off the main path. */
export const CASE_WORKFLOW: CompensationCaseStatus[] = ["draft", "ready", "submitted", "accepted", "recovered"];

/** The one-click next steps offered for a case in a given status. */
export function nextCaseActions(
  status: string,
): Array<{ status: CompensationCaseStatus; label: string; tone: "primary" | "good" | "bad" | "neutral" }> {
  switch (status) {
    case "draft":
      return [{ status: "ready", label: "تجهيز للإرسال", tone: "primary" }];
    case "ready":
      return [{ status: "submitted", label: "تم الإرسال للمنصة", tone: "primary" }];
    case "submitted":
      return [
        { status: "accepted", label: "قبلت المنصة", tone: "good" },
        { status: "recovered", label: "تم الاسترداد", tone: "good" },
        { status: "rejected", label: "رفضت المنصة", tone: "bad" },
      ];
    case "accepted":
      return [
        { status: "recovered", label: "تم الاسترداد", tone: "good" },
        { status: "rejected", label: "رفضت المنصة", tone: "bad" },
      ];
    case "rejected":
      return [
        { status: "submitted", label: "إعادة الإرسال", tone: "primary" },
        { status: "closed", label: "إغلاق", tone: "neutral" },
      ];
    case "recovered":
      return [{ status: "closed", label: "إغلاق", tone: "neutral" }];
    case "closed":
      return [{ status: "draft", label: "إعادة فتح", tone: "neutral" }];
    default:
      return [];
  }
}
