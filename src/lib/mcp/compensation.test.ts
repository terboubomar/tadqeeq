import { describe, expect, test } from "bun:test";

import { buildCompensationOverview } from "@/lib/compensation-overview";

import { caseDetail, caseLine, filterCases, mapCaseRow, overviewReadout, type McpCase } from "./compensation";

const now = new Date("2026-11-13T12:00:00Z");

function c(partial: Partial<McpCase> & { id: string }): McpCase {
  return {
    periodId: null,
    orderNumber: "880" + partial.id,
    platform: "jahez",
    branchName: "فرع العليا",
    compensationAmount: 100,
    compensationReason: "طلب ناقص",
    employeeExplanation: "الصنف غير موجود",
    status: "draft",
    aggregatorCaseReference: null,
    evidenceId: null,
    draftAr: "نص الاعتراض",
    draftEn: "Dispute text",
    auditContext: null,
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
    ...partial,
  };
}

const cases: McpCase[] = [
  c({ id: "1", status: "ready", compensationAmount: 40, auditContext: { workflow: { history: [{ status: "ready", at: "2026-11-01T10:00:00Z" }] } } }),
  c({ id: "2", status: "submitted", compensationAmount: 60, platform: "keeta", branchName: "فرع الملقا", auditContext: { workflow: { history: [{ status: "submitted", at: "2026-11-02T10:00:00Z" }] } } }),
  c({ id: "3", status: "rejected", compensationAmount: 30, auditContext: { workflow: { history: [{ status: "rejected", at: "2026-11-05T10:00:00Z", note: "الدليل غير واضح" }], rejectionReason: "الدليل غير واضح" } } }),
  c({ id: "4", status: "recovered", compensationAmount: 80, evidenceId: "ev", auditContext: { workflow: { history: [{ status: "recovered", at: "2026-11-06T10:00:00Z" }], recoveredAmount: 50 } } }),
];

describe("MCP compensation readouts", () => {
  test("maps database rows, including numeric amounts sent as text", () => {
    const row = mapCaseRow({
      id: "x", order_number: "123", platform: "keeta", branch_name: null, compensation_amount: "45.50", compensation_reason: "r",
      employee_explanation: "e", status: "ready", aggregator_case_reference: null, evidence_id: null, draft_ar: "a", draft_en: "b",
      audit_context: null, created_at: "c", updated_at: "u",
    });
    expect(row.compensationAmount).toBe(45.5);
    expect(row.orderNumber).toBe("123");
  });

  test("the overview uses the app's own figures", () => {
    const readout = overviewReadout(cases, { range: "all", platform: "all", now });
    const app = buildCompensationOverview(cases, [], { range: "all", platform: "all", now });
    expect(readout.needs_action.ready_to_send).toEqual({ count: 1, amount_sar: 40 });
    expect(readout.needs_action.rejected).toEqual({ count: 1, amount_sar: 30 });
    expect(readout.needs_action.needs_follow_up.count).toBe(app.followUps.length);
    expect(readout.key_numbers.recovered_sar).toBe(50);
    expect(readout.key_numbers.claimed_sar).toBe(210);
    expect(readout.key_numbers.partial_refund_gap_sar).toBe(30);
  });

  test("filters by status, platform, branch and follow-up", () => {
    expect(filterCases(cases, { status: "ready" }, now).map((x) => x.id)).toEqual(["1"]);
    expect(filterCases(cases, { platform: "keeta" }, now).map((x) => x.id)).toEqual(["2"]);
    expect(filterCases(cases, { branch: "الملقا" }, now).map((x) => x.id)).toEqual(["2"]);
    // Ready for 12 days and submitted for 11 days with no answer both need a nudge.
    expect(filterCases(cases, { followUpOnly: true }, now).map((x) => x.id)).toEqual(["1", "2"]);
  });

  test("a case line labels the status and shows what was actually recovered", () => {
    const line = caseLine(cases[3]!, now);
    expect(line.status_ar).toBe("مسترَدة");
    expect(line.recovered_sar).toBe(50);
    expect(line.has_evidence).toBe(true);
    expect(caseLine(cases[0]!, now).follow_up).toContain("جاهزة ولم تُرسل");
  });

  test("case detail carries the history, rejection reason and dispute text", () => {
    const detail = caseDetail(cases[2]!, now);
    expect(detail.rejection_reason).toBe("الدليل غير واضح");
    expect(detail.history).toEqual([{ status: "rejected", status_ar: "مرفوضة", at: "2026-11-05T10:00:00Z", note: "الدليل غير واضح" }]);
    expect(detail.dispute_text_ar).toBe("نص الاعتراض");
    expect(detail.dispute_text_en).toBe("Dispute text");
  });
});
