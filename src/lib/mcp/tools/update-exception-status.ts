import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireMcpAccess, result } from "../access";
import { EXCEPTION_STATUSES, exceptionPatch } from "../actions";
import { loadPeriod } from "../period";
import { exceptionList, periodHeadline } from "../readout";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_exception_status",
  title: "Update a difference's status",
  description:
    "Set the status of one difference found in a period (for example reviewing, claimable, contacted, disputed, recovered, rejected, closed), only when the user asked for that change in this conversation. For recovered, pass the amount recovered. Needs the user's permission to manage exceptions; the change is logged like in the app.",
  inputSchema: {
    period_id: z.string().uuid().describe("Period id from list_periods."),
    exception_id: z.string().trim().min(1).max(300).describe("Difference id from list_exceptions."),
    status: z.enum(EXCEPTION_STATUSES as [string, ...string[]]).describe("The new status."),
    note: z.string().trim().max(2000).optional().describe("A note for the record."),
    recovered_amount: z.number().min(0).optional().describe("SAR recovered (status recovered only)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id, exception_id, status, note, recovered_amount }, ctx) => {
    await requireMcpAccess(ctx);
    let patch;
    try {
      patch = exceptionPatch({ status: status as never, note, recoveredAmount: recovered_amount });
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : String(error));
    }
    const { error } = await supabaseForUser(ctx).rpc("set_exception_workflow" as never, {
      p_period_id: period_id,
      p_exception_id: exception_id,
      p_patch: patch,
    } as never);
    if (error) {
      const message = error.message;
      if (message.includes("FORBIDDEN")) throw new ToolError("ليس لديك صلاحية إدارة الاستثناءات. / You cannot manage exceptions.");
      if (message.includes("PERIOD_NOT_FOUND")) throw new ToolError("الفترة غير موجودة. / Period not found.");
      if (message.includes("INVALID")) throw new ToolError("قيمة غير صالحة لهذا الاستثناء. / Invalid value for this difference.");
      throw new ToolError(message);
    }
    const period = await loadPeriod(ctx, period_id);
    const updated = exceptionList(period, true).find((item) => item.id === exception_id) ?? null;
    return result({ period: periodHeadline(period), difference: updated });
  },
});
