import { createFileRoute } from "@tanstack/react-router";

import { ProductsIndexPage } from "@/components/products/ProductPages";
import { productsIndexHead } from "@/lib/product-pages-seo";

export const Route = createFileRoute("/products/")({
  head: productsIndexHead,
  component: ProductsIndexPage,
});
