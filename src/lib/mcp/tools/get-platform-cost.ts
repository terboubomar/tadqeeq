import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { previousPeriod } from "@/lib/platform-cost-map";

import { requireMcpAccess, result } from "../access";
import { costMapReadout, loadEarlierPeriods } from "../cost";
import { loadPeriod } from "../period";

export default defineTool({
  name: "get_platform_cost",
  title: "Platform cost breakdown",
  description:
    "What a period's platform cost is made of (كاشِف): total without VAT, % of sales without VAT, cost per order, change vs the previous period, cost by type, every line with its source, plus merchant-funded discounts and other movements that are not part of the cost. Same figure as the dashboard.",
  inputSchema: {
    period_id: z.string().uuid().describe("Period id from list_periods."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id }, ctx) => {
    await requireMcpAccess(ctx);
    const period = await loadPeriod(ctx, period_id);
    const previous = previousPeriod(period, await loadEarlierPeriods(ctx, period));
    return result(costMapReadout(period, previous));
  },
});
