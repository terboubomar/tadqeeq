import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "./periods";
import { buildReportDigest, describeTiming, isScheduleDue, parseRecipients, riyadhToday } from "./report-schedules";

const base = { active: true, dayOfMonth: null, weekday: null, lastSentAt: null, lastPeriodId: null, createdAt: "2026-09-01T00:00:00Z" };

describe("riyadhToday", () => {
  test("uses the Riyadh date (UTC+3)", () => {
    // 22:30 UTC on Saturday 10 Oct is 01:30 on Sunday 11 Oct in Riyadh.
    expect(riyadhToday(new Date("2026-10-10T22:30:00Z"))).toEqual({ date: "2026-10-11", month: "2026-10", day: 11, weekday: 0 });
  });
});

describe("isScheduleDue", () => {
  const at = (iso: string) => new Date(iso);

  test("monthly: on or after its day, once per month", () => {
    const s = { ...base, frequency: "monthly" as const, dayOfMonth: 3 };
    expect(isScheduleDue(s, at("2026-10-02T08:00:00Z"), null)).toBe(false);
    expect(isScheduleDue(s, at("2026-10-03T08:00:00Z"), null)).toBe(true);
    expect(isScheduleDue({ ...s, lastSentAt: "2026-10-03T05:00:00Z" }, at("2026-10-20T08:00:00Z"), null)).toBe(false);
    // A missed run catches up later the same month.
    expect(isScheduleDue({ ...s, lastSentAt: "2026-09-03T05:00:00Z" }, at("2026-10-09T08:00:00Z"), null)).toBe(true);
  });

  test("weekly: on its weekday, once that day", () => {
    const s = { ...base, frequency: "weekly" as const, weekday: 0 };
    expect(isScheduleDue(s, at("2026-10-11T06:00:00Z"), null)).toBe(true); // Sunday
    expect(isScheduleDue(s, at("2026-10-12T06:00:00Z"), null)).toBe(false);
    expect(isScheduleDue({ ...s, lastSentAt: "2026-10-11T05:00:00Z" }, at("2026-10-11T09:00:00Z"), null)).toBe(false);
    expect(isScheduleDue({ ...s, lastSentAt: "2026-10-04T05:00:00Z" }, at("2026-10-11T09:00:00Z"), null)).toBe(true);
  });

  test("on upload: a newer period it has not sent, saved after the schedule was made", () => {
    const s = { ...base, frequency: "on_upload" as const };
    const now = at("2026-10-11T09:00:00Z");
    expect(isScheduleDue(s, now, null)).toBe(false);
    expect(isScheduleDue(s, now, { id: "p1", created_at: "2026-08-15T00:00:00Z" })).toBe(false);
    expect(isScheduleDue(s, now, { id: "p2", created_at: "2026-10-10T00:00:00Z" })).toBe(true);
    expect(isScheduleDue({ ...s, lastPeriodId: "p2" }, now, { id: "p2", created_at: "2026-10-10T00:00:00Z" })).toBe(false);
  });

  test("paused schedules never send", () => {
    expect(isScheduleDue({ ...base, frequency: "monthly", dayOfMonth: 1, active: false }, at("2026-10-05T08:00:00Z"), null)).toBe(false);
  });
});

describe("recipients and timing text", () => {
  test("splits, lower-cases, de-duplicates and flags bad addresses", () => {
    expect(parseRecipients("CFO@example.com, ops@example.com\nops@example.com;  bad-address، x@y.sa")).toEqual({
      valid: ["cfo@example.com", "ops@example.com", "x@y.sa"],
      invalid: ["bad-address"],
    });
  });

  test("describes each frequency", () => {
    expect(describeTiming({ frequency: "monthly", dayOfMonth: 5, weekday: null })).toBe("شهرياً في اليوم 5");
    expect(describeTiming({ frequency: "weekly", dayOfMonth: null, weekday: 1 })).toBe("أسبوعياً يوم الاثنين");
    expect(describeTiming({ frequency: "on_upload", dayOfMonth: null, weekday: null })).toBe("بعد رفع كل فترة جديدة");
  });
});

describe("buildReportDigest", () => {
  const period = (end: string, platform: StoredPeriod["platform"], s: Record<string, number>) =>
    ({ id: end + platform, label: `${platform} ${end}`, platform, period_start: null, period_end: end, created_at: end, summary: s }) as unknown as StoredPeriod;

  test("latest month against the month before, with each platform", () => {
    const digest = buildReportDigest(
      [
        period("2026-08-31", "hungerstation", { grossSales: 10000, netSales: 8000, orders: 100, totalCharges: 2000, commission: 1500, commissionPct: 0.15 }),
        period("2026-09-30", "hungerstation", { grossSales: 11000, netSales: 9000, orders: 110, totalCharges: 2420, commission: 1650, commissionPct: 0.15 }),
        period("2026-09-30", "keeta", { grossSales: 1000, keetaSalesExVat: 1000, orders: 10, totalCharges: 100, commission: 80, commissionPct: 0.08 }),
      ],
      { label: "keeta 2026-09-30" },
    )!;
    expect(digest.monthLabel).toContain("سبتمبر");
    expect(digest.previousMonthLabel).toContain("أغسطس");
    expect(digest.figures[0]).toEqual({ label: "المبيعات", value: "12,000.00 ر.س", change: "+20.0%", good: true });
    // Sales without VAT: 2,520 / 10,000 = 25.2% against 2,000 / 8,000 = 25% → +0.2 point, which is bad news.
    expect(digest.figures[2]).toEqual({ label: "تكلفة المنصة", value: "25.2%", change: "+0.2 نقطة", good: false });
    expect(digest.platforms.map((p) => p.name)).toEqual(["هنقرستيشن", "كيتا"]);
    expect(digest.newPeriodLabel).toBe("keeta 2026-09-30");
  });

  test("no periods, no digest", () => {
    expect(buildReportDigest([])).toBeNull();
  });
});
