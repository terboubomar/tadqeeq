import { describe, expect, test } from "bun:test";

import { buildCompensationOverview, type OverviewCase } from "./compensation-overview";

const now = new Date("2026-09-26T12:00:00Z");

function c(partial: Partial<OverviewCase>): OverviewCase {
  return {
    platform: "jahez",
    branchName: "فرع العليا",
    compensationAmount: 100,
    status: "draft",
    createdAt: "2026-09-10T10:00:00Z",
    updatedAt: "2026-09-10T10:00:00Z",
    ...partial,
  };
}

describe("buildCompensationOverview", () => {
  const cases = [
    c({ status: "recovered", compensationAmount: 80, updatedAt: "2026-09-14T10:00:00Z" }),
    c({ status: "submitted", compensationAmount: 50 }),
    c({ status: "rejected", compensationAmount: 70, platform: "keeta", branchName: "فرع الملقا" }),
    c({ status: "ready", compensationAmount: 40 }),
    c({ status: "draft", compensationAmount: 25 }),
    c({ status: "recovered", compensationAmount: 30, createdAt: "2026-01-05T10:00:00Z", updatedAt: "2026-01-20T10:00:00Z" }),
  ];
  const connections = [
    { branchName: "فرع العليا", active: true, chatId: 1 },
    { branchName: "فرع الملقا", active: true, chatId: null },
  ];

  test("computes claimed, recovered and rate for the selected range", () => {
    const o = buildCompensationOverview(cases, connections, { range: "30d", platform: "all", now });
    expect(o.caseCount).toBe(5);
    expect(o.claimedAmount).toBe(265);
    expect(o.recoveredAmount).toBe(80);
    // sent = recovered 80 + submitted 50 + rejected 70
    expect(o.recoveryRate).toBeCloseTo(80 / 200);
    expect(o.pendingAmount).toBe(50);
    expect(o.pendingCount).toBe(1);
    expect(o.readyCount).toBe(1);
    expect(o.rejectedCount).toBe(1);
    expect(o.avgDaysToRecover).toBeCloseTo(4);
  });

  test("all-time range includes older cases and filters by platform", () => {
    const all = buildCompensationOverview(cases, connections, { range: "all", platform: "all", now });
    expect(all.recoveredAmount).toBe(110);
    const keeta = buildCompensationOverview(cases, connections, { range: "all", platform: "keeta", now });
    expect(keeta.caseCount).toBe(1);
    expect(keeta.recoveryRate).toBe(0);
  });

  test("rate is null when nothing was sent", () => {
    const o = buildCompensationOverview([c({ status: "draft" })], [], { range: "all", platform: "all", now });
    expect(o.recoveryRate).toBeNull();
    expect(o.avgDaysToRecover).toBeNull();
  });

  test("branches are ranked by claimed amount with telegram link status", () => {
    const o = buildCompensationOverview(cases, connections, { range: "30d", platform: "all", now });
    expect(o.branches[0].name).toBe("فرع العليا");
    expect(o.branches[0].telegramLinked).toBe(true);
    expect(o.branches[1].telegramLinked).toBe(false);
    expect(o.linkedBranches).toBe(1);
  });

  test("monthly series covers six months and buckets recovered by update date", () => {
    const o = buildCompensationOverview(cases, connections, { range: "all", platform: "all", now });
    expect(o.months).toHaveLength(6);
    const sep = o.months[o.months.length - 1];
    expect(sep.claimed).toBe(265);
    expect(sep.recovered).toBe(80);
  });
});

describe("nextCaseActions", () => {
  test("moves a case forward through the workflow", async () => {
    const { nextCaseActions } = await import("./compensation-overview");
    expect(nextCaseActions("draft").map((a) => a.status)).toEqual(["ready"]);
    expect(nextCaseActions("ready").map((a) => a.status)).toEqual(["submitted"]);
    expect(nextCaseActions("submitted").map((a) => a.status)).toEqual(["accepted", "recovered", "rejected"]);
    expect(nextCaseActions("rejected").map((a) => a.status)).toEqual(["submitted", "closed"]);
    expect(nextCaseActions("unknown")).toEqual([]);
  });
});

describe("case workflow", () => {
  test("records each status change and keeps a partial recovery through closing", async () => {
    const { advanceCaseWorkflow, readCaseWorkflow } = await import("./compensation-overview");
    let wf = advanceCaseWorkflow(readCaseWorkflow({}), null, { status: "ready", compensationAmount: 100 }, "2026-09-01T00:00:00Z");
    wf = advanceCaseWorkflow(wf, "ready", { status: "submitted", compensationAmount: 100 }, "2026-09-02T00:00:00Z");
    wf = advanceCaseWorkflow(
      wf,
      "submitted",
      { status: "recovered", compensationAmount: 100, recoveredAmount: 60 },
      "2026-09-06T00:00:00Z",
    );
    expect(wf.recoveredAmount).toBe(60);
    wf = advanceCaseWorkflow(wf, "recovered", { status: "closed", compensationAmount: 100 }, "2026-09-07T00:00:00Z");
    expect(wf.recoveredAmount).toBe(60);
    expect(wf.history.map((h) => h.status)).toEqual(["ready", "submitted", "recovered", "closed"]);
    // Reopening clears the recovered money.
    wf = advanceCaseWorkflow(wf, "closed", { status: "draft", compensationAmount: 100 }, "2026-09-08T00:00:00Z");
    expect(wf.recoveredAmount).toBeNull();
  });

  test("an edit without a status change adds no history and caps recovery at the claim", async () => {
    const { advanceCaseWorkflow, readCaseWorkflow } = await import("./compensation-overview");
    const first = advanceCaseWorkflow(
      readCaseWorkflow(null),
      "submitted",
      { status: "recovered", compensationAmount: 50, recoveredAmount: 80 },
      "2026-09-01T00:00:00Z",
    );
    expect(first.recoveredAmount).toBe(50);
    const again = advanceCaseWorkflow(first, "recovered", { status: "recovered", compensationAmount: 50 }, "2026-09-02T00:00:00Z");
    expect(again.history).toHaveLength(1);
    expect(again.recoveredAmount).toBe(50);
  });

  test("keeps the rejection reason", async () => {
    const { advanceCaseWorkflow, readCaseWorkflow } = await import("./compensation-overview");
    const wf = advanceCaseWorkflow(
      readCaseWorkflow(undefined),
      "submitted",
      { status: "rejected", compensationAmount: 40, note: "  الدليل غير واضح " },
      "2026-09-01T00:00:00Z",
    );
    expect(wf.rejectionReason).toBe("الدليل غير واضح");
    expect(advanceCaseWorkflow(wf, "rejected", { status: "closed", compensationAmount: 40 }, "2026-09-02T00:00:00Z").rejectionReason).toBe(
      "الدليل غير واضح",
    );
  });
});

describe("overview with workflow data", () => {
  const withWorkflow = (workflow: unknown) => ({ workflow });

  test("counts actual recovered money, closed-after-recovery and the shortfall", () => {
    const o = buildCompensationOverview(
      [
        c({
          status: "recovered",
          compensationAmount: 100,
          auditContext: withWorkflow({
            recoveredAmount: 70,
            history: [
              { status: "submitted", at: "2026-09-10T10:00:00Z" },
              { status: "recovered", at: "2026-09-15T10:00:00Z" },
            ],
          }),
        }),
        c({
          status: "closed",
          compensationAmount: 50,
          auditContext: withWorkflow({ recoveredAmount: 50, history: [] }),
        }),
        c({ status: "closed", compensationAmount: 30 }),
      ],
      [],
      { range: "all", platform: "all", now },
    );
    expect(o.recoveredAmount).toBe(120);
    expect(o.recoveryShortfall).toBe(30);
    expect(o.recoveryRate).toBeCloseTo(120 / 180);
    expect(o.avgDaysToRecover).toBeCloseTo((5 + 0) / 2);
  });

  test("flags cases that need a follow-up", () => {
    const o = buildCompensationOverview(
      [
        c({ id: "a", status: "submitted", compensationAmount: 90, updatedAt: "2026-09-10T10:00:00Z" }),
        c({ id: "b", status: "submitted", compensationAmount: 90, updatedAt: "2026-09-24T10:00:00Z" }),
        c({ id: "c", status: "ready", compensationAmount: 20, updatedAt: "2026-09-20T10:00:00Z" }),
        c({ id: "d", status: "recovered", compensationAmount: 20, updatedAt: "2026-09-01T10:00:00Z" }),
      ],
      [],
      { range: "30d", platform: "all", now },
    );
    expect(o.followUps.map((f) => f.id)).toEqual(["a", "c"]);
    expect(o.followUps[0]!.followUp.kind).toBe("awaiting_platform");
    expect(o.followUpAmount).toBe(110);
  });
});
