import { createFileRoute } from "@tanstack/react-router";

import { loadPublicPlans } from "@/lib/plans.functions";
import { buildLlmsFullTxt } from "@/lib/seo-files";

export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildLlmsFullTxt(await loadPublicPlans().catch(() => [])), {
          headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        }),
    },
  },
});
