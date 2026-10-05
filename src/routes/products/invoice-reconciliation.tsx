import { createFileRoute } from "@tanstack/react-router";

import { ProductLandingPage } from "@/components/products/ProductPages";
import { productPage } from "@/lib/product-pages";
import { productPageHead } from "@/lib/product-pages-seo";

const page = productPage("invoice-reconciliation");

export const Route = createFileRoute("/products/invoice-reconciliation")({
  head: () => productPageHead(page),
  component: () => <ProductLandingPage page={page} />,
});
