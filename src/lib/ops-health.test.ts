import { describe, expect, test } from "bun:test";

import { clientHealth } from "./ops-health";

const now = new Date("2026-10-10T09:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 864e5).toISOString();

describe("clientHealth", () => {
  test("all signals good is green", () => {
    const health = clientHealth(
      { lastLogin: daysAgo(2), lastUpload: daysAgo(5), subscriptionStatus: "active", subscriptionEndsOn: "2026-12-01", orders: 9000, orderLimit: 15000 },
      now,
    );
    expect(health.level).toBe("green");
    expect(health.signals.map((s) => s.level)).toEqual(["green", "green", "green", "green"]);
  });

  test("login and upload thresholds", () => {
    expect(clientHealth({ lastLogin: daysAgo(7) }, now).level).toBe("green");
    expect(clientHealth({ lastLogin: daysAgo(10) }, now).level).toBe("amber");
    expect(clientHealth({ lastLogin: daysAgo(15) }, now).level).toBe("red");
    expect(clientHealth({ lastLogin: null }, now).level).toBe("red");
    expect(clientHealth({ lastUpload: daysAgo(14) }, now).level).toBe("green");
    expect(clientHealth({ lastUpload: daysAgo(20) }, now).level).toBe("amber");
    expect(clientHealth({ lastUpload: daysAgo(31) }, now).level).toBe("red");
  });

  test("subscription states", () => {
    const level = (subscriptionStatus: string | null, subscriptionEndsOn: string | null = null) =>
      clientHealth({ subscriptionStatus, subscriptionEndsOn }, now).level;
    expect(level("active", "2026-11-30")).toBe("green");
    expect(level("active", "2026-10-20")).toBe("amber");
    expect(level("active", "2026-10-09")).toBe("red");
    expect(level("overdue")).toBe("red");
    expect(level("trial")).toBe("amber");
    expect(level("cancelled")).toBe("red");
    expect(level(null)).toBe("red");
  });

  test("plan usage", () => {
    expect(clientHealth({ orders: 13500, orderLimit: 15000 }, now).level).toBe("green");
    expect(clientHealth({ orders: 14800, orderLimit: 15000 }, now).level).toBe("amber");
    expect(clientHealth({ orders: 15100, orderLimit: 15000 }, now).level).toBe("red");
    expect(clientHealth({ orders: 99999, orderLimit: null }, now).signals).toEqual([]);
  });

  test("the worst signal decides and unknown signals are left out", () => {
    const health = clientHealth({ lastLogin: daysAgo(1), subscriptionStatus: "active", subscriptionEndsOn: "2026-10-15" }, now);
    expect(health.level).toBe("amber");
    expect(health.signals.map((s) => s.key)).toEqual(["login", "subscription"]);
    expect(health.signals[1]!.reason).toBe("الاشتراك ينتهي خلال 14 يوماً");
  });
});
