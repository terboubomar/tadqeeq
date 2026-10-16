import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

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
