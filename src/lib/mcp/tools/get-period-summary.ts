import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_period_summary",
  title: "Get period summary",
  description: "Get the summary totals and invoice reconciliation for one analyzed period.",
  inputSchema: { period_id: z.string().uuid().describe("Period id from list_periods.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id }, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from("periods")
      .select("id,label,platform,period_start,period_end,summary,invoice")
      .eq("id", period_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) throw new ToolError("Period not found.");
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});
