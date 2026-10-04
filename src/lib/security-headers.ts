/**
 * Browser security headers added to every response (src/server.ts). See docs/SECURITY_BUILD_SPEC.md (M1).
 *
 * The content policy runs in report-only mode first: browsers report what it would block to
 * /api/public/csp-report and nothing breaks. Framing is blocked for real on the site's own domains, and left
 * open on Lovable's preview hosts so the Lovable editor can still show the app.
 */

export const CSP_REPORT_PATH = "/api/public/csp-report";

/** Hosts where the Lovable editor (or local development) frames the app. */
export function isPreviewHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0] ?? "";
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com");
}

const PREVIEW_FRAME_ANCESTORS = "'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com";

/** The content policy; every outside origin the app really uses, nothing else. */
export function contentSecurityPolicy(preview: boolean): string {
  return [
    "default-src 'self'",
    // TanStack Start inlines its hydration data and router state as scripts.
    "script-src 'self' 'unsafe-inline'",
    // Inline styles: the chart component writes CSS variables, and React style props.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.supabase.co",
    "media-src 'self' blob: https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://oauth.lovable.app",
    // Lovable's Google/Apple sign-in opens oauth.lovable.app in a popup or frame.
    "frame-src https://oauth.lovable.app",
    // pdf.js reads invoices in a web worker.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${preview ? PREVIEW_FRAME_ANCESTORS : "'none'"}`,
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}

/** Headers for a response to `url`. Existing headers on the response are never overwritten. */
export function securityHeaders(url: URL): Record<string, string> {
  const preview = isPreviewHost(url.host);
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Content-Security-Policy-Report-Only": contentSecurityPolicy(preview),
  };
  if (!preview) {
    // Enforced now (frame-ancestors is ignored in report-only mode): no site may frame the app or ops.
    headers["Content-Security-Policy"] = "frame-ancestors 'none'";
    headers["X-Frame-Options"] = "DENY";
    if (url.protocol === "https:") headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

/** The response with the security headers added (copied, because some responses have immutable headers). */
export function withSecurityHeaders(request: Request, response: Response): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders(new URL(request.url)))) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
