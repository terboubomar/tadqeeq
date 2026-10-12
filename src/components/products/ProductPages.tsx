import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Flag, Info, MessageCircleQuestion, Plus } from "lucide-react";

import { GuideShell } from "@/components/guides/GuidePages";
import { PlatformIcon } from "@/components/brand/PlatformLogo";
import { NabdWorkflow } from "@/components/products/NabdWorkflow";
import { ProductIcon } from "@/components/products/ProductIcon";
import { guideBySlug, type GuideSection } from "@/lib/guides";
import { PRODUCT_PAGES, PRODUCTS_INDEX, type ProductPage } from "@/lib/product-pages";
import { PRODUCTS } from "@/lib/products";
import { formatArabicDate } from "@/lib/site-content";

/**
 * A product page read as a journey: where the money leaks, how the product works, what it checks, what you get,
 * then the finish (start free). Each data section is one stop on a path down the page; the copy and headings come
 * unchanged from PRODUCT_PAGES, so the SEO text and FAQPage data still match what is on screen.
 */
export function ProductLandingPage({ page }: { page: ProductPage }) {
  const product = PRODUCTS[page.product];
  const guides = page.relatedGuides.map(guideBySlug);
  const others = PRODUCT_PAGES.filter((other) => other.slug !== page.slug);
  return (
    <GuideShell wide>
      <nav aria-label="مسار الصفحة" className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          الرئيسية
        </Link>
        <span className="mx-2">/</span>
        <Link to="/products" className="hover:text-foreground">
          المنتجات
        </Link>
      </nav>

      <article>
        <header className="mx-auto mt-8 flex max-w-3xl flex-col items-center text-center">
          <ProductIcon product={page.product} className="size-16 rounded-2xl" />
          <p className="mt-5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary-text">
            {product.name} · {product.descriptor}
          </p>
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]">{page.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-[17px]">{page.answer}</p>
          {page.availability ? (
            <p className="mt-4 flex items-start gap-2 rounded-full bg-secondary px-4 py-2 text-sm leading-6 text-secondary-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>{page.availability}</span>
            </p>
          ) : null}
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm font-bold text-ink-foreground transition-transform hover:-translate-y-0.5"
            >
              جرّب {product.name} مجاناً
              <ArrowLeft className="size-4" />
            </Link>
            <a href="/#pricing" className="inline-flex h-12 items-center rounded-full border border-border bg-card px-6 text-sm font-semibold hover:border-primary">
              الخطط والأسعار
            </a>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            آخر تحديث: <time dateTime={page.updated}>{formatArabicDate(page.updated)}</time>
          </p>
        </header>

        {page.product === "nabd" ? (
          <div className="mx-auto max-w-4xl">
            <NabdWorkflow />
          </div>
        ) : null}

        <ol className="relative mx-auto mt-16 max-w-4xl">
          {/* The path: a line down the start edge linking every stop to the finish. */}
          <span aria-hidden="true" className="absolute inset-y-6 start-5 w-px bg-gradient-to-b from-primary via-border to-primary sm:start-6" />
          {page.sections.map((section, index) => (
            <JourneyStop key={section.heading} section={section} index={index} />
          ))}
          <li className="relative ps-14 sm:ps-20">
            <span aria-hidden="true" className="absolute start-0 top-6 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground ring-8 ring-background sm:size-12">
              <Flag className="size-5" />
            </span>
            <div className="flex flex-col items-start gap-4 rounded-[24px] bg-ink p-7 text-ink-foreground sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-xl font-extrabold">ابدأ بملفات شهر واحد.</p>
                <p className="mt-1 text-sm text-ink-muted">ارفع فاتورة المنصة وملف الطلبات مجاناً وشاهد الفروقات لكل فرع.</p>
              </div>
              <Link to="/auth" search={{ mode: "signup" }} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
                ابدأ مجاناً
                <ArrowLeft className="size-4" />
              </Link>
            </div>
          </li>
        </ol>

        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="text-center font-display text-2xl font-extrabold leading-[1.5] sm:text-3xl">أسئلة شائعة</h2>
          <div className="mt-8 border-b border-border">
            {page.faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0} className="group border-t border-border">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-[15px] font-semibold sm:text-base">
                  <MessageCircleQuestion strokeWidth={1.75} className="size-[18px] shrink-0 text-primary-text" />
                  <h3 className="flex-1">{question}</h3>
                  <Plus className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
                </summary>
                <p className="pb-5 ps-[30px] text-[15px] leading-8 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </article>

      {guides.length ? (
        <nav aria-label="أدلة مرتبطة" className="mx-auto mt-16 max-w-4xl">
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
      <nav aria-label="منتجات أخرى" className="mx-auto mt-10 max-w-4xl">
        <h2 className="text-sm font-bold text-muted-foreground">منتجات أخرى من تدقيق</h2>
        <ul className="mt-3 grid gap-px overflow-hidden rounded-[20px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {others.map((other) => (
            <li key={other.slug}>
              <a href={other.path} className="flex h-full items-center gap-3 bg-card p-4 transition-colors hover:bg-secondary/40">
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

/** One stop on the journey: a numbered node on the path and the section drawn by what it holds. */
function JourneyStop({ section, index }: { section: GuideSection; index: number }) {
  return (
    <li className="relative pb-14 ps-14 sm:ps-20">
      <span
        aria-hidden="true"
        className="absolute start-0 top-0 grid size-10 place-items-center rounded-full border border-border bg-card text-sm font-semibold text-primary-text ring-8 ring-background sm:size-12"
      >
        <span className="num">{index + 1}</span>
      </span>
      <section>
        <h2 className="pt-1.5 font-display text-2xl font-extrabold leading-[1.5] sm:pt-2.5 sm:text-[1.75rem]">{section.heading}</h2>
        {section.paragraphs?.map((paragraph) => (
          <p key={paragraph} className="mt-4 max-w-3xl text-[16px] leading-8 text-foreground/85">
            {paragraph}
          </p>
        ))}
        {section.steps ? (
          <ol className="mt-6 grid gap-3 sm:grid-cols-2">
            {section.steps.map((step, stepIndex) => (
              <li key={step} className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-5 sm:[&:last-child:nth-child(odd)]:col-span-2">
                <span className="flex items-center gap-2">
                  <span className="num grid size-8 place-items-center rounded-lg bg-ink text-sm font-semibold text-ink-foreground">{stepIndex + 1}</span>
                  {stepIndex < section.steps!.length - 1 ? <span aria-hidden="true" className="h-px flex-1 bg-border" /> : null}
                </span>
                <span className="text-[15px] leading-7 text-foreground/85">{step}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {section.bullets ? (
          <ul className="mt-6 grid gap-px overflow-hidden rounded-[20px] border border-border bg-border sm:grid-cols-2">
            {section.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3 bg-card p-5 text-[15px] leading-7">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-primary-text">
                  <Check className="size-3.5" />
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {section.table ? (
          <div className="mt-6 overflow-x-auto rounded-[20px] border border-border bg-card">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-muted text-start">
                <tr>
                  {section.table.head.map((cell) => (
                    <th key={cell} scope="col" className="px-4 py-3 text-start font-bold">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.table.rows.map((row) => (
                  <tr key={row.join("|")} className="border-t border-border align-top">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-3 leading-7" dir={/^[A-Za-z]/.test(cell) ? "ltr" : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {section.quote ? (
          <blockquote className="mt-6 whitespace-pre-line rounded-[20px] border-s-4 border-primary bg-card p-5 text-[15px] leading-8">{section.quote}</blockquote>
        ) : null}
      </section>
    </li>
  );
}

export function ProductsIndexPage() {
  return (
    <GuideShell>
      <h1 className="font-display text-3xl font-extrabold leading-[1.45] sm:text-4xl">{PRODUCTS_INDEX.title}</h1>
      <p className="mt-4 text-[17px] leading-8 text-muted-foreground">
        كل منتج يغطي جزءاً من مراجعة فواتير هنقرستيشن وجاهز وكيتا: من مطابقة الفاتورة مع طلباتك وعقدك، إلى متابعة الفروقات واسترداد التعويضات وقياس عائد الإعلانات ومتابعة تكلفة كل منصة يوماً بيوم.
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
