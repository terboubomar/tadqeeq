import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { APP_URL, requireMcpAccess, result } from "../access";
import { loadPeriod } from "../period";
import { periodReadout } from "../readout";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_audit_result",
  title: "Get the audit result",
  description:
    "Result of an audit started with start_audit: the invoice comparison, differences to claim and costliest branches, computed by Tadqeeq's accounting engine. If the upload is not finished yet it says so; ask the user to finish the upload and try again.",
  inputSchema: { request_id: z.string().uuid().describe("request_id returned by start_audit.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ request_id }, ctx) => {
    await requireMcpAccess(ctx);
    const { data, error } = await supabaseForUser(ctx)
      .from("mcp_audit_requests")
      .select("status,period_id,expires_at,platform")
      .eq("id", request_id)
      .maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("طلب التدقيق غير موجود. / Audit request not found.");
    if (data.status !== "completed" || !data.period_id) {
      const expired = Date.parse(String(data.expires_at)) < Date.now();
      return result({
        status: expired ? "expired" : "waiting_for_upload",
        message: expired
          ? "انتهت صلاحية رابط الرفع. ابدأ تدقيقاً جديداً بـ start_audit. / The upload link expired; call start_audit again."
          : "لم يكتمل الرفع بعد. اطلب من المستخدم إكمال الرفع في الرابط ثم حاول مجدداً. / Upload not finished yet.",
      });
    }
    return result({ status: "completed", ...periodReadout(await loadPeriod(ctx, String(data.period_id)), APP_URL) });
  },
});
