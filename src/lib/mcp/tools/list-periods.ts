import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_periods",
  title: "List analyzed periods",
  description: "List the invoice periods analyzed in the caller's Tadqeeq workspace, newest first.",
  inputSchema: {
    platform: z.enum(["hungerstation", "keeta", "jahez"]).optional().describe("Filter by delivery platform."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum periods to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ platform, limit }, ctx) => {
    let query = supabaseForUser(ctx)
      .from("periods")
      .select("id,label,platform,period_start,period_end,created_at")
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (platform) query = query.eq("platform", platform);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const periods = (data ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      platform: p.platform,
      period_start: p.period_start,
      period_end: p.period_end,
      created_at: p.created_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(periods) }], structuredContent: { periods } };
  },
});
