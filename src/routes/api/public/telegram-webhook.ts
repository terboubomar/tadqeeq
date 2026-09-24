import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleTelegramWebhook } = await import(
          "@/lib/telegram-webhook.server"
        );
        return handleTelegramWebhook(request);
      },
    },
  },
});
