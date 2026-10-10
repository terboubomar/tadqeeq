import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "./periods";
import { averageOrder, buildTrendMonths, commissionPct, compareFigures, periodMonth, platformCostPct, sumFigures } from "./report-trends";

const period = (over: Partial<StoredPeriod> & { summary?: Record<string, number> }): StoredPeriod =>
  ({
    id: Math.random().toString(36),
    label: "p",
    platform: "hungerstation",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    created_at: "2026-09-02T00:00:00Z",
    engine_version: "x",
    format_ids: [],
    branches: [],
    daily: [],
    invoice: {},
    ...over,
    summary: { orders: 100, grossSales: 10000, commission: 1800, commissionPct: 0.2, totalCharges: 2500, ...(over.summary ?? {}) },
  }) as unknown as StoredPeriod;

describe("report trends", () => {
  test("a period belongs to the month of its end date", () => {
    expect(periodMonth({ period_end: "2026-09-30", period_start: "2026-09-01", created_at: "2026-10-02" })).toBe("2026-09");
    expect(periodMonth({ period_end: null, period_start: "2026-07-03", created_at: "2026-10-02" })).toBe("2026-07");
    expect(periodMonth({ period_end: null, period_start: null, created_at: "2026-10-02T00:00:00Z" })).toBe("2026-10");
  });

  test("periods of one month add up per platform and in total, oldest month first", () => {
    const months = buildTrendMonths([
      period({ period_end: "2026-09-30" }),
      period({ period_end: "2026-08-31" }),
      period({ period_end: "2026-08-15", platform: "jahez", summary: { grossSales: 5000, totalCharges: 1000, orders: 40 } }),
    ]);
    expect(months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(months[0]!.total).toMatchObject({ periods: 2, orders: 140, grossSales: 15000, platformCharges: 3500 });
    expect(months[0]!.byPlatform.jahez).toMatchObject({ periods: 1, grossSales: 5000 });
  });

  test("Keeta's platform cost uses its total cost ex VAT, like the dashboard", () => {
    const [month] = buildTrendMonths([period({ platform: "keeta", summary: { totalCharges: 900, keetaTotalCostExVat: 1200 } })]);
    expect(month!.total.platformCharges).toBe(1200);
  });

  test("ratios are re-weighted, not averaged", () => {
    const total = sumFigures(
      buildTrendMonths([
        period({ summary: { grossSales: 10000, commission: 2000, commissionPct: 0.2, totalCharges: 2500 } }),
        period({ period_end: "2026-09-30", summary: { grossSales: 30000, commission: 3000, commissionPct: 0.1, totalCharges: 3000 } }),
      ]).map((m) => m.total),
    );
    // bases 10,000 + 30,000; commission 5,000 → 12.5%, not the 15% simple average.
    expect(commissionPct(total)).toBeCloseTo(0.125);
    expect(platformCostPct(total)).toBeCloseTo(5500 / 40000);
    expect(averageOrder(total)).toBe(200);
  });

  test("the platform filter and month limit", () => {
    const list = [period({ period_end: "2026-07-31" }), period({ period_end: "2026-08-31" }), period({ period_end: "2026-09-30", platform: "keeta" })];
    expect(buildTrendMonths(list, { platform: "hungerstation" }).map((m) => m.month)).toEqual(["2026-07", "2026-08"]);
    expect(buildTrendMonths(list, { limit: 2 }).map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
  });

  test("change against the month before", () => {
    const [before, now] = buildTrendMonths([
      period({ summary: { grossSales: 10000, orders: 100, totalCharges: 2000, commission: 1500, commissionPct: 0.15 } }),
      period({ period_end: "2026-09-30", summary: { grossSales: 12000, orders: 90, totalCharges: 2640, commission: 2040, commissionPct: 0.17 } }),
    ]);
    const change = compareFigures(now!.total, before!.total);
    expect(change.salesChange).toBeCloseTo(0.2);
    expect(change.ordersChange).toBeCloseTo(-0.1);
    expect(change.costPctChange).toBeCloseTo(0.22 - 0.2);
    expect(change.commissionPctChange).toBeCloseTo(0.02);
    expect(compareFigures(now!.total, null).salesChange).toBeNull();
  });
});
