import { describe, expect, test } from "bun:test";

import { buildCompensationQueue } from "./compensation-queue";

const NOW = new Date("2026-11-26T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function item(
  id: string,
  status: string,
  amount: number,
  options: { enteredDaysAgo?: number; evidenceId?: string | null; recovered?: number; history?: boolean } = {},
) {
  const at = daysAgo(options.enteredDaysAgo ?? 0);
  return {
    id,
    orderNumber: `#${id}`,
    platform: "hungerstation",
    branchName: "الملقا",
    compensationAmount: amount,
    status,
    createdAt: at,
    updatedAt: at,
    evidenceId: options.evidenceId === undefined ? "e-1" : options.evidenceId,
    auditContext:
      options.history === false
        ? {}
        : { workflow: { history: [{ status, at }], recoveredAmount: options.recovered ?? null } },
  };
}

describe("buildCompensationQueue", () => {
  test("waiting excludes recovered, rejected and closed cases", () => {
    const queue = buildCompensationQueue(
      [item("1", "draft", 10), item("2", "ready", 20), item("3", "submitted", 30), item("4", "accepted", 40), item("5", "recovered", 50), item("6", "rejected", 60), item("7", "closed", 70)],
      NOW,
    );
    expect(queue.waitingAmount).toBe(100);
    expect(queue.waitingCount).toBe(4);
  });

  test("stages count submitted and accepted together as sent", () => {
    const queue = buildCompensationQueue([item("1", "draft", 1), item("2", "ready", 1), item("3", "submitted", 1), item("4", "accepted", 1), item("5", "recovered", 1)], NOW);
    expect(queue.stages).toEqual({ draft: 1, ready: 1, sent: 2, recovered: 1 });
  });

  test("rows: ready by amount, then drafts without evidence, then late follow-ups oldest first, then rejected", () => {
    const queue = buildCompensationQueue(
      [
        item("r-small", "ready", 20),
        item("rej", "rejected", 99),
        item("late-new", "submitted", 10, { enteredDaysAgo: 8 }),
        item("draft-noev", "draft", 15, { evidenceId: null }),
        item("draft-ev", "draft", 15),
        item("r-big", "ready", 80),
        item("late-old", "submitted", 10, { enteredDaysAgo: 20 }),
        item("fresh", "submitted", 10, { enteredDaysAgo: 1 }),
      ],
      NOW,
    );
    expect(queue.rows.map((row) => row.id)).toEqual(["r-big", "r-small", "draft-noev", "late-old", "late-new", "rej"]);
    expect(queue.rows.map((row) => row.kind)).toEqual(["send", "send", "missing_evidence", "follow_up", "follow_up", "rejected"]);
    expect(queue.rows[3]!.label).toBe("بلا رد من المنصة منذ 20 يوم");
  });

  test("supervisor counts late work, missing evidence and this week's progress", () => {
    const queue = buildCompensationQueue(
      [
        item("1", "ready", 10, { enteredDaysAgo: 5 }),
        item("2", "submitted", 10, { enteredDaysAgo: 9 }),
        item("3", "draft", 10, { evidenceId: null }),
        item("4", "submitted", 10, { enteredDaysAgo: 2 }),
        item("5", "recovered", 50, { enteredDaysAgo: 3, recovered: 45 }),
        item("6", "recovered", 50, { enteredDaysAgo: 30 }),
      ],
      NOW,
    );
    expect(queue.supervisor).toEqual({ late: 2, missingEvidence: 1, sentThisWeek: 1, recoveredThisWeek: 1, recoveredThisWeekAmount: 45 });
  });

  test("unknown statuses, zero amounts and missing history do not break the counts", () => {
    const queue = buildCompensationQueue([item("x", "weird", 10), item("z", "ready", 0), item("n", "submitted", 10, { history: false })], NOW);
    expect(queue.waitingCount).toBe(2);
    expect(queue.stages).toEqual({ draft: 0, ready: 1, sent: 1, recovered: 0 });
    expect(queue.supervisor.sentThisWeek).toBe(0);
    expect(queue.rows.map((row) => row.id)).toEqual(["z"]);
  });
});
