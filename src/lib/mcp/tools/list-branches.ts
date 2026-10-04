import { defineTool } from "@lovable.dev/mcp-js";
import { requireMcpAccess } from "../access";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_branches",
  title: "List branches",
  description: "List the workspace's branches with their HungerStation, Keeta and Jahez ids.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    await requireMcpAccess(ctx);
    const { data, error } = await supabaseForUser(ctx)
      .from("branch_registry")
      .select("id,name,active,hungerstation_id,keeta_id,jahez_id")
      .order("name");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const branches = (data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      active: b.active,
      hungerstation_id: b.hungerstation_id,
      keeta_id: b.keeta_id,
      jahez_id: b.jahez_id,
    }));
    return { content: [{ type: "text", text: JSON.stringify(branches) }], structuredContent: { branches } };
  },
});
