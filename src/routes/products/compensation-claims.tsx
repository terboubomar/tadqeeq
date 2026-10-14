import { createFileRoute } from "@tanstack/react-router";

import { ProductFeaturePage } from "@/components/products/ProductFeaturePage";
import { productPage } from "@/lib/product-pages";
import { productPageHead } from "@/lib/product-pages-seo";

const page = productPage("compensation-claims");

export const Route = createFileRoute("/products/compensation-claims")({
  head: () => productPageHead(page),
  component: () => <ProductFeaturePage page={page} />,
});
