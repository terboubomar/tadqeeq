import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { APP_URL, requireMcpAccess, result } from "../access";
import { loadPeriod } from "../period";
import { periodReadout } from "../readout";

export default defineTool({
  name: "get_period_summary",
  title: "Period audit summary",
  description:
    "Audit of one period: headline numbers, the invoice line by line (recalculated vs invoiced), open differences with the amount to claim, and the costliest branches. Numbers come from Tadqeeq's engine; explain them, never recalculate.",
  inputSchema: { period_id: z.string().uuid().describe("Period id from list_periods.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id }, ctx) => {
    await requireMcpAccess(ctx);
    return result(periodReadout(await loadPeriod(ctx, period_id), APP_URL));
  },
});
