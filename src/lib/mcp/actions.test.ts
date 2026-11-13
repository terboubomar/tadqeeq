import { describe, expect, test } from "bun:test";

import { exceptionPatch, planCaseStatusChange } from "./actions";
import type { McpCase } from "./compensation";

const base: McpCase = {
  id: "c1",
  periodId: "p1",
  orderNumber: "885206",
  platform: "jahez",
  branchName: "الملقا",
  compensationAmount: 229,
  compensationReason: "طلب ناقص",
  employeeExplanation: "الصنف غير موجود",
  status: "submitted",
  aggregatorCaseReference: null,
  evidenceId: "ev1",
  draftAr: "",
  draftEn: "",
  auditContext: null,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
};

describe("MCP case status changes", () => {
  test("only the steps the app offers are allowed", () => {
    expect(() => planCaseStatusChange({ ...base, status: "draft" }, "recovered")).toThrow(/ready/);
    expect(() => planCaseStatusChange({ ...base, status: "closed" }, "submitted")).toThrow();
    expect(planCaseStatusChange({ ...base, status: "draft" }, "ready").status).toBe("ready");
  });

  test("keeps the case's details and adds the reference and note", () => {
    const input = planCaseStatusChange({ ...base, status: "ready" }, "submitted", { platformReference: " CS-1 ", note: "أُرسلت عبر البريد" });
    expect(input).toMatchObject({
      id: "c1",
      periodId: "p1",
      evidenceId: "ev1",
      orderNumber: "885206",
      compensationAmount: 229,
      aggregatorCaseReference: "CS-1",
      statusNote: "أُرسلت عبر البريد",
      recoveredAmount: null,
    });
  });

  test("a recovery defaults to the full claim and accepts a partial amount", () => {
    expect(planCaseStatusChange(base, "recovered").recoveredAmount).toBe(229);
    expect(planCaseStatusChange(base, "recovered", { recoveredAmount: 150 }).recoveredAmount).toBe(150);
    expect(() => planCaseStatusChange(base, "rejected", { recoveredAmount: 10 })).toThrow();
  });
});

describe("MCP exception status changes", () => {
  test("builds the database patch and keeps recovered amounts to recovered", () => {
    expect(exceptionPatch({ status: "contacted", note: " اتصلنا بالمنصة " })).toEqual({ status: "contacted", note: "اتصلنا بالمنصة" });
    expect(exceptionPatch({ status: "recovered", recoveredAmount: 120 })).toEqual({ status: "recovered", recoveredAmount: 120 });
    expect(() => exceptionPatch({ status: "disputed", recoveredAmount: 5 })).toThrow();
  });
});
