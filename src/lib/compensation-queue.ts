import { caseFollowUp, caseRecoveredAmount, statusEnteredAt, type OverviewCase } from "./compensation-overview";

/**
 * The «استرداد» work queue: what the employee should do next, and what their supervisor checks (late work,
 * missing evidence, this week's progress). Built from the cases the page already loads; display only.
 */

export type QueueKind = "send" | "missing_evidence" | "follow_up" | "rejected";

export interface QueueRow {
  id: string;
  orderNumber: string;
  platform: string;
  branchName: string | null;
  amount: number;
  kind: QueueKind;
  label: string;
}

export interface CompensationQueue {
  waitingAmount: number;
  waitingCount: number;
  stages: { draft: number; ready: number; sent: number; recovered: number };
  rows: QueueRow[];
  supervisor: {
    late: number;
    missingEvidence: number;
    sentThisWeek: number;
    recoveredThisWeek: number;
    recoveredThisWeekAmount: number;
  };
}

type QueueCase = OverviewCase & { evidenceId?: string | null };

const WAITING = new Set(["draft", "ready", "submitted", "accepted"]);
const WEEK_MS = 7 * 86_400_000;

export function buildCompensationQueue(cases: QueueCase[], now: Date = new Date()): CompensationQueue {
  const within = (at: string | null) => {
    if (!at) return false;
    const time = Date.parse(at);
    return Number.isFinite(time) && now.getTime() - time <= WEEK_MS && time <= now.getTime();
  };
  const row = (item: QueueCase, kind: QueueKind, label: string): QueueRow => ({
    id: item.id ?? item.orderNumber ?? "",
    orderNumber: item.orderNumber ?? "",
    platform: item.platform,
    branchName: item.branchName,
    amount: item.compensationAmount,
    kind,
    label,
  });

  const queue: CompensationQueue = {
    waitingAmount: 0,
    waitingCount: 0,
    stages: { draft: 0, ready: 0, sent: 0, recovered: 0 },
    rows: [],
    supervisor: { late: 0, missingEvidence: 0, sentThisWeek: 0, recoveredThisWeek: 0, recoveredThisWeekAmount: 0 },
  };
  const send: QueueRow[] = [];
  const missing: QueueRow[] = [];
  const followUps: Array<{ row: QueueRow; days: number }> = [];
  const rejected: QueueRow[] = [];

  for (const item of cases) {
    const followUp = caseFollowUp(item, now);
    if (WAITING.has(item.status)) {
      queue.waitingAmount += item.compensationAmount;
      queue.waitingCount += 1;
    }
    if (followUp) queue.supervisor.late += 1;
    if (within(statusEnteredAt(item, "submitted"))) queue.supervisor.sentThisWeek += 1;

    switch (item.status) {
      case "draft":
        queue.stages.draft += 1;
        if (!item.evidenceId) {
          queue.supervisor.missingEvidence += 1;
          missing.push(row(item, "missing_evidence", "بلا دليل"));
        }
        break;
      case "ready":
        queue.stages.ready += 1;
        send.push(row(item, "send", followUp?.label ?? "جاهزة للإرسال"));
        break;
      case "submitted":
      case "accepted":
        queue.stages.sent += 1;
        if (followUp) followUps.push({ row: row(item, "follow_up", followUp.label), days: followUp.days });
        break;
      case "recovered":
        queue.stages.recovered += 1;
        if (within(statusEnteredAt(item, "recovered"))) {
          queue.supervisor.recoveredThisWeek += 1;
          queue.supervisor.recoveredThisWeekAmount += caseRecoveredAmount(item);
        }
        break;
      case "rejected":
        rejected.push(row(item, "rejected", "مرفوضة: راجع السبب"));
        break;
    }
  }

  send.sort((a, b) => b.amount - a.amount);
  missing.sort((a, b) => b.amount - a.amount);
  followUps.sort((a, b) => b.days - a.days);
  rejected.sort((a, b) => b.amount - a.amount);
  queue.rows = [...send, ...missing, ...followUps.map((entry) => entry.row), ...rejected];
  return queue;
}
