import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/compensation/evidence/$evidenceId/media")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleEvidenceMediaRequest } = await import("@/lib/telegram-evidence-media.server");
        return handleEvidenceMediaRequest(request, params.evidenceId);
      },
    },
  },
});
