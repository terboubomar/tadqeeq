import { getRequestHeader } from "@tanstack/react-start/server";

export interface AiServerAuth {
  accessToken: string;
  userId: string;
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

function bearerTokenFromRequest(): string {
  return parseBearerAuthorizationHeader(getRequestHeader("authorization"));
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
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  const accessToken = bearerTokenFromRequest();

  const response = await fetch(supabaseUrl + "/auth/v1/user", {
    headers: {
      apikey: supabaseKey,
      Authorization: "Bearer " + accessToken,
    },
  });

  if (!response.ok) {
    throw new Error("انتهت جلسة المستخدم. سجّل الدخول مرة أخرى قبل استخدام Tadqeeq AI.");
  }

  const user = (await response.json()) as { id?: string };
  if (!user.id) {
    throw new Error("تعذّر التحقق من هوية المستخدم.");
  }

  return {
    accessToken,
    userId: user.id,
    supabaseUrl,
    supabaseKey,
  };
}
