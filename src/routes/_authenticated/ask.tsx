import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ask")({
  head: () => ({
    meta: [
      { title: "اسأل تدقيق · تدقيق" },
      {
        name: "description",
        content: "يفتح اسأل تدقيق كنافذة محادثة عائمة داخل التطبيق.",
      },
      { property: "og:title", content: "اسأل تدقيق · تدقيق" },
    ],
  }),
  component: LegacyAskRedirect,
});

function LegacyAskRedirect() {
  return <Navigate to="/dashboard" replace />;
}
