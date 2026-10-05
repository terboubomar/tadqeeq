import { Link } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";

import { GuideShell, Section } from "@/components/guides/GuidePages";
import { PlatformIcon } from "@/components/brand/PlatformLogo";
import { ProductIcon } from "@/components/products/ProductIcon";
import { guideBySlug } from "@/lib/guides";
import { PRODUCT_PAGES, PRODUCTS_INDEX, type ProductPage } from "@/lib/product-pages";
import { PRODUCTS } from "@/lib/products";
import { formatArabicDate } from "@/lib/site-content";

export function ProductLandingPage({ page }: { page: ProductPage }) {
  const product = PRODUCTS[page.product];
  const guides = page.relatedGuides.map(guideBySlug);
  const others = PRODUCT_PAGES.filter((other) => other.slug !== page.slug);
  return (
    <GuideShell>
      <nav aria-label="مسار الصفحة" className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          الرئيسية
        </Link>
        <span className="mx-2">/</span>
        <Link to="/products" className="hover:text-foreground">
          المنتجات
        </Link>
      </nav>
      <article className="mt-6">
        <header>
          <p className="flex items-center gap-2.5 text-sm font-semibold text-primary-text">
            <ProductIcon product={page.product} className="size-9" />
            <span>
              {product.name} · {product.descriptor}
            </span>
          </p>
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-[1.45] sm:text-4xl">{page.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            آخر تحديث: <time dateTime={page.updated}>{formatArabicDate(page.updated)}</time>
          </p>
        </header>
        <p className="mt-8 rounded-2xl bg-ink p-6 text-[17px] leading-9 text-ink-foreground">{page.answer}</p>
        {page.availability ? (
          <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-border bg-card p-4 text-[15px] leading-7">
            <Info className="mt-1 size-4 shrink-0 text-primary-text" />
            <span>{page.availability}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            جرّب {product.name} مجاناً
            <ArrowLeft className="size-4" />
          </Link>
          <a href="/#pricing" className="inline-flex h-11 items-center rounded-full border border-border bg-card px-5 text-sm font-semibold hover:border-primary">
            الخطط والأسعار
          </a>
        </div>
        {page.sections.map((section) => (
          <Section key={section.heading} section={section} />
        ))}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-extrabold leading-[1.5]">أسئلة شائعة</h2>
          <div className="mt-4 border-b border-border">
            {page.faqs.map(([question, answer]) => (
              <div key={question} className="border-t border-border py-5">
                <h3 className="text-lg font-bold">{question}</h3>
                <p className="mt-2 text-[15px] leading-8 text-muted-foreground">{answer}</p>
              </div>
            ))}
          </div>
        </section>
      </article>
      <aside className="mt-12 flex flex-col items-start gap-4 rounded-[24px] bg-ink p-7 text-ink-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-xl font-extrabold">ابدأ بملفات شهر واحد.</p>
          <p className="mt-1 text-sm text-ink-muted">ارفع فاتورة المنصة وملف الطلبات مجاناً وشاهد الفروقات لكل فرع.</p>
        </div>
        <Link to="/auth" search={{ mode: "signup" }} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
          ابدأ مجاناً
          <ArrowLeft className="size-4" />
        </Link>
      </aside>
      {guides.length ? (
        <nav aria-label="أدلة مرتبطة" className="mt-12">
          <h2 className="text-sm font-bold text-muted-foreground">أدلة مرتبطة</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {guides.map((guide) => (
              <li key={guide.slug}>
                <a href={guide.path} className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary">
                  <PlatformIcon platform={guide.platform} className="size-8 shrink-0 rounded-full" />
                  <span className="font-semibold leading-7">{guide.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <nav aria-label="منتجات أخرى" className="mt-10">
        <h2 className="text-sm font-bold text-muted-foreground">منتجات أخرى من تدقيق</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {others.map((other) => (
            <li key={other.slug}>
              <a href={other.path} className="flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary">
                <ProductIcon product={other.product} className="size-9" />
                <span>
                  <span className="block font-bold">{PRODUCTS[other.product].name}</span>
                  <span className="block text-sm text-muted-foreground">{PRODUCTS[other.product].descriptor}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </GuideShell>
  );
}

export function ProductsIndexPage() {
  return (
    <GuideShell>
      <h1 className="font-display text-3xl font-extrabold leading-[1.45] sm:text-4xl">{PRODUCTS_INDEX.title}</h1>
      <p className="mt-4 text-[17px] leading-8 text-muted-foreground">
        كل منتج يغطي جزءاً من مراجعة فواتير هنقرستيشن وجاهز وكيتا: من مطابقة الفاتورة مع طلباتك وعقدك، إلى متابعة الفروقات واسترداد التعويضات وقياس عائد الإعلانات.
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
