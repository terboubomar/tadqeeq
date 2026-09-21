import { describe, expect, test } from "bun:test";

import {
  DuplicatePeriodError,
  samePeriodRange,
  type StoredPeriod,
} from "./periods";

function period(
  platform: StoredPeriod["platform"],
  start: string | null,
  end: string | null,
) {
  return {
    platform,
    period_start: start,
    period_end: end,
  } as Pick<StoredPeriod, "platform" | "period_start" | "period_end">;
}

describe("period duplicate identity", () => {
  test("matches only the same platform and exact date range", () => {
    const existing = period("hungerstation", "2026-08-01", "2026-08-31");

    expect(
      samePeriodRange(existing, {
        platform: "hungerstation",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
      }),
    ).toBe(true);

    expect(
      samePeriodRange(existing, {
        platform: "keeta",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
      }),
    ).toBe(false);

    expect(
      samePeriodRange(existing, {
        platform: "hungerstation",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      }),
    ).toBe(false);
  });

  test("does not claim duplicate identity when the audit range is incomplete", () => {
    expect(
      samePeriodRange(period("jahez", null, null), {
        platform: "jahez",
        periodStart: null,
        periodEnd: null,
      }),
    ).toBe(false);
  });

  test("duplicate error carries the existing period reference for the open action", () => {
    const error = new DuplicatePeriodError({
      existingPeriodId: "period-existing",
      platform: "keeta",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });

    expect(error.message).toBe("هذه الفترة محفوظة مسبقاً");
    expect(error.existingPeriodId).toBe("period-existing");
    expect(error.platform).toBe("keeta");
  });
});
