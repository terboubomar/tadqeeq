import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireMcpAccess, result } from "../access";
import { caseDetail, loadCase } from "../compensation";

export default defineTool({
  name: "get_compensation_case",
  title: "One compensation case",
  description:
    "One «استرداد» case: order, platform, branch, amount, status and history, rejection reason, whether evidence is attached, and the dispute text ready to send to the platform in Arabic and English.",
  inputSchema: {
    case_id: z.string().uuid().describe("Case id from list_compensation_cases or get_compensation_overview."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ case_id }, ctx) => {
    await requireMcpAccess(ctx);
    return result({ case: caseDetail(await loadCase(ctx, case_id)) });
  },
});
