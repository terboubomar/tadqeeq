import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { tokenClaims } from "./mfa";
import { requireServerUserAnyStatus } from "./server-auth.server";

// Generated types lag migration 0067 at this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/**
 * Records that the signed-in user approved an AI-assistant link, before the browser asks Supabase to approve
 * it. requireServerUserAnyStatus has already checked the authenticator code and the emailed code for this
 * session; an assistant token cannot approve another assistant.
 */
export async function recordAssistantLinkApproval(authorizationId: string): Promise<{ recorded: true }> {
  const auth = await requireServerUserAnyStatus();
  const claims = tokenClaims(auth.accessToken);
  if (claims.clientId) throw new Error("لا يمكن ربط مساعد ذكي من جلسة مساعد آخر.");
  const { error } = await db().rpc("record_assistant_link_approval", {
    p_authorization_id: authorizationId,
    p_user_id: auth.actorUserId,
    p_session_id: claims.sessionId ?? null,
  });
  if (error) throw new Error("انتهت صلاحية طلب الربط. ابدأ الربط من جديد من مساعدك الذكي.");
  return { recorded: true };
}
