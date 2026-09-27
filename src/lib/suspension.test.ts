import { describe, expect, test } from "bun:test";

import { latestSuspension } from "./onboarding";

const ev = (action: string, metadata: Record<string, unknown> | null, createdAt = "2026-09-27T10:00:00Z") => ({ action, metadata, createdAt });

describe("latestSuspension", () => {
  test("uses the reason and client message recorded with the suspension", () => {
    expect(latestSuspension([ev("client.status", { status: "suspended", reason: "request", message: " موقوف مؤقتاً " })])).toEqual({
      reason: "request",
      message: "موقوف مؤقتاً",
      since: "2026-09-27T10:00:00Z",
    });
  });

  test("older suspensions without a reason count as payment", () => {
    expect(latestSuspension([ev("client.status", { status: "suspended" })]).reason).toBe("payment");
    expect(latestSuspension([]).reason).toBe("payment");
    expect(latestSuspension([]).since).toBeNull();
  });

  test("a cancelled subscription is a payment suspension; archiving is other", () => {
    expect(latestSuspension([ev("subscription.update", { status: "cancelled" }, "2026-09-20T00:00:00Z")])).toEqual({
      reason: "payment",
      message: null,
      since: "2026-09-20T00:00:00Z",
    });
    expect(latestSuspension([ev("client.archive", {})]).reason).toBe("other");
  });

  test("the newest event wins and active subscription edits are skipped", () => {
    expect(
      latestSuspension([
        ev("subscription.update", { status: "active" }, "2026-09-27T12:00:00Z"),
        ev("client.status", { status: "suspended", reason: "other" }, "2026-09-27T11:00:00Z"),
        ev("client.status", { status: "suspended", reason: "request" }, "2026-09-01T00:00:00Z"),
      ]).reason,
    ).toBe("other");
  });

  test("a status change to something else ends the search", () => {
    expect(
      latestSuspension([ev("client.status", { status: "active" }), ev("client.status", { status: "suspended", reason: "request" }, "2026-08-01T00:00:00Z")]),
    ).toEqual({ reason: "payment", message: null, since: null });
  });
});
