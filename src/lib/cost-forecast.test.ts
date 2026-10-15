import { describe, expect, test } from "bun:test";

import { forecastPlatformCost, nextMonth, projectedCost } from "./cost-forecast";
import type { TrendFigures, TrendMonth } from "./report-trends";

const figures = (grossSales: number, platformCharges: number): TrendFigures => ({
  periods: 1,
  orders: 100,
  grossSales,
  commission: 0,
  commissionBase: 0,
  platformCharges,
});

const month = (key: string, byPlatform: TrendMonth["byPlatform"]): TrendMonth => ({ month: key, total: figures(0, 0), byPlatform });

describe("platform cost forecast", () => {
  const months = [
    month("2026-06", { keeta: figures(1000, 400) }),
    month("2026-07", { hungerstation: figures(1000, 250), keeta: figures(1000, 300) }),
    month("2026-08", { hungerstation: figures(1000, 270) }),
    month("2026-09", { hungerstation: figures(1327130.54, 379515.79), keeta: figures(1860493.84, 587849.58) }),
  ];

  test("weights the latest three months 3, 2, 1 and gives their range", () => {
    const hs = forecastPlatformCost(months, "hungerstation")!;
    expect(hs.month).toBe("2026-10");
    expect(hs.basis.map((row) => row.month)).toEqual(["2026-09", "2026-08", "2026-07"]);
    const sept = 379515.79 / 1327130.54;
    expect(hs.costPct).toBeCloseTo((sept * 3 + 0.27 * 2 + 0.25) / 6, 10);
    expect(hs.low).toBeCloseTo(0.25, 10);
    expect(hs.high).toBeCloseTo(sept, 10);
    expect(hs.lastSales).toBe(1327130.54);
  });

  test("skips months without the platform, and works from fewer months", () => {
    const keeta = forecastPlatformCost(months, "keeta")!;
    expect(keeta.basis.map((row) => row.month)).toEqual(["2026-09", "2026-07", "2026-06"]);
    const one = forecastPlatformCost([months[3]!], "keeta")!;
    expect(one.basis).toHaveLength(1);
    expect(one.costPct).toBeCloseTo(587849.58 / 1860493.84, 10);
    expect(forecastPlatformCost(months, "jahez")).toBeNull();
  });

  test("projects the cost for the sales entered", () => {
    const hs = forecastPlatformCost([month("2026-09", { hungerstation: figures(1000, 250) })], "hungerstation")!;
    expect(projectedCost(hs, 2000)).toEqual({ cost: 500, low: 500, high: 500 });
    expect(projectedCost(hs, Number.NaN).cost).toBe(0);
  });

  test("the next month rolls over the year", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
  });
});
