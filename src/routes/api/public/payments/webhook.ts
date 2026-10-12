import { createFileRoute } from "@tanstack/react-router";

/** Card payment events. Public by design: every request is checked against the provider's signature. */
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = new URL(request.url).searchParams.get("env") === "live" ? "live" : "sandbox";
        try {
          const { verifyWebhook, EventName } = await import("@/lib/paddle.server");
          const { syncProviderSubscription } = await import("@/lib/card-payments.server");
          const event = await verifyWebhook(request, env);
          switch (event.eventType) {
            case EventName.SubscriptionCreated:
            case EventName.SubscriptionUpdated:
            case EventName.SubscriptionCanceled:
              await syncProviderSubscription(event.data as never, env);
              break;
            default:
              break;
          }
          return Response.json({ received: true });
        } catch (error) {
          console.error("payments webhook error", error);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
