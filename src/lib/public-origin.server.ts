import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * The one place that decides Tadqeeq's public origin (used for the Telegram webhook URL and
 * invite links). Production must set TADQEEQ_PUBLIC_URL; there is no hard-coded fallback.
 */
export class PublicOriginConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicOriginConfigError";
  }
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Pure resolution rule:
 * - TADQEEQ_PUBLIC_URL, when set, must be HTTPS (localhost allowed outside production);
 * - outside production, the request origin is accepted when it is HTTPS or localhost;
 * - in production the request origin is used only when the caller allows it (invite links);
 * - otherwise there is no origin (null), never a guessed one.
 */
export function resolvePublicOrigin(input: {
  configured?: string | null;
  requestOrigin?: string | null;
  production: boolean;
  allowRequestOriginInProduction?: boolean;
}): string | null {
  const configured = input.configured?.trim();
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new PublicOriginConfigError("TADQEEQ_PUBLIC_URL ليس رابطاً صالحاً.");
    }
    const localDev = !input.production && isLocalhost(url.hostname);
    if (url.protocol !== "https:" && !localDev) {
      throw new PublicOriginConfigError("TADQEEQ_PUBLIC_URL يجب أن يبدأ بـ https://");
    }
    return url.origin;
  }

  if (input.production && !input.allowRequestOriginInProduction) return null;

  const requestOrigin = input.requestOrigin?.trim();
  if (!requestOrigin) return null;
  try {
    const url = new URL(requestOrigin);
    if (url.protocol === "https:" || (!input.production && isLocalhost(url.hostname))) return url.origin;
  } catch {
    // An unparseable Origin header is ignored.
  }
  return null;
}

function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/** Public origin for this deployment, or null when it is not configured. */
export function getPublicOrigin(options: { allowRequestOriginInProduction?: boolean } = {}): string | null {
  return resolvePublicOrigin({
    configured: process.env["TADQEEQ_PUBLIC_URL"],
    requestOrigin: getRequestHeader("origin"),
    production: isProduction(),
    allowRequestOriginInProduction: options.allowRequestOriginInProduction,
  });
}

/** Like getPublicOrigin, but a missing origin is a configuration error. */
export function requirePublicOrigin(): string {
  const origin = getPublicOrigin();
  if (!origin) {
    throw new PublicOriginConfigError("رابط Tadqeeq العام غير مضبوط. أضف TADQEEQ_PUBLIC_URL (مثل https://tadqeeq.app) إلى إعدادات الخادم.");
  }
  return origin;
}
