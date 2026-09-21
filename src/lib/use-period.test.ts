import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "./periods";
import { latestPeriod } from "./use-period";

function period(
  id: string,
  end: string | null,
  createdAt: string,
): StoredPeriod {
  return {
    id,
    period_end: end,
    created_at: createdAt,
  } as StoredPeriod;
}

describe("latestPeriod", () => {
  test("uses accounting period end instead of upload time", () => {
    const augustUploadedLater = period(
      "aug",
      "2026-08-31",
      "2026-09-20T12:00:00Z",
    );
    const septemberUploadedEarlier = period(
      "sep",
      "2026-09-30",
      "2026-09-01T12:00:00Z",
    );

    expect(latestPeriod([augustUploadedLater, septemberUploadedEarlier])?.id).toBe("sep");
  });

  test("uses created_at only as a tie-break for the same period end", () => {
    const older = period("older", "2026-09-30", "2026-10-01T08:00:00Z");
    const newer = period("newer", "2026-09-30", "2026-10-01T09:00:00Z");

    expect(latestPeriod([older, newer])?.id).toBe("newer");
  });

  test("places dated periods ahead of rows with no period end", () => {
    const undated = period("undated", null, "2026-12-01T09:00:00Z");
    const dated = period("dated", "2026-09-30", "2026-10-01T09:00:00Z");

    expect(latestPeriod([undated, dated])?.id).toBe("dated");
  });

  test("returns null for an empty list", () => {
    expect(latestPeriod([])).toBeNull();
  });
});
