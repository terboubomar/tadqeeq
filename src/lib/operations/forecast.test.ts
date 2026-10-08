import { describe, expect, test } from "bun:test";

import { forecastFromCompleteMonthToDate } from "./forecast";

describe("daily operations forecast", () => {
  test("does not extrapolate one later day over the whole month", () => {
    expect(
      forecastFromCompleteMonthToDate({
        businessDates: ["2026-10-06"],
        daysInMonth: 31,
        chargesToDate: 24_323.65,
        settlementToDate: 44_635.45,
      }),
    ).toEqual({ charges: null, settlement: null, missingDays: [1, 2, 3, 4, 5] });
  });

  test("projects only when every day through the latest upload is present", () => {
    expect(
      forecastFromCompleteMonthToDate({
        businessDates: [
          "2026-10-01",
          "2026-10-02",
          "2026-10-03",
          "2026-10-04",
          "2026-10-05",
          "2026-10-06",
        ],
        daysInMonth: 31,
        chargesToDate: 24_323.65,
        settlementToDate: 44_635.45,
      }),
    ).toEqual({ charges: 125_672.19, settlement: 230_616.49, missingDays: [] });
  });

  test("returns no forecast before any daily report is uploaded", () => {
    expect(
      forecastFromCompleteMonthToDate({
        businessDates: [],
        daysInMonth: 31,
        chargesToDate: 0,
        settlementToDate: 0,
      }),
    ).toEqual({ charges: null, settlement: null, missingDays: [] });
  });
});
