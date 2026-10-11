import { describe, expect, test } from "bun:test";

import { buildCombinedView, combinedAccess, type CombinedDashboardData, type CombinedPeriod } from "./combined-dashboard";

const period = (workspaceId: string, over: Partial<CombinedPeriod> & { summary?: Record<string, number> }): CombinedPeriod =>
  ({
    id: Math.random().toString(36),
    workspaceId,
    label: "p",
    platform: "hungerstation",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    created_at: "2026-10-02T00:00:00Z",
    ...over,
    summary: { orders: 100, grossSales: 10000, commission: 1800, commissionPct: 0.2, totalCharges: 2500, ...(over.summary ?? {}) },
  }) as unknown as CombinedPeriod;

const data: CombinedDashboardData = {
  companies: [
    { id: "a", name: "Brand A", current: true },
    { id: "b", name: "Brand B", current: false },
  ],
  excluded: [],
  periods: [
    period("a", { period_end: "2026-08-31" }),
    period("a", { platform: "jahez", period_end: "2026-08-31", summary: { grossSales: 4000, totalCharges: 800, orders: 30 } }),
    period("a", {}),
    period("b", { summary: { grossSales: 6000, totalCharges: 1200, orders: 50, commission: 900, commissionPct: 0.18 } }),
    period("b", { platform: "keeta", period_end: "2026-07-31", summary: { grossSales: 3000, orders: 20 } }),
  ],
};

describe("combined dashboard", () => {
  test("all companies and platforms add up for the newest month, against the month before", () => {
    const view = buildCombinedView(data, { company: "all", platform: "all" });
    expect(view.month).toBe("2026-09");
    expect(view.months).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(view.total).toMatchObject({ periods: 2, orders: 150, grossSales: 16000, platformCharges: 3700, commission: 2700 });
    expect(view.previousMonth).toBe("2026-08");
    expect(view.previous).toMatchObject({ grossSales: 14000, platformCharges: 3300 });
    expect(view.byCompany.map((r) => [r.label, r.figures.grossSales])).toEqual([["Brand A", 10000], ["Brand B", 6000]]);
    expect(view.byPlatform.map((r) => [r.key, r.figures.grossSales])).toEqual([["hungerstation", 16000]]);
  });

  test("flags a company and platform that had periods before but none this month", () => {
    const view = buildCombinedView(data, { company: "all", platform: "all", month: "2026-09" });
    expect(view.missing).toEqual([
      { company: "Brand A", platform: "jahez" },
      { company: "Brand B", platform: "keeta" },
    ]);
  });

  test("one company, one platform and a chosen month narrow the figures", () => {
    const view = buildCombinedView(data, { company: "a", platform: "jahez", month: "2026-08" });
    expect(view.month).toBe("2026-08");
    expect(view.total).toMatchObject({ periods: 1, grossSales: 4000, orders: 30 });
    expect(view.previous).toBeNull();
    expect(view.byCompany).toHaveLength(1);
  });

  test("an unknown month falls back to the newest; an empty scope has no month", () => {
    expect(buildCombinedView(data, { company: "b", platform: "all", month: "2025-01" }).month).toBe("2026-09");
    const empty = buildCombinedView(data, { company: "b", platform: "jahez" });
    expect(empty.month).toBeNull();
    expect(empty.total.periods).toBe(0);
  });

  test("the chart series ends at the chosen month and holds at most six months", () => {
    const view = buildCombinedView(data, { company: "all", platform: "all", month: "2026-08" });
    expect(view.series.map((s) => s.month)).toEqual(["2026-07", "2026-08"]);
  });
});

describe("which companies join the totals", () => {
  const base = { onboardingStatus: "active", isPlatformAdmin: false, planFeatures: null };

  test("owners, admins, auditors and viewers of an active company are included", () => {
    for (const role of ["owner", "admin", "auditor", "viewer"] as const) {
      expect(combinedAccess({ ...base, role }).included).toBe(true);
    }
  });

  test("branch-limited roles stay out so totals are never partial", () => {
    for (const role of ["branch_manager", "compensation"] as const) {
      expect(combinedAccess({ ...base, role })).toEqual({ included: false, reason: "صلاحيتك فيها محدودة بفروع معيّنة" });
    }
  });

  test("a suspended company stays out; a trial company is included", () => {
    expect(combinedAccess({ ...base, role: "owner", onboardingStatus: "suspended" }).included).toBe(false);
    expect(combinedAccess({ ...base, role: "owner", onboardingStatus: "awaiting_payment" }).included).toBe(true);
  });
});
