import { describe, expect, test } from "bun:test";

import { logCspReport } from "./csp-report.server";
import { contentSecurityPolicy, isPreviewHost, securityHeaders, withSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  test("the live site cannot be framed and is HTTPS-only", () => {
    for (const url of ["https://tadqeeq.app/", "https://ops.tadqeeq.app/ops"]) {
      const h = securityHeaders(new URL(url));
      expect(h["X-Frame-Options"]).toBe("DENY");
      expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
      expect(h["Strict-Transport-Security"]).toContain("max-age=31536000");
      expect(h["X-Content-Type-Options"]).toBe("nosniff");
      expect(h["Content-Security-Policy-Report-Only"]).toContain("frame-ancestors 'none'");
    }
  });

  test("Lovable previews and local development stay frameable", () => {
    expect(isPreviewHost("id-preview--abc.lovable.app")).toBe(true);
    expect(isPreviewHost("abc.lovableproject.com")).toBe(true);
    expect(isPreviewHost("localhost:5175")).toBe(true);
    expect(isPreviewHost("tadqeeq.app")).toBe(false);
    expect(isPreviewHost("lovable.app.evil.com")).toBe(false);
    const h = securityHeaders(new URL("https://x.lovable.app/"));
    expect(h["X-Frame-Options"]).toBeUndefined();
    expect(h["Content-Security-Policy-Report-Only"]).toContain("https://lovable.dev");
  });

  test("the policy allows what the app uses and nothing broad", () => {
    const csp = contentSecurityPolicy(false);
    for (const part of ["https://*.supabase.co", "https://fonts.gstatic.com", "https://oauth.lovable.app", "object-src 'none'", "report-uri /api/public/csp-report"]) {
      expect(csp).toContain(part);
    }
    expect(csp).not.toContain(" * ");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test("headers already on a response are kept", async () => {
    const response = withSecurityHeaders(
      new Request("https://tadqeeq.app/api/compensation/evidence/x/media"),
      new Response("ok", { status: 200, headers: { "X-Frame-Options": "SAMEORIGIN", "content-type": "video/mp4" } }),
    );
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(await response.text()).toBe("ok");
  });

  test("violation reports are accepted in both formats and answered with 204", async () => {
    const old = new Request("https://tadqeeq.app/api/public/csp-report", {
      method: "POST",
      body: JSON.stringify({ "csp-report": { "violated-directive": "script-src", "blocked-uri": "https://evil.com/x.js?token=secret", "document-uri": "https://tadqeeq.app/dashboard" } }),
    });
    expect((await logCspReport(old)).status).toBe(204);
    const modern = new Request("https://tadqeeq.app/api/public/csp-report", {
      method: "POST",
      body: JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://x.com/a.png" } }]),
    });
    expect((await logCspReport(modern)).status).toBe(204);
    expect((await logCspReport(new Request("https://tadqeeq.app/x", { method: "POST", body: "not json" }))).status).toBe(204);
  });
});
