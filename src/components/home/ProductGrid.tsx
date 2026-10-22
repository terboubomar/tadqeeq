import { Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid } from "lucide-react";

import { ProductIcon } from "@/components/products/ProductIcon";
import { PRODUCT_PAGES } from "@/lib/product-pages";
import { PRODUCTS } from "@/lib/products";

/** Every product as a tile under the hero, each opening its product page; the last tile opens the products index. */
export function ProductGrid() {
  return (
    <nav aria-label="منتجات تدقيق" className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:pb-16">
      <ul className="lp-stagger grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
        {PRODUCT_PAGES.map((page) => {
          const product = PRODUCTS[page.product];
          return (
            <li key={page.path}>
              <Link
                to={page.path}
                className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/25 active:translate-y-0 sm:flex-col sm:items-start sm:p-3.5"
              >
                <ProductIcon product={page.product} className="size-9 rounded-xl transition-colors sm:size-11 sm:rounded-[14px] group-hover:bg-primary group-hover:text-primary-foreground" />
                <span>
                  <span className="block text-[15px] font-bold leading-6">{product.name}</span>
                  <span className="block text-[12px] leading-5 text-muted-foreground sm:text-[12.5px]">{product.descriptor}</span>
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            to="/products"
            className="group flex h-full items-center gap-3 rounded-2xl border border-dashed border-border p-3 transition-colors hover:border-foreground/30 sm:flex-col sm:items-start sm:p-3.5"
          >
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink sm:size-11 sm:rounded-[14px] text-ink-foreground">
              <LayoutGrid className="size-[18px]" />
            </span>
            <span className="flex items-center gap-1.5 text-[15px] font-bold leading-6">
              كل المنتجات
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            </span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
