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
