import { createFileRoute } from "@tanstack/react-router";

/** Browsers post what the report-only content policy would have blocked; we log the directive and origin only. */
export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { logCspReport } = await import("@/lib/csp-report.server");
        return logCspReport(request);
      },
    },
  },
});
