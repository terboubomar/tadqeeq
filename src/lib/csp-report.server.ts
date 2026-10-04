import { logEvent } from "./observability";

const MAX_BODY = 8 * 1024;

/** Only the origin of a blocked URL is kept, never its path or query (they can carry tokens). */
function originOf(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (!value.includes(":")) return value.slice(0, 40); // "inline", "eval", "self"
  try {
    return new URL(value).origin;
  } catch {
    return value.split(":")[0]?.slice(0, 20) ?? null;
  }
}

/** Accepts a CSP violation report (old report-uri or Reporting API format) and logs a short summary. */
export async function logCspReport(request: Request): Promise<Response> {
  const text = (await request.text()).slice(0, MAX_BODY);
  try {
    const parsed = JSON.parse(text) as unknown;
    const reports = Array.isArray(parsed) ? parsed.map((r) => (r as { body?: unknown }).body) : [(parsed as { "csp-report"?: unknown })["csp-report"]];
    for (const report of reports.slice(0, 5)) {
      if (!report || typeof report !== "object") continue;
      const r = report as Record<string, unknown>;
      logEvent(
        "csp_violation",
        {
          directive: String(r["violated-directive"] ?? r["effectiveDirective"] ?? r["effective-directive"] ?? "").slice(0, 60),
          blocked: originOf(r["blocked-uri"] ?? r["blockedURL"]),
          page: originOf(r["document-uri"] ?? r["documentURL"]),
        },
        "warn",
      );
    }
  } catch {
    // Not JSON: nothing to log.
  }
  return new Response(null, { status: 204 });
}
