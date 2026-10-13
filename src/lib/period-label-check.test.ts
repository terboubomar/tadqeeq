import { describe, expect, test } from "bun:test";

import { labelMonths, periodLabelMismatch } from "./period-label-check";

describe("labelMonths", () => {
  test("reads Arabic, English and numeric months", () => {
    expect(labelMonths("هنقرستيشن سبتمبر 2026")).toEqual([{ month: 9, year: 2026 }]);
    expect(labelMonths("Keeta October")).toEqual([{ month: 10, year: null }]);
    expect(labelMonths("2026-09")).toEqual([{ month: 9, year: 2026 }]);
    expect(labelMonths("09/2026")).toEqual([{ month: 9, year: 2026 }]);
    expect(labelMonths("أكتوبر ٢٠٢٦")).toEqual([{ month: 10, year: 2026 }]);
    expect(labelMonths("الفترة الأولى")).toEqual([]);
  });
});

describe("periodLabelMismatch", () => {
  test("agrees when a named month falls in the file's dates", () => {
    expect(periodLabelMismatch("سبتمبر 2026", "2026-09-01", "2026-09-30")).toBeNull();
    expect(periodLabelMismatch("سبتمبر", "2026-09-01", "2026-09-30")).toBeNull();
    expect(periodLabelMismatch("سبتمبر وأكتوبر", "2026-10-01", "2026-10-31")).toBeNull();
    expect(periodLabelMismatch("September", "2026-08-25", "2026-09-07")).toBeNull();
  });

  test("flags a name whose month is outside the file's dates", () => {
    expect(periodLabelMismatch("سبتمبر 2026", "2026-10-01", "2026-10-31")).toEqual({
      labelMonths: ["سبتمبر 2026"],
      fileMonths: ["أكتوبر 2026"],
    });
    expect(periodLabelMismatch("سبتمبر 2025", "2026-09-01", "2026-09-30")?.fileMonths).toEqual(["سبتمبر 2026"]);
  });

  test("stays quiet without a month or without dates", () => {
    expect(periodLabelMismatch("الفترة الأولى", "2026-10-01", "2026-10-31")).toBeNull();
    expect(periodLabelMismatch("سبتمبر", null, "2026-10-31")).toBeNull();
  });
});
