import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceDetailPage } from "@/components/marketplace/MarketplacePages";
import { marketplaceItem } from "@/lib/marketplace";
import { marketplaceItemHead } from "@/lib/marketplace-seo";

const item = marketplaceItem("email-reports");

export const Route = createFileRoute("/marketplace/email-reports")({
  head: () => marketplaceItemHead(item),
  component: () => <MarketplaceDetailPage item={item} />,
});
