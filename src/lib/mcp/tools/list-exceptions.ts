import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireMcpAccess, result } from "../access";
import { loadPeriod } from "../period";
import { exceptionList, periodHeadline } from "../readout";

export default defineTool({
  name: "list_exceptions",
  title: "Differences to review",
  description:
    "Differences Tadqeeq found in one period (invoice vs recalculation, contract rates, compensations), open ones largest first, with the amount to review and what can be recovered. Use it to answer 'what should I claim from the platform?'.",
  inputSchema: {
    period_id: z.string().uuid().describe("Period id from list_periods."),
    include_closed: z.boolean().default(false).describe("Also include differences already closed or recovered."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id, include_closed }, ctx) => {
    await requireMcpAccess(ctx);
    const period = await loadPeriod(ctx, period_id);
    return result({ period: periodHeadline(period), differences: exceptionList(period, include_closed) });
  },
});
