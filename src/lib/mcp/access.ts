import { ToolError, type JsonValueInput, type ToolContext } from "@lovable.dev/mcp-js";

import { SITE_URL } from "@/lib/seo";

import { supabaseForUser } from "./supabase";

/** Where links in tool results point (the upload page, the subscription page). */
export const APP_URL = SITE_URL;

export interface McpAccess {
  email: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  role: string | null;
  onboarding_status: string;
  plan_code: string | null;
  plan_name: string | null;
  allowed: boolean;
  reason: "no_workspace" | "trial" | "plan" | "suspended" | null;
}

/** Why the MCP is closed, in words the assistant can pass on (Arabic first, English after). */
export function accessMessage(access: McpAccess): string {
  switch (access.reason) {
    case "no_workspace":
      return "لا توجد مساحة تدقيق مرتبطة بهذا الحساب. سجّل في تدقيق أولاً. / No Tadqeeq workspace is linked to this account.";
    case "suspended":
      return "حساب تدقيق موقوف حالياً. تواصل مع فريق تدقيق لإعادة التفعيل. / This Tadqeeq account is suspended.";
    case "trial":
    case "plan":
      return `استخدام تدقيق من Claude و ChatGPT متاح في باقة «الشاملة»، أو مع إضافة «استرداد» و Tadqeeq AI في أي باقة${access.plan_name ? ` (باقتك الحالية: ${access.plan_name})` : " (حسابك في التجربة المجانية)"}. اطلبها من ${APP_URL}/subscribe / Available on the الشاملة plan or with the add-on on any plan.`;
    default:
      return "";
  }
}

export async function loadMcpAccess(ctx: ToolContext): Promise<McpAccess> {
  const { data, error } = await supabaseForUser(ctx).rpc("mcp_access" as never);
  if (error) throw new ToolError(`تعذّر التحقق من الحساب: ${error.message}`);
  if (!data) throw new ToolError("Sign-in required.");
  return data as unknown as McpAccess;
}

/** Every data tool starts here: the caller's workspace must have Tadqeeq AI (الشاملة or the add-on) and not be suspended. */
export async function requireMcpAccess(ctx: ToolContext): Promise<McpAccess> {
  const access = await loadMcpAccess(ctx);
  if (!access.allowed) throw new ToolError(accessMessage(access));
  return access;
}

/** Tool result carrying both readable JSON text and structured content. */
export function result(data: Record<string, unknown>) {
  const text = JSON.stringify(data);
  return { content: [{ type: "text" as const, text }], structuredContent: JSON.parse(text) as JsonValueInput };
}
