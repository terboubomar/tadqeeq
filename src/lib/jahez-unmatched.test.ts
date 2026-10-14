import { describe, expect, test } from "bun:test";

import { monthLabel, unmatchedForException, unmatchedJahezCompensations } from "./jahez-unmatched";
import type { StoredPeriod } from "./periods";

const tx = (orderId: string, creationDate: string, match = "unknown") => ({
  sequence: "1",
  branch: orderId === "5091267917" ? "Obhur Al-Shamaliyah" : "Al Kharj",
  orderId,
  transactionType: "debit",
  reason: "missing item",
  creationDate,
  amount: 50,
  free: false,
  match,
});

/** Jahez Sept 2026: two compensations whose orders are in no saved order file (gap analysis, Gap 7). */
const sept = {
  id: "sept",
  platform: "jahez",
  label: "Jahez Sept",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  invoice: {
    jahezCompensation: {
      transactions: [tx("5091267917", "2026-09-03 12:00"), tx("6215076886", "2026-09-20 18:30"), tx("111", "2026-09-10", "current")],
    },
  },
} as unknown as StoredPeriod;

describe("unmatchedJahezCompensations", () => {
  test("names the order file needed: the compensation's month and the one before, minus months already uploaded", () => {
    const items = unmatchedJahezCompensations(sept, [sept]);
    expect(items.map((item) => item.orderId)).toEqual(["5091267917", "6215076886"]);
    // September is this period's own order file, so only August is still missing.
    expect(items[0]).toMatchObject({ branch: "Obhur Al-Shamaliyah", amount: 50, neededMonths: ["2026-08"], foundIn: null });
    expect(monthLabel("2026-08")).toBe("أغسطس 2026");
  });

  test("an order file uploaded since then is found, so re-running the analysis will match it", () => {
    const aug = {
      id: "aug",
      platform: "jahez",
      label: "Jahez Aug",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      invoice: { jahezOrderIndex: { "5091267917": { branch: "Obhur Al-Shamaliyah", date: "2026-08-30" } } },
    } as unknown as StoredPeriod;
    const items = unmatchedJahezCompensations(sept, [sept, aug]);
    expect(items[0]).toMatchObject({ orderId: "5091267917", foundIn: { periodId: "aug", periodLabel: "Jahez Aug" }, neededMonths: [] });
    // August is uploaded now but does not hold the other order: no month left to suggest.
    expect(items[1]).toMatchObject({ orderId: "6215076886", foundIn: null, neededMonths: [] });
  });

  test("links an exception to its compensation", () => {
    const items = unmatchedJahezCompensations(sept, [sept]);
    expect(unmatchedForException("jahez-comp:6215076886:1:unknown", items)?.branch).toBe("Al Kharj");
    expect(unmatchedForException("jahez-comp:6215076886:1", items)).toBeUndefined();
  });

  test("other platforms have none", () => {
    expect(unmatchedJahezCompensations({ ...sept, platform: "keeta" } as StoredPeriod, [])).toEqual([]);
  });
});
