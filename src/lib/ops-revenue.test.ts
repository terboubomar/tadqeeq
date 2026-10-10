import { describe, expect, test } from "bun:test";

import { buildRevenueMovements, type RevenueEvent } from "./ops-revenue";

const sub = (workspaceId: string, at: string, fields: Partial<RevenueEvent> = {}): RevenueEvent => ({
  workspaceId,
  at,
  kind: "subscription",
  status: "active",
  price: 1000,
  cycle: "monthly",
  ...fields,
});

describe("buildRevenueMovements", () => {
  test("a new paying client is new MRR in the month it was saved", () => {
    const [aug, sep] = buildRevenueMovements([sub("a", "2026-09-10T08:00:00+00:00", { subscriptionId: "s1" })], ["2026-08", "2026-09"]);
    expect(aug).toMatchObject({ mrr: 0, newMrr: 0 });
    expect(sep).toMatchObject({ mrr: 1000, newMrr: 1000, expansion: 0, contraction: 0, churned: 0 });
  });

  test("yearly prices and add-ons count monthly", () => {
    const [row] = buildRevenueMovements(
      [sub("a", "2026-09-01T00:00:00Z", { subscriptionId: "s1", price: 12000, cycle: "yearly", addonsYearly: 1200 })],
      ["2026-09"],
    );
    expect(row!.mrr).toBe(1100);
  });

  test("price changes are expansion or contraction, cancelling is churn", () => {
    const rows = buildRevenueMovements(
      [
        sub("a", "2026-07-05T00:00:00Z", { subscriptionId: "s1" }),
        sub("a", "2026-08-05T00:00:00Z", { subscriptionId: "s1", price: 1500 }),
        sub("a", "2026-09-05T00:00:00Z", { subscriptionId: "s1", price: 1200 }),
        sub("a", "2026-10-05T00:00:00Z", { subscriptionId: "s1", status: "cancelled" }),
      ],
      ["2026-07", "2026-08", "2026-09", "2026-10"],
    );
    expect(rows.map((r) => [r.newMrr, r.expansion, r.contraction, r.churned, r.mrr])).toEqual([
      [1000, 0, 0, 0, 1000],
      [0, 500, 0, 0, 1500],
      [0, 0, 300, 0, 1200],
      [0, 0, 0, 1200, 0],
    ]);
  });

  test("trial and suspended do not count; overdue still does", () => {
    const rows = buildRevenueMovements(
      [
        sub("a", "2026-08-01T00:00:00Z", { subscriptionId: "s1", status: "trial" }),
        sub("a", "2026-09-01T00:00:00Z", { subscriptionId: "s1", status: "overdue" }),
        sub("a", "2026-10-01T00:00:00Z", { subscriptionId: "s1", status: "suspended" }),
      ],
      ["2026-08", "2026-09", "2026-10"],
    );
    expect(rows.map((r) => r.mrr)).toEqual([0, 1000, 0]);
    expect(rows[1]!.newMrr).toBe(1000);
    expect(rows[2]!.churned).toBe(1000);
  });

  test("a create logged without its id is joined to the first update that names one", () => {
    const rows = buildRevenueMovements(
      [sub("a", "2026-08-01T00:00:00Z"), sub("a", "2026-09-01T00:00:00Z", { subscriptionId: "s1", price: 1300 })],
      ["2026-08", "2026-09"],
    );
    expect(rows.map((r) => r.mrr)).toEqual([1000, 1300]);
    expect(rows[1]).toMatchObject({ newMrr: 0, expansion: 300 });
  });

  test("moving a client to a new subscription row is not churn plus new", () => {
    const rows = buildRevenueMovements(
      [
        sub("a", "2026-08-01T00:00:00Z", { subscriptionId: "old" }),
        sub("a", "2026-09-02T00:00:00Z", { subscriptionId: "new", price: 1400 }),
        sub("a", "2026-09-03T00:00:00Z", { subscriptionId: "old", status: "cancelled" }),
      ],
      ["2026-08", "2026-09"],
    );
    expect(rows[1]).toMatchObject({ mrr: 1400, newMrr: 0, churned: 0, expansion: 400 });
  });

  test("a save without add-ons keeps the add-ons from before", () => {
    const rows = buildRevenueMovements(
      [
        sub("a", "2026-08-01T00:00:00Z", { subscriptionId: "s1", addonsYearly: 2400 }),
        sub("a", "2026-09-01T00:00:00Z", { subscriptionId: "s1", price: 1000 }),
      ],
      ["2026-08", "2026-09"],
    );
    expect(rows.map((r) => r.mrr)).toEqual([1200, 1200]);
  });

  test("deleting a client churns all of its revenue", () => {
    const rows = buildRevenueMovements(
      [sub("a", "2026-08-01T00:00:00Z", { subscriptionId: "s1" }), { workspaceId: "a", at: "2026-09-15T00:00:00Z", kind: "deleted" }],
      ["2026-08", "2026-09"],
    );
    expect(rows[1]).toMatchObject({ mrr: 0, churned: 1000 });
  });

  test("events before the first month set the starting point, and times in other offsets are compared as times", () => {
    const rows = buildRevenueMovements(
      [
        sub("a", "2026-05-01T00:00:00Z", { subscriptionId: "s1" }),
        // 23:30 on 30 September in UTC, written with a +03:00 offset as 1 October 02:30.
        sub("b", "2026-10-01T02:30:00+03:00", { subscriptionId: "s2" }),
      ],
      ["2026-09", "2026-10"],
    );
    expect(rows[0]).toMatchObject({ mrr: 2000, newMrr: 1000 });
    expect(rows[1]).toMatchObject({ mrr: 2000, newMrr: 0 });
  });
});
