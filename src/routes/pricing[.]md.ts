import { createFileRoute } from "@tanstack/react-router";

import { loadPublicPlans } from "@/lib/plans.functions";
import { buildPricingMd } from "@/lib/seo-files";

export const Route = createFileRoute("/pricing.md")({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildPricingMd(await loadPublicPlans().catch(() => [])), {
          headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        }),
    },
  },
});
