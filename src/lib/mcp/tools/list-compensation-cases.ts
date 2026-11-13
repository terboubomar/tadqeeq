import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { CASE_STATUSES } from "@/lib/compensation-overview";

import { requireMcpAccess, result } from "../access";
import { caseLine, filterCases, loadCases, NO_CASES_HINT } from "../compensation";

export default defineTool({
  name: "list_compensation_cases",
  title: "List compensation cases",
  description:
    "Compensation cases in «استرداد», most recently changed first, with status, amount, branch and any follow-up due. Filter by status, platform, branch or follow-up. Use the id with get_compensation_case.",
  inputSchema: {
    status: z.enum(CASE_STATUSES as [string, ...string[]]).optional().describe("draft, ready, submitted, accepted, recovered, rejected or closed."),
    platform: z.enum(["hungerstation", "keeta", "jahez"]).optional().describe("Delivery platform."),
    branch: z.string().trim().max(120).optional().describe("Part of the branch name."),
    follow_up_only: z.boolean().default(false).describe("Only cases waiting too long: ready but not sent, or no platform answer or payment."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum cases to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, platform, branch, follow_up_only, limit }, ctx) => {
    await requireMcpAccess(ctx);
    const all = await loadCases(ctx);
    const matching = filterCases(all, {
      status: status as never,
      platform,
      branch,
      followUpOnly: follow_up_only,
    });
    return result({
      total_matching: matching.length,
      cases: matching.slice(0, limit).map((item) => caseLine(item)),
      ...(all.length ? {} : { hint: NO_CASES_HINT }),
    });
  },
});
