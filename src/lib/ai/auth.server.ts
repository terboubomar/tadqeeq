import { requireWorkspacePermission } from "../server-auth.server";

export interface AiServerAuth {
  accessToken: string;
  /** Legacy workspace data-owner id used by existing period queries. */
  userId: string;
  actorUserId: string;
  workspaceId: string;
  supabaseUrl: string;
  supabaseKey: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("إعدادات الخادم غير مكتملة لخدمة Tadqeeq AI.");
  }
  return value;
}

export function parseBearerAuthorizationHeader(value: string | undefined | null): string {
  const authorization = value?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    throw new Error("انتهت جلسة المستخدم. سجّل الدخول مرة أخرى قبل استخدام Tadqeeq AI.");
  }
  return token;
}

export function aiSupabaseHeaders(
  auth: AiServerAuth,
  accept = "application/json",
): Record<string, string> {
  return {
    apikey: auth.supabaseKey,
    Authorization: "Bearer " + auth.accessToken,
    Accept: accept,
  };
}

export async function requireAiServerAuth(): Promise<AiServerAuth> {
  const context = await requireWorkspacePermission("ai.use");

  return {
    accessToken: context.accessToken,
    userId: context.userId,
    actorUserId: context.actorUserId,
    workspaceId: context.workspaceId,
    supabaseUrl: requiredEnv("SUPABASE_URL"),
    supabaseKey: requiredEnv("SUPABASE_PUBLISHABLE_KEY"),
  };
}
