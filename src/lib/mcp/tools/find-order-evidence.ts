import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireMcpAccess, result } from "../access";

export default defineTool({
  name: "find_order_evidence",
  title: "Find evidence for an order",
  description:
    "Before creating a compensation case: look up an order number in «استرداد». Returns the branch photos or videos sent to Tadqeeq's Telegram bot for that order (use the evidence id with create_compensation_case) and, for Jahez, matching compensation lines already in the platform's files.",
  inputSchema: {
    order_number: z.string().trim().min(3).max(120).describe("The platform order number."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ order_number }, ctx) => {
    await requireMcpAccess(ctx);
    const token = ctx.getToken();
    if (!token) throw new ToolError("Authenticated caller required");
    const { searchCompensationEvidenceOnServer } = await import("@/lib/compensation-evidence.server");
    let found;
    try {
      found = await searchCompensationEvidenceOnServer(order_number, token);
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : "تعذّر البحث عن الدليل.");
    }
    return result({
      order_number,
      evidence: found.evidence.map((e) => ({
        evidence_id: e.id,
        branch: e.branchName,
        order_number: e.orderNumber,
        captured_at: e.capturedAt,
        sent_by: e.senderName,
        media: e.mediaType,
        duration_seconds: e.durationSeconds,
      })),
      jahez_compensation_lines: found.jahezMatches.map((m) => ({
        period: m.periodLabel,
        branch: m.branch,
        order_id: m.orderId,
        type: m.transactionType,
        reason: m.reason,
        date: m.creationDate,
        amount_sar: Math.round(m.amount * 100) / 100,
        match: m.match,
      })),
      ...(found.evidence.length ? {} : { hint: "لا يوجد دليل من الفرع لهذا الطلب بعد. / No branch evidence for this order yet." }),
    });
  },
});
