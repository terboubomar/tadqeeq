import { getRequestHeader } from "@tanstack/react-start/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { CONTACT_LIMIT_PER_EMAIL_HOUR, CONTACT_LIMIT_PER_IP_HOUR, validateContact, type ContactInput } from "./contact";
import { logEvent } from "./observability";

// contact_messages is not in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(): string | null {
  const forwarded = getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0];
  return forwarded?.trim() || null;
}

/** Saves a message from the public contact page for the ops team (/ops/messages). */
export async function submitContactMessageOnServer(input: ContactInput & { website?: string }): Promise<{ ok: true }> {
  // Hidden field that people never see; bots that fill it are told "sent" and nothing is saved.
  if (input.website?.trim()) return { ok: true };
  const checked = validateContact(input);
  if (!checked.ok) throw new Error(checked.error);
  const message = checked.value;

  const ip = clientIp();
  const ipHash = ip ? await sha256(`tadqeeq-contact:${ip}`) : null;
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const [byIp, byEmail] = await Promise.all([
    ipHash
      ? db().from("contact_messages").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since)
      : Promise.resolve({ count: 0 }),
    db().from("contact_messages").select("id", { count: "exact", head: true }).eq("email", message.email).gte("created_at", since),
  ]);
  if ((byIp.count ?? 0) >= CONTACT_LIMIT_PER_IP_HOUR || (byEmail.count ?? 0) >= CONTACT_LIMIT_PER_EMAIL_HOUR) {
    throw new Error("وصلتنا رسائلك — سنرد عليك قريباً. يمكنك أيضاً مراسلتنا مباشرة على hello@tadqeeq.app.");
  }

  const { error } = await db().from("contact_messages").insert({ ...message, ip_hash: ipHash });
  if (error) {
    logEvent("contact_message_failed", { error }, "error");
    throw new Error("تعذّر إرسال الرسالة. حاول مرة أخرى أو راسلنا على hello@tadqeeq.app.");
  }
  logEvent("contact_message_received", { topic: message.topic });
  return { ok: true };
}
