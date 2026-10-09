import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireMcpAccess, result } from "../access";
import { loadPeriod } from "../period";
import { branchPerformance, periodHeadline, unallocatedCharges } from "../readout";

export default defineTool({
  name: "get_branch_performance",
  title: "Branch performance",
  description:
    "Every branch in one period: orders, sales, commission, platform cost and the invoice-only charges its invoice section lists, largest platform cost first. Charges the invoice prints only in its consolidated summary are listed once as unallocated_charges.",
  inputSchema: { period_id: z.string().uuid().describe("Period id from list_periods.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id }, ctx) => {
    await requireMcpAccess(ctx);
    const period = await loadPeriod(ctx, period_id);
    return result({ period: periodHeadline(period), branches: branchPerformance(period), unallocated_charges: unallocatedCharges(period) });
  },
});
