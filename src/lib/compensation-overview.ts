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
  platform: string;
  branchName: string | null;
  compensationAmount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
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
    if (item.status === "recovered") {
      recovered += amount;
      const days = (time(item.updatedAt) - time(item.createdAt)) / DAY_MS;
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
          return item.status === "recovered" && t >= prevStart && t < start.getTime();
        })
        .reduce((sum, item) => sum + item.compensationAmount, 0),
    );
  }

  const byPlatform = (["hungerstation", "jahez", "keeta"] as const).map((platform) => {
    const rows = cases.filter((item) => item.platform === platform);
    return {
      platform,
      count: rows.length,
      claimed: round2(rows.reduce((sum, item) => sum + item.compensationAmount, 0)),
      recovered: round2(
        rows
          .filter((item) => item.status === "recovered")
          .reduce((sum, item) => sum + item.compensationAmount, 0),
      ),
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
    if (item.status === "recovered") {
      const recoveredMonth = months[monthIndex.get(monthKey(item.updatedAt)) ?? -1];
      if (recoveredMonth) recoveredMonth.recovered += item.compensationAmount;
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
    if (item.status === "recovered") row.recovered += item.compensationAmount;
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
