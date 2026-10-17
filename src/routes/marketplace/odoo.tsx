import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceDetailPage } from "@/components/marketplace/MarketplacePages";
import { marketplaceItem } from "@/lib/marketplace";
import { marketplaceItemHead } from "@/lib/marketplace-seo";

const item = marketplaceItem("odoo");

export const Route = createFileRoute("/marketplace/odoo")({
  head: () => marketplaceItemHead(item),
  component: () => <MarketplaceDetailPage item={item} />,
});
