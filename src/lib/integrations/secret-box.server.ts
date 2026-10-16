import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Encrypts third-party API keys before they are stored (AES-256-GCM). The key comes from the
 * INTEGRATIONS_ENCRYPTION_KEY server secret, hashed to 32 bytes so any long random string works. Stored as
 * "v1.<iv>.<tag>.<ciphertext>" in base64url. Without the secret nothing can be connected or read.
 */
const VERSION = "v1";

function encryptionKey(secret = process.env["INTEGRATIONS_ENCRYPTION_KEY"]): Buffer {
  const value = secret?.trim();
  if (!value || value.length < 32) {
    throw new Error("الربط المباشر غير مفعّل بعد: أضف INTEGRATIONS_ENCRYPTION_KEY إلى أسرار الخادم.");
  }
  return createHash("sha256").update(value).digest();
}

export function sealSecret(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openSecret(sealed: string, secret?: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("مفتاح الربط المحفوظ غير صالح؛ اربط النظام من جديد.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/**
 * A short-lived signed value (HMAC-SHA256 with the same server secret), used as the OAuth "state" so the code Zoho
 * sends back can only finish a connection that this workspace and person started.
 */
export function signState(payload: Record<string, string | number>, secret?: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", encryptionKey(secret)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(state: string, secret?: string): Record<string, string | number> | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", encryptionKey(secret)).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, string | number>;
  } catch {
    return null;
  }
}
