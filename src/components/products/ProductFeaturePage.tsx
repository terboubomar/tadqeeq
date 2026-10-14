import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, Info } from "lucide-react";
import type { ComponentType } from "react";

import { GuideShell, Section } from "@/components/guides/GuidePages";
import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { ProductIcon } from "@/components/products/ProductIcon";
import { guideBySlug, type GuideSection } from "@/lib/guides";
import { PRODUCT_PAGES, type ProductPage } from "@/lib/product-pages";
import { PRODUCTS, type ProductKey } from "@/lib/products";
import { formatArabicDate } from "@/lib/site-content";
import { cn } from "@/lib/utils";

/**
 * A product page laid out as a feature page: split hero with a product panel, the "why" as an editorial split, the
 * steps as a vertical timeline, checks as a ruled grid, and the FAQs as an accordion. Same content as
 * ProductLandingPage (title, answer, sections, FAQs, links), wider layout.
 *
 * Colours: the «Classic blue and dark» 21st.dev theme, scoped to this page (styles.css, .theme-classic-blue).
 * Type follows Linear's scale from the design-md-library (56 / 40 / 28 / 20 / 18 px steps), with Arabic line heights
 * and no negative tracking. Layout ideas from 21st.dev, rebuilt in Tadqeeq's tokens and RTL with no new packages:
 * «Product Hero with Demo Panel» (hero beside a live-looking product panel), «Vertical How It Works Timeline»
 * (numbered nodes on a dashed rail) and «FAQ 3» (accordion FAQ).
 */
export function ProductFeaturePage({ page }: { page: ProductPage }) {
  const product = PRODUCTS[page.product];
  const guides = page.relatedGuides.map(guideBySlug);
  const others = PRODUCT_PAGES.filter((other) => other.slug !== page.slug);
  const Visual = HERO_VISUALS[page.product];
  let bulletBlocks = 0;

  return (
    <GuideShell wide theme="theme-classic-blue">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <header className={cn("grid gap-12 pb-16 pt-10 sm:pt-14 lg:pb-24", Visual && "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16")}>
          <div>
            <nav aria-label="مسار الصفحة" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Link to="/" className="rounded hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
                الرئيسية
              </Link>
              <span aria-hidden="true">/</span>
              <Link to="/products" className="rounded hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
                المنتجات
              </Link>
              <span aria-hidden="true">/</span>
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <ProductIcon product={page.product} className="size-7 rounded-lg" />
                {product.name}
              </span>
            </nav>
            <h1 className="mt-6 max-w-[20ch] text-balance font-display text-[2.1rem] font-extrabold leading-[1.35] sm:text-5xl sm:leading-[1.3]">{page.title}</h1>
            <p className="mt-6 max-w-[62ch] text-lg leading-9 text-foreground/80">{page.answer}</p>
            {page.availability ? (
              <p className="mt-5 flex max-w-[62ch] items-start gap-2.5 text-[15px] leading-7 text-muted-foreground">
                <Info className="mt-1 size-4 shrink-0 text-primary-text" />
                <span>{page.availability}</span>
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-bold text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[0.98]"
              >
                جرّب {product.name} مجاناً
                <ArrowLeft className="size-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex h-12 items-center rounded-lg border border-border bg-card px-6 text-[15px] font-semibold transition-colors hover:border-primary"
              >
                الخطط والأسعار
              </Link>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              آخر تحديث: <time dateTime={page.updated}>{formatArabicDate(page.updated)}</time>
            </p>
          </div>
          {Visual ? <Visual /> : null}
        </header>
      </div>

      {page.sections.map((section) => {
        if (section.steps) return <StepsBlock key={section.heading} section={section} />;
        if (section.bullets && !section.table && !section.quote) {
          const dark = bulletBlocks++ % 2 === 1;
          return <BulletsBlock key={section.heading} section={section} dark={dark} />;
        }
        if (section.paragraphs && !section.table && !section.quote) return <ParagraphsBlock key={section.heading} section={section} />;
        return (
          <div key={section.heading} className="mx-auto max-w-3xl px-4 sm:px-6">
            <Section section={section} />
          </div>
        );
      })}

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16 lg:py-24">
        <h2 className="font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem]">أسئلة شائعة</h2>
        <div className="border-b border-border">
          {page.faqs.map(([question, answer], index) => (
            <details key={question} open={index === 0} className="group border-t border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded py-5 text-lg font-bold focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <h3>{question}</h3>
                <ChevronDown className="size-5 shrink-0 text-primary-text transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <p className="max-w-[65ch] pb-6 text-base leading-8 text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <aside className="flex flex-col items-start gap-6 rounded-2xl bg-ink p-8 text-ink-foreground sm:p-12 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-display text-[1.75rem] font-extrabold leading-[1.4]">ابدأ بملفات شهر واحد.</p>
            <p className="mt-2 text-base leading-8 text-ink-muted">ارفع فاتورة المنصة وملف الطلبات مجاناً وشاهد الفروقات لكل فرع.</p>
          </div>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-bold text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[0.98]"
          >
            ابدأ مجاناً
            <ArrowLeft className="size-4" />
          </Link>
        </aside>

        {guides.length ? (
          <nav aria-label="أدلة مرتبطة" className="mt-14">
            <h2 className="font-display text-xl font-extrabold">أدلة مرتبطة</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {guides.map((guide) => (
                <li key={guide.slug}>
                  <a href={guide.path} className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary">
                    <PlatformIcon platform={guide.platform} className="size-8 shrink-0 rounded-full" />
                    <span className="font-semibold leading-7">{guide.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <nav aria-label="منتجات أخرى" className="mt-12">
          <h2 className="font-display text-xl font-extrabold">منتجات أخرى من تدقيق</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((other) => (
              <li key={other.slug}>
                <a href={other.path} className="flex h-full items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary">
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
      </div>
    </GuideShell>
  );
}

/** "Why" sections: heading on one side, the reasoning on the other, ruled off from the hero. */
function ParagraphsBlock({ section }: { section: GuideSection }) {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="grid gap-6 border-t border-border py-16 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16 lg:py-20">
        <h2 className="text-balance font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem]">{section.heading}</h2>
        <div className="space-y-5">
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="max-w-[65ch] text-lg leading-9 text-foreground/80">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Steps as a vertical timeline: numbered nodes joined by a dashed rail, heading held beside it on wide screens. */
function StepsBlock({ section }: { section: GuideSection }) {
  const steps = section.steps ?? [];
  return (
    <section className="bg-secondary/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16 lg:py-24">
        <h2 className="text-balance font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem] lg:sticky lg:top-24 lg:self-start">{section.heading}</h2>
        <ol className="relative">
          {steps.map((step, index) => (
            <li key={step} className="relative flex gap-5 pb-10 last:pb-0">
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="absolute bottom-0 start-[19px] top-11 border-s-2 border-dashed border-primary/35" />
              ) : null}
              <span className="num relative grid size-10 shrink-0 place-items-center rounded-lg bg-ink text-base font-semibold text-ink-foreground">{index + 1}</span>
              <p className="max-w-[60ch] pt-1.5 text-[17px] leading-8">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Bullet sections: a ruled grid on the page, or (every other one) a list on the ink surface for rhythm. */
function BulletsBlock({ section, dark }: { section: GuideSection; dark: boolean }) {
  const bullets = section.bullets ?? [];
  if (dark) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="rounded-2xl bg-ink px-6 py-12 text-ink-foreground sm:px-12 lg:py-16">
          <h2 className="text-balance font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem]">{section.heading}</h2>
          <ul className="mt-10 grid gap-x-12 gap-y-7 md:grid-cols-2">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3.5 text-[17px] leading-8">
                <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <span className="text-ink-foreground/90">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      <h2 className="max-w-[24ch] text-balance font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem]">{section.heading}</h2>
      <ul className="mt-10 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-3.5 border-t border-border py-6 text-[17px] leading-8">
            <Check className="mt-1.5 size-5 shrink-0 text-success" strokeWidth={2.5} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Mutabiq's hero panel: one period reconciled branch by branch, with the formula behind one figure. Illustrative
 * figures only (marked as an example), never customer data.
 */
function MutabiqPanel() {
  const rows: Array<{ branch: string; invoice: string; orders: string; diff: string | null }> = [
    { branch: "فرع العليا", invoice: "8,420.00", orders: "7,578.00", diff: "842.00" },
    { branch: "فرع الملقا", invoice: "5,130.00", orders: "5,130.00", diff: null },
    { branch: "فرع النرجس", invoice: "3,040.00", orders: "2,221.15", diff: "818.85" },
  ];
  return (
    <figure className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-700">
      <div className="rounded-2xl bg-secondary p-3 sm:p-4">
        <div className="rounded-xl bg-card p-5 shadow-[0_1px_3px_rgb(0_0_0/0.12),0_12px_32px_-16px_rgb(0_0_0/0.18)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-base font-extrabold">عمولة الطلبات حسب الفرع</p>
            <PlatformName platform="hungerstation" className="text-xs font-semibold text-muted-foreground" iconClassName="size-4 rounded" />
          </div>
          <table className="mt-5 w-full table-fixed text-[13px] sm:text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="w-[28%] pb-3 pe-2 text-start font-medium">الفرع</th>
                <th scope="col" className="px-2 pb-3 text-start font-medium">الفاتورة</th>
                <th scope="col" className="px-2 pb-3 text-start font-medium">طلباتك</th>
                <th scope="col" className="px-2 pb-3 text-start font-medium">الفرق</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.branch} className="border-t border-border">
                  <th scope="row" className="py-3.5 pe-2 text-start font-semibold">{row.branch}</th>
                  <td className="px-2 py-3.5"><span className="num">{row.invoice}</span></td>
                  <td className="px-2 py-3.5"><span className="num">{row.orders}</span></td>
                  <td className="px-2 py-3.5">
                    {row.diff ? (
                      <span className="num font-semibold text-destructive">+{row.diff}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-success">
                        <Check className="size-3.5" strokeWidth={3} />
                        مطابق
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 rounded-xl bg-background px-4 py-3 text-[13px] leading-6">
            <p className="text-muted-foreground">كيف حُسب رقم فرع العليا</p>
            <p className="num mt-1 font-semibold" dir="ltr">
              42,100.00 × 18% = 7,578.00
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1 pt-4">
          <span className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] text-ink-foreground">
            فرق قبل السداد <span className="num font-semibold text-primary">1,660.85 ر.س</span>
          </span>
          <span className="text-xs text-muted-foreground">ينتقل كل فرق إلى «رادار» للمتابعة</span>
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">مثال توضيحي بأرقام افتراضية.</figcaption>
    </figure>
  );
}

const HERO_VISUALS: Partial<Record<ProductKey, ComponentType>> = {
  mutabiq: MutabiqPanel,
};
