import { describe, expect, test } from "bun:test";

import { monthLabel, shiftMonth } from "./months";

describe("operations months", () => {
  test("moves across year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });

  test("names the month in Arabic", () => {
    expect(monthLabel("2026-10")).toBe("أكتوبر 2026");
  });
});
