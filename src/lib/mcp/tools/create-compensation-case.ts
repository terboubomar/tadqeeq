import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireMcpAccess, result } from "../access";
import { caseDetail, loadCase } from "../compensation";

export default defineTool({
  name: "create_compensation_case",
  title: "Create a compensation case",
  description:
    "Open a new «استرداد» case for one order, only when the user asked for it. Tadqeeq writes the dispute text in Arabic and English from the reason, the explanation and the evidence. Call find_order_evidence first and pass the evidence id when there is one. One case per order and platform; a duplicate is refused. Starts as draft unless status ready is asked for.",
  inputSchema: {
    platform: z.enum(["hungerstation", "keeta", "jahez"]).describe("Delivery platform."),
    order_number: z.string().trim().min(3).max(120).describe("The platform order number."),
    amount_sar: z.number().min(0).max(100000).describe("Compensation amount claimed, SAR."),
    reason: z.string().trim().min(1).max(1000).describe("Why compensation is due, e.g. 'الطلب سُلّم كاملاً والعميل اشتكى من نقص'."),
    explanation: z.string().trim().min(1).max(6000).describe("What the branch says happened."),
    evidence_id: z.string().uuid().optional().describe("Evidence id from find_order_evidence."),
    branch: z.string().trim().max(160).optional().describe("Branch name, if there is no evidence to take it from."),
    status: z.enum(["draft", "ready"]).default("draft").describe("ready = prepared and ready to send to the platform."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ platform, order_number, amount_sar, reason, explanation, evidence_id, branch, status }, ctx) => {
    await requireMcpAccess(ctx);
    const token = ctx.getToken();
    if (!token) throw new ToolError("Authenticated caller required");
    const { saveCompensationCaseOnServer } = await import("@/lib/compensation-evidence.server");
    let saved;
    try {
      saved = await saveCompensationCaseOnServer(
        {
          platform,
          orderNumber: order_number,
          compensationAmount: amount_sar,
          compensationReason: reason,
          employeeExplanation: explanation,
          evidenceId: evidence_id ?? null,
          branchName: branch ?? null,
          status,
        },
        token,
      );
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : "تعذّر إنشاء الحالة.");
    }
    return result({ created: true, case: caseDetail(await loadCase(ctx, saved.id)) });
  },
});
