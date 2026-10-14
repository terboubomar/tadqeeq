import { createFileRoute } from "@tanstack/react-router";

import { ProductFeaturePage } from "@/components/products/ProductFeaturePage";
import { productPage } from "@/lib/product-pages";
import { productPageHead } from "@/lib/product-pages-seo";

const page = productPage("smart-alerts");

export const Route = createFileRoute("/products/smart-alerts")({
  head: () => productPageHead(page),
  component: () => <ProductFeaturePage page={page} />,
});
