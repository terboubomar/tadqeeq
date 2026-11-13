import { caseStatusLabel, nextCaseActions, type CompensationCaseStatus } from "@/lib/compensation-overview";
import type { SaveCompensationCaseInput } from "@/lib/compensation-evidence.server";
import type { ExceptionStatus } from "@/lib/exceptions";

import type { McpCase } from "./compensation";

/**
 * What the MCP's write tools may do. A case moves only along the steps the app offers for its current status
 * (nextCaseActions), and the save goes through the app's own server function, so permissions, branch access
 * and the status history stay exactly as in the app.
 */

export const EXCEPTION_STATUSES: ExceptionStatus[] = [
  "new",
  "reviewing",
  "evidence_requested",
  "classified",
  "claimable",
  "contacted",
  "disputed",
  "recovered",
  "rejected",
  "closed",
];

export function planCaseStatusChange(
  item: McpCase,
  next: CompensationCaseStatus,
  options: { platformReference?: string | null; recoveredAmount?: number | null; note?: string | null } = {},
): SaveCompensationCaseInput {
  const allowed = nextCaseActions(item.status).map((action) => action.status);
  if (!allowed.includes(next)) {
    const choices = allowed.map((status) => `${status} (${caseStatusLabel(status)})`).join(", ") || "none";
    throw new Error(
      `لا يمكن نقل الحالة من «${caseStatusLabel(item.status)}» إلى «${caseStatusLabel(next)}». / ` +
        `A ${item.status} case can move to: ${choices}.`,
    );
  }
  if (options.recoveredAmount != null && next !== "recovered") {
    throw new Error("المبلغ المسترَد يُسجَّل فقط عند «تم الاسترداد». / recovered_amount is only for status recovered.");
  }
  return {
    id: item.id,
    periodId: item.periodId,
    evidenceId: item.evidenceId,
    platform: item.platform as SaveCompensationCaseInput["platform"],
    orderNumber: item.orderNumber,
    branchName: item.branchName,
    compensationAmount: item.compensationAmount,
    compensationReason: item.compensationReason,
    employeeExplanation: item.employeeExplanation,
    status: next,
    aggregatorCaseReference:
      options.platformReference !== undefined ? options.platformReference?.trim() || null : item.aggregatorCaseReference,
    // Without an amount, a recovery counts as paid in full (as the app's default).
    recoveredAmount: next === "recovered" ? (options.recoveredAmount ?? item.compensationAmount) : null,
    statusNote: options.note?.trim() || null,
  };
}

/** The patch sent to set_exception_workflow (the database checks exceptions.manage and the values). */
export function exceptionPatch(input: { status: ExceptionStatus; note?: string | null; recoveredAmount?: number | null }) {
  if (input.recoveredAmount != null && input.status !== "recovered") {
    throw new Error("المبلغ المسترَد يُسجَّل فقط عند «recovered». / recovered_amount is only for status recovered.");
  }
  return {
    status: input.status,
    ...(input.note !== undefined && input.note !== null ? { note: input.note.trim() } : {}),
    ...(input.recoveredAmount != null ? { recoveredAmount: input.recoveredAmount } : {}),
  };
}
