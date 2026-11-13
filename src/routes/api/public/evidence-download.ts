import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/public/evidence-download?t=<signed token> — streams one evidence file from Telegram for a link the
 * MCP issued (valid ten minutes). No session is needed: the signed token is the permission.
 */
export const Route = createFileRoute("/api/public/evidence-download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleEvidenceDownloadLink } = await import("@/lib/evidence-download.server");
        return handleEvidenceDownloadLink(request);
      },
    },
  },
});
