import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";

import type { StoredPeriod } from "@/lib/periods";

import { supabaseForUser } from "./supabase";

/** One period as the signed-in user can read it (row-level security keeps it to their workspace). */
export async function loadPeriod(ctx: ToolContext, periodId: string): Promise<StoredPeriod> {
  const { data, error } = await supabaseForUser(ctx).from("periods").select("*").eq("id", periodId).maybeSingle();
  if (error) throw new ToolError(error.message);
  if (!data) throw new ToolError("الفترة غير موجودة. استخدم list_periods لمعرفة الفترات. / Period not found; call list_periods.");
  return data as unknown as StoredPeriod;
}
