import { GuideShell } from "@/components/guides/GuidePages";
import { ProductIcon } from "@/components/products/ProductIcon";
import { PRODUCT_PAGES, PRODUCTS_INDEX } from "@/lib/product-pages";
import { PRODUCTS } from "@/lib/products";

export function ProductsIndexPage() {
  return (
    <GuideShell>
      <h1 className="font-display text-3xl font-extrabold leading-[1.45] sm:text-4xl">{PRODUCTS_INDEX.title}</h1>
      <p className="mt-4 text-[17px] leading-8 text-muted-foreground">
        كل منتج يغطي جزءاً من مراجعة فواتير هنقرستيشن وجاهز وكيتا: من مطابقة الفاتورة مع طلباتك، إلى متابعة الفروقات واسترداد التعويضات وقياس عائد الإعلانات ومتابعة تكلفة كل منصة يوماً بيوم.
      </p>
      <ul className="mt-10 grid gap-4">
        {PRODUCT_PAGES.map((page) => (
          <li key={page.slug}>
            <a href={page.path} className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary">
              <ProductIcon product={page.product} />
              <div>
                <h2 className="font-display text-lg font-bold leading-8">
                  {PRODUCTS[page.product].name} · {PRODUCTS[page.product].descriptor}
                </h2>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">{page.description}</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </GuideShell>
  );
}
