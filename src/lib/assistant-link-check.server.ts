import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Generated types lag migration 0067 at this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/**
 * An AI-assistant token (Claude / ChatGPT, `client_id` claim) is accepted only if this user approved that
 * assistant from a session that finished both sign-in codes (migration 0067, private.assistant_link_approved).
 */
export async function isAssistantLinkApproved(userId: string, clientId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("assistant_link_approvals")
    .select("user_id")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error("تعذّر التحقق من ربط المساعد الذكي.");
  return Boolean(data);
}
