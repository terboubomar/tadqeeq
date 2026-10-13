import { describe, expect, test } from "bun:test";

import { contractValidity } from "./contract-validity";

const v = (effectiveFrom: string, effectiveTo: string | null, status: "approved" | "draft" = "approved") => ({ status, effectiveFrom, effectiveTo });

describe("contractValidity", () => {
  test("warns when the last approved version has ended", () => {
    expect(contractValidity([v("2025-10-08", "2026-10-08")], "2026-10-13")).toEqual({ kind: "expired", endedOn: "2026-10-08" });
  });

  test("warns a month ahead of the end", () => {
    expect(contractValidity([v("2025-10-08", "2026-10-08")], "2026-09-20")).toEqual({ kind: "ending", endsOn: "2026-10-08", daysLeft: 18 });
    expect(contractValidity([v("2025-10-08", "2026-10-08")], "2026-06-01")).toBeNull();
  });

  test("stays quiet when a next version is approved or the version has no end", () => {
    expect(contractValidity([v("2025-10-08", "2026-10-08"), v("2026-10-09", null)], "2026-10-01")).toBeNull();
    expect(contractValidity([v("2025-10-08", "2026-10-08"), v("2026-10-20", null)], "2026-10-13")).toBeNull();
    expect(contractValidity([v("2025-10-08", null)], "2026-10-13")).toBeNull();
    expect(contractValidity([v("2025-10-08", "2026-10-08", "draft")], "2026-10-13")).toBeNull();
  });
});
