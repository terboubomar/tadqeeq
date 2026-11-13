import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireMcpAccess, result } from "../access";
import { invoiceCheckReadout } from "../invoice-daily";
import { loadPeriod } from "../period";

export default defineTool({
  name: "get_invoice_check",
  title: "Invoice check (مُطابِق)",
  description:
    "The invoice reconciliation for a period (مُطابِق): each invoice line recalculated from the orders vs what the platform invoiced, the verdict, the difference when above 10 SAR, and the headline claim difference. Use it for 'did the platform invoice us correctly?'.",
  inputSchema: {
    period_id: z.string().uuid().describe("Period id from list_periods."),
    flagged_only: z.boolean().default(false).describe("Only lines that need review."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id, flagged_only }, ctx) => {
    await requireMcpAccess(ctx);
    return result(invoiceCheckReadout(await loadPeriod(ctx, period_id), flagged_only));
  },
});
