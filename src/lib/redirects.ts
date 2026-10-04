/** Origin used to resolve paths when there is no browser (server render, tests). */
const BASE = "https://tadqeeq.invalid";

/**
 * A `?next=` value that is safe to send the user to after signing in: a path on this site only.
 * Browsers treat `\` like `/`, so "/\evil.com" would leave the site; resolving the value as a URL and
 * checking the origin catches that and every other trick (protocols, encoded slashes, control characters).
 */
export function safeNextPath(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.length > 2048) return undefined;
  if (raw.includes("\\") || [...raw].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)) return undefined;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return undefined;
  }
  if (url.origin !== BASE) return undefined;
  const path = `${url.pathname}${url.search}${url.hash}`;
  // "/%2F%2Fevil.com" decodes to a protocol-relative path in some routers; refuse leading encoded slashes.
  if (/^\/(?:%2f|%5c)/i.test(path) || path.startsWith("//")) return undefined;
  return path;
}
