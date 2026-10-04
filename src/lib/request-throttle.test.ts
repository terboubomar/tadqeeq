import { describe, expect, test } from "bun:test";

import { REACTIVATION_REQUEST_REPEAT_MS, requestedWithin } from "./onboarding";
import { planRequestThrottle } from "./plans";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const growth = { planId: "p-growth", cycle: "monthly" as const, addons: ["compensation_ai"] };

describe("plan request throttle", () => {
  test("the first request is allowed", () => {
    expect(planRequestThrottle([], growth, NOW)).toEqual({ kind: "allow" });
  });

  test("the same choice within 10 minutes returns the earlier request", () => {
    const recent = [{ ...growth, addons: ["compensation_ai"], requestedAt: ago(4) }];
    expect(planRequestThrottle(recent, growth, NOW)).toEqual({ kind: "reuse", requestedAt: ago(4) });
    expect(planRequestThrottle([{ ...growth, requestedAt: ago(11) }], growth, NOW)).toEqual({ kind: "allow" });
  });

  test("a different choice is allowed until 3 requests in the hour", () => {
    const start = { planId: "p-start", cycle: "monthly" as const, addons: [] };
    expect(planRequestThrottle([{ ...start, requestedAt: ago(2) }], growth, NOW)).toEqual({ kind: "allow" });
    const three = [
      { ...start, requestedAt: ago(2) },
      { ...growth, requestedAt: ago(20) },
      { ...start, requestedAt: ago(45) },
    ];
    expect(planRequestThrottle(three, { ...growth, cycle: "yearly" }, NOW)).toEqual({ kind: "blocked", retryInMinutes: 15 });
  });
});

describe("reactivation request window", () => {
  test("a request within the last hour is reused", () => {
    expect(requestedWithin(ago(59), NOW, REACTIVATION_REQUEST_REPEAT_MS)).toBe(true);
    expect(requestedWithin(ago(61), NOW, REACTIVATION_REQUEST_REPEAT_MS)).toBe(false);
    expect(requestedWithin(null, NOW, REACTIVATION_REQUEST_REPEAT_MS)).toBe(false);
  });
});
