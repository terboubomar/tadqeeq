import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { CASE_STATUSES, caseStatusLabel, type CompensationCaseStatus } from "@/lib/compensation-overview";

import { requireMcpAccess, result } from "../access";
import { planCaseStatusChange } from "../actions";
import { caseDetail, loadCase } from "../compensation";

export default defineTool({
  name: "update_compensation_case_status",
  title: "Move a compensation case to its next status",
  description:
    "Change one «استرداد» case's status, only when the user asked for that change in this conversation (for example 'mark order 885206 as sent'). Allowed steps follow the app: draft→ready→submitted→accepted/recovered/rejected, rejected→submitted/closed, recovered→closed, closed→draft. For recovered, pass the amount actually paid if it was partial. Uses the user's own permissions; the change appears in the case history.",
  inputSchema: {
    case_id: z.string().uuid().describe("Case id from list_compensation_cases."),
    status: z.enum(CASE_STATUSES as [string, ...string[]]).describe("The new status."),
    platform_reference: z.string().trim().max(120).optional().describe("The platform's case reference, if the user gave one."),
    recovered_amount: z.number().min(0).optional().describe("SAR actually recovered (status recovered only); defaults to the full claim."),
    note: z.string().trim().max(1000).optional().describe("A note for the history, such as the platform's rejection reason."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ case_id, status, platform_reference, recovered_amount, note }, ctx) => {
    await requireMcpAccess(ctx);
    const token = ctx.getToken();
    if (!token) throw new ToolError("Authenticated caller required");
    const item = await loadCase(ctx, case_id);
    let input;
    try {
      input = planCaseStatusChange(item, status as CompensationCaseStatus, {
        platformReference: platform_reference,
        recoveredAmount: recovered_amount,
        note,
      });
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : String(error));
    }
    const { saveCompensationCaseOnServer } = await import("@/lib/compensation-evidence.server");
    try {
      await saveCompensationCaseOnServer(input, token);
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : "تعذّر حفظ الحالة.");
    }
    const saved = await loadCase(ctx, case_id);
    return result({ changed: `${caseStatusLabel(item.status)} → ${caseStatusLabel(saved.status)}`, case: caseDetail(saved) });
  },
});
