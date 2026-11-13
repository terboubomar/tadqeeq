import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireMcpAccess, result } from "../access";
import { loadCases, NO_CASES_HINT, overviewReadout } from "../compensation";

export default defineTool({
  name: "get_compensation_overview",
  title: "Compensation center overview",
  description:
    "«استرداد» (compensation center) overview: what needs action now (ready to send, cases waiting on a reply or payment, rejected), then amounts recovered vs claimed, the recovery rate, amounts under platform review, by platform and top branches. Use it for 'what should I chase today?' or 'how much have we recovered?'.",
  inputSchema: {
    range: z.enum(["30d", "quarter", "year", "all"]).default("quarter").describe("Cases created in the last 30 days, 90 days, this year, or all."),
    platform: z.enum(["all", "hungerstation", "keeta", "jahez"]).default("all").describe("Limit to one delivery platform."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ range, platform }, ctx) => {
    await requireMcpAccess(ctx);
    const cases = await loadCases(ctx);
    return result({ ...overviewReadout(cases, { range, platform }), ...(cases.length ? {} : { hint: NO_CASES_HINT }) });
  },
});
