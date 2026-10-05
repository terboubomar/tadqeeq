import { createFileRoute } from "@tanstack/react-router";

import { ProductLandingPage } from "@/components/products/ProductPages";
import { productPage } from "@/lib/product-pages";
import { productPageHead } from "@/lib/product-pages-seo";

const page = productPage("promotions-roi");

export const Route = createFileRoute("/products/promotions-roi")({
  head: () => productPageHead(page),
  component: () => <ProductLandingPage page={page} />,
});
