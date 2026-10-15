import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import type { StoredPeriod } from "@/lib/periods";

import { requireMcpAccess, result } from "../access";
import { periodHeadline } from "../readout";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_periods",
  title: "List audited periods",
  description:
    "Invoice periods already audited in the user's Tadqeeq workspace, newest first, with headline numbers (orders, sales, commission, platform charges). Use the id with get_period_summary, get_branch_performance or list_exceptions.",
  inputSchema: {
    platform: z.enum(["hungerstation", "keeta", "jahez"]).optional().describe("Filter by delivery platform."),
    limit: z.number().int().min(1).max(50).default(12).describe("Maximum periods to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ platform, limit }, ctx) => {
    await requireMcpAccess(ctx);
    let query = supabaseForUser(ctx)
      .from("periods")
      .select("id,label,platform,period_start,period_end,created_at,summary,cpc:invoice->cpc,cpcBranches:invoice->cpcBranches")
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (platform) query = query.eq("platform", platform);
    const { data, error } = await query;
    if (error) throw new ToolError(error.message);
    // Only the CPC invoice is read from the invoice: it is HungerStation advertising, part of platform cost %.
    const periods = ((data ?? []) as unknown as Array<StoredPeriod & Pick<StoredPeriod["invoice"], "cpc" | "cpcBranches">>).map(
      ({ cpc, cpcBranches, ...period }) => periodHeadline({ ...period, invoice: { cpc, cpcBranches } }),
    );
    return result({
      periods,
      ...(periods.length ? {} : { hint: "لا توجد فترات بعد. ابدأ تدقيقاً بـ start_audit. / No periods yet; use start_audit." }),
    });
  },
});
