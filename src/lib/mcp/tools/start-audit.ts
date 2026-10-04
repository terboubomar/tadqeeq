import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { APP_URL, requireMcpAccess, result } from "../access";
import { auditUploadUrl } from "../links";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "start_audit",
  title: "Start an invoice audit",
  description:
    "Start auditing a delivery-platform invoice. Files cannot be sent through this tool: it returns a secure link (valid 2 hours) where the user uploads the order export and the invoice with the platform and bank fee already filled in. Give the user the link, ask them to come back when the upload says it is done, then call get_audit_result with the returned request_id. For HungerStation ask the user for their card/bank payment fee % first (e.g. 1.8).",
  inputSchema: {
    platform: z.enum(["hungerstation", "keeta", "jahez"]).describe("Delivery platform of the files."),
    bank_fee_pct: z
      .number()
      .min(0.1)
      .max(10)
      .optional()
      .describe("HungerStation only: the card payment fee percentage in the restaurant's contract, e.g. 1.8 for 1.8%."),
    label: z.string().trim().max(120).optional().describe("Optional name for the period, e.g. 'سبتمبر 2026'."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ platform, bank_fee_pct, label }, ctx) => {
    await requireMcpAccess(ctx);
    if (platform === "hungerstation" && bank_fee_pct === undefined) {
      throw new ToolError("لهنقرستيشن نحتاج نسبة رسوم الدفع بالبطاقة من عقد المطعم (مثل 1.8). / Ask the user for the HungerStation card fee % and call again.");
    }
    const fee = platform === "hungerstation" ? bank_fee_pct ?? null : null;
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_create_audit_request" as never, {
      p_platform: platform,
      p_bank_fee_pct: fee,
      p_label: label ?? null,
    } as never);
    if (error) throw new ToolError(error.message);
    const requestId = String(data);
    return result({
      request_id: requestId,
      upload_url: auditUploadUrl(APP_URL, { requestId, platform, bankFeePct: fee, label }),
      expires_in_minutes: 120,
      instructions_for_user:
        "افتح الرابط وسجّل الدخول بنفس الحساب، ارفع ملف الطلبات وفاتورة المنصة، واضغط «بدء التحليل». بعد ما تظهر رسالة «اكتمل التدقيق» ارجع هنا واكتب «خلصت».",
    });
  },
});
