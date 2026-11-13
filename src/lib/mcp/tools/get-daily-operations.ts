import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { currentOperationMonth } from "@/lib/operations/catalog";

import { requireMcpAccess, result } from "../access";
import { dailyOperationsReadout, loadOperationMonth } from "../invoice-daily";

export default defineTool({
  name: "get_daily_operations",
  title: "Daily operations (نبض)",
  description:
    "Daily operations for a month (نَبض) from the daily order files: orders, sales, platform charges and settlement so far per platform, the month-end forecast, missing or incomplete days, and the top branches. Use it for 'how is this month going?'.",
  inputSchema: {
    month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM; defaults to the current month."),
    platform: z.enum(["hungerstation", "keeta", "jahez"]).optional().describe("Limit to one delivery platform."),
    include_days: z.boolean().default(false).describe("Also list each uploaded day."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ month, platform, include_days }, ctx) => {
    await requireMcpAccess(ctx);
    const overview = await loadOperationMonth(ctx, month ?? currentOperationMonth());
    const readout = dailyOperationsReadout(overview, { platform, includeDays: include_days });
    const uploaded = overview.platforms.some((p) => p.coveredDays > 0);
    return result({
      ...readout,
      ...(uploaded ? {} : { hint: "لا توجد ملفات يومية لهذا الشهر. ارفعها من «نبض». / No daily files for this month; upload them in Nabd." }),
    });
  },
});
