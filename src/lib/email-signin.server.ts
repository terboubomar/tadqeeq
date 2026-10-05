import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

import { emailCodeRequired, hasVerifiedFactor, tokenClaims } from "./mfa";

/** Email sign-in code (second step after the password). Codes live 10 minutes, 5 tries, 1 email per minute. */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS = 6;

interface CodeRow {
  session_id: string;
  user_id: string;
  code_hash: string | null;
  expires_at: string | null;
  attempts: number;
  sends: number;
  last_sent_at: string | null;
  verified_at: string | null;
}

// The table is server-only (no user policies) and not in the generated types.
type LooseDb = {
  from: (table: string) => {
    select: (cols: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: CodeRow | null; error: { message: string } | null }> } };
    upsert: (row: Partial<CodeRow>) => Promise<{ error: { message: string } | null }>;
    update: (row: Partial<CodeRow>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
  };
};
const db = () => supabaseAdmin as unknown as LooseDb;

async function hashCode(sessionId: string, code: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${sessionId}:${code}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return value.toString().padStart(6, "0");
}

export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

interface Caller {
  userId: string;
  email: string;
  sessionId: string;
  required: boolean;
}

async function caller(accessToken: string): Promise<Caller> {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى.");
  const claims = tokenClaims(accessToken);
  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    sessionId: claims.sessionId ?? "",
    required: emailCodeRequired(claims, hasVerifiedFactor(data.user.factors)),
  };
}

async function loadRow(sessionId: string): Promise<CodeRow | null> {
  if (!sessionId) return null;
  const { data, error } = await db().from("email_signin_codes").select("*").eq("session_id", sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Used on every server call: has this password session entered its email code? */
export async function isEmailCodeVerified(userId: string, sessionId: string | undefined): Promise<boolean> {
  const row = await loadRow(sessionId ?? "");
  return Boolean(row && row.user_id === userId && row.verified_at);
}

export async function emailCodeStatus(accessToken: string) {
  const me = await caller(accessToken);
  if (!me.required) return { needed: false, email: "" };
  const verified = await isEmailCodeVerified(me.userId, me.sessionId);
  return { needed: !verified, email: maskEmail(me.email) };
}

/** Sends a code unless one was sent less than a minute ago (then the existing one stays valid). */
export async function sendEmailCode(accessToken: string, force: boolean) {
  const me = await caller(accessToken);
  if (!me.required || !me.sessionId || !me.email) return { sent: false, waitSeconds: 0 };
  const row = await loadRow(me.sessionId);
  if (row?.verified_at) return { sent: false, waitSeconds: 0 };
  const now = Date.now();
  const lastSent = row?.last_sent_at ? Date.parse(row.last_sent_at) : 0;
  const stillValid = row?.code_hash && row.expires_at && Date.parse(row.expires_at) > now;
  if (now - lastSent < RESEND_AFTER_MS) {
    return { sent: false, waitSeconds: Math.ceil((RESEND_AFTER_MS - (now - lastSent)) / 1000) };
  }
  if (stillValid && !force) return { sent: false, waitSeconds: 0 };
  const sends = (row?.sends ?? 0) + 1;
  if (sends > MAX_SENDS) throw new Error("أُرسل عدد كبير من الرموز. سجّل الخروج ثم ادخل من جديد.");

  const code = newCode();
  const { error } = await db().from("email_signin_codes").upsert({
    session_id: me.sessionId,
    user_id: me.userId,
    code_hash: await hashCode(me.sessionId, code),
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
    attempts: 0,
    sends,
    last_sent_at: new Date(now).toISOString(),
  });
  if (error) throw new Error(error.message);

  const result = await sendTemplateEmail("signin-code", me.email, {
    templateData: { code },
    idempotencyKey: `signin-code-${me.sessionId}-${sends}`,
  });
  if (!result.sent) {
    throw new Error("لا يمكن إرسال الرسائل إلى هذا البريد حالياً. تواصل مع فريق تدقيق.");
  }
  return { sent: true, waitSeconds: Math.ceil(RESEND_AFTER_MS / 1000) };
}

export async function verifyEmailCode(accessToken: string, code: string) {
  const me = await caller(accessToken);
  if (!me.required) return { ok: true };
  const row = await loadRow(me.sessionId);
  if (row?.verified_at) return { ok: true };
  if (!row || row.user_id !== me.userId || !row.code_hash || !row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
    throw new Error("انتهت صلاحية الرمز. اطلب رمزاً جديداً.");
  }
  if (row.attempts >= MAX_ATTEMPTS) throw new Error("محاولات كثيرة خاطئة. اطلب رمزاً جديداً.");
  if ((await hashCode(me.sessionId, code.trim())) !== row.code_hash) {
    await db().from("email_signin_codes").update({ attempts: row.attempts + 1 }).eq("session_id", me.sessionId);
    throw new Error("الرمز غير صحيح.");
  }
  const { error } = await db()
    .from("email_signin_codes")
    .update({ verified_at: new Date().toISOString(), code_hash: null })
    .eq("session_id", me.sessionId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
