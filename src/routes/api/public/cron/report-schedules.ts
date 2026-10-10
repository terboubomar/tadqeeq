import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled job for report emails. A Lovable cron calls it (hourly is enough) with the cron secret; it sends every
 * report schedule that is due (monthly, weekly, or a new period uploaded since the last send).
 */
export const Route = createFileRoute("/api/public/cron/report-schedules")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { runDueReportSchedules } = await import("@/lib/report-schedules.server");
        try {
          const result = await runDueReportSchedules();
          return Response.json(result);
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 });
        }
      },
    },
  },
});
