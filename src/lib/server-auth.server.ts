import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";

import type { Database } from "@/integrations/supabase/types";

export type ServerUserClient = ReturnType<typeof createServerUserClient>;

export interface ServerUserAuth {
  accessToken: string;
  userId: string;
  client: ServerUserClient;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("إعدادات الخادم غير مكتملة.");
  }
  return value;
}

export function parseAuthorizationBearer(
  value: string | undefined | null,
): string {
  const match = (value?.trim() ?? "").match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى.");
  }
  return token;
}

export function createServerUserClient(accessToken: string) {
  return createClient<Database>(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_PUBLISHABLE_KEY"),
    {
      global: {
        headers: {
          Authorization: "Bearer " + accessToken,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export async function requireServerUser(): Promise<ServerUserAuth> {
  const accessToken = parseAuthorizationBearer(
    getRequestHeader("authorization"),
  );
  const client = createServerUserClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user?.id) {
    throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى.");
  }

  return {
    accessToken,
    userId: data.user.id,
    client,
  };
}
