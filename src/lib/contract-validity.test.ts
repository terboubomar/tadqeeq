import { describe, expect, test } from "bun:test";

import { contractValidity, versionForPeriod, versionOnDate } from "./contract-validity";

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

describe("versionForPeriod", () => {
  const v1 = { id: "v1", effectiveFrom: "2025-10-08", effectiveTo: "2026-10-08" };
  const v2 = { id: "v2", effectiveFrom: "2026-10-20", effectiveTo: null };

  test("a version covering the whole period applies with no note", () => {
    expect(versionForPeriod([v1], "2026-09-01", "2026-09-30")).toEqual({ version: v1, note: null });
  });

  test("a contract stays in force after its end date until a new version is uploaded", () => {
    const result = versionForPeriod([v1], "2026-11-01", "2026-11-30")!;
    expect(result.version).toBe(v1);
    expect(result.note).toContain("تبقى مستخدمة حتى تُرفع نسخة جديدة");
  });

  test("a newer version starting inside the period: the one in force on the first day applies", () => {
    const result = versionForPeriod([v1, v2], "2026-10-01", "2026-10-31")!;
    expect(result.version).toBe(v1);
    expect(result.note).toContain("2026-10-20");
  });

  test("a contract starting inside the period applies, with a note; none before or inside → null", () => {
    const hs = { id: "hs", effectiveFrom: "2026-10-04", effectiveTo: "2026-12-31" };
    expect(versionForPeriod([hs], "2026-10-01", "2026-10-31")?.note).toContain("2026-10-04");
    expect(versionForPeriod([hs], "2026-09-01", "2026-09-30")).toBeNull();
  });
});

describe("versionOnDate", () => {
  test("the latest version started by the date, past its end date too", () => {
    const v1 = { id: "v1", effectiveFrom: "2025-10-08", effectiveTo: "2026-10-08" };
    const v2 = { id: "v2", effectiveFrom: "2027-01-01", effectiveTo: null };
    expect(versionOnDate([v1, v2], "2026-11-15")).toBe(v1);
    expect(versionOnDate([v1, v2], "2027-02-01")).toBe(v2);
    expect(versionOnDate([v1], "2025-01-01")).toBeNull();
  });
});
