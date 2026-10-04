import { defineTool } from "@lovable.dev/mcp-js";

import { accessMessage, APP_URL, loadMcpAccess, result } from "../access";

export default defineTool({
  name: "get_account",
  title: "Connected account",
  description:
    "Which Tadqeeq account is connected: email, company workspace, role and plan, and whether this assistant may use Tadqeeq (الشاملة plan). Call this first, or when other tools return nothing.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const access = await loadMcpAccess(ctx);
    return result({
      email: access.email,
      company: access.workspace_name,
      role: access.role,
      plan: access.plan_name,
      can_use_tadqeeq_here: access.allowed,
      ...(access.allowed ? {} : { why_not: accessMessage(access), upgrade_url: `${APP_URL}/subscribe` }),
    });
  },
});
