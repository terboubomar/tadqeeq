import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceIndexPage } from "@/components/marketplace/MarketplacePages";
import { marketplaceIndexHead } from "@/lib/marketplace-seo";

export const Route = createFileRoute("/marketplace/")({
  head: marketplaceIndexHead,
  component: MarketplaceIndexPage,
});
