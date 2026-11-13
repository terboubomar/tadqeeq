import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireMcpAccess, result } from "../access";
import { comparisonReadout, findPreviousComparablePeriod, loadEarlierPeriods } from "../cost";
import { loadPeriod } from "../period";

export default defineTool({
  name: "compare_periods",
  title: "Compare two periods",
  description:
    "Compare a period with an earlier one of the same platform: sales, orders, commission, platform cost and its rate, platform-specific measures, differences to review, and the branches whose cost changed most. Without previous_period_id it uses the latest earlier period.",
  inputSchema: {
    period_id: z.string().uuid().describe("The period to look at, from list_periods."),
    previous_period_id: z.string().uuid().optional().describe("The earlier period to compare with (same platform)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id, previous_period_id }, ctx) => {
    await requireMcpAccess(ctx);
    const current = await loadPeriod(ctx, period_id);
    const previous = previous_period_id
      ? await loadPeriod(ctx, previous_period_id)
      : findPreviousComparablePeriod(current, await loadEarlierPeriods(ctx, current));
    if (!previous) {
      throw new ToolError("لا توجد فترة سابقة لنفس المنصة للمقارنة. / No earlier period of the same platform to compare with.");
    }
    if (previous.platform !== current.platform) {
      throw new ToolError("لا يمكن مقارنة فترتين من منصتين مختلفتين. / The two periods are from different platforms.");
    }
    return result(comparisonReadout(current, previous));
  },
});
