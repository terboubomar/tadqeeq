import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, FileSpreadsheet, FileText, Info } from "lucide-react";
import type { ComponentType } from "react";

import { GuideShell, Section } from "@/components/guides/GuidePages";
import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { ProductIcon } from "@/components/products/ProductIcon";
import { guideBySlug } from "@/lib/guides";
import { PRODUCT_PAGES, type ProductPage } from "@/lib/product-pages";
import { PRODUCTS, type ProductKey } from "@/lib/products";
import { formatArabicDate } from "@/lib/site-content";
import { cn } from "@/lib/utils";

/**
 * A product page laid out as a feature page, with the full text on screen: split hero beside a product panel, the
 * problem beside the cases it names, the steps as a titled timeline beside a files panel, the checks as side-by-side
 * columns, FAQs, other products as cards and a closing call to action. Tadqeeq's own colours and type; the order of
 * sections follows a common SaaS product-page pattern, with no copy, illustrations or eyebrows borrowed.
 */
export function ProductFeaturePage({ page }: { page: ProductPage }) {
  const product = PRODUCTS[page.product];
  const guides = page.relatedGuides.map(guideBySlug);
  const others = PRODUCT_PAGES.filter((other) => other.slug !== page.slug);
  const Visual = HERO_VISUALS[page.product];
  const feature = page.feature;
  const why = page.sections.find((section) => section.paragraphs && !section.steps && !section.bullets && !section.table && !section.quote);
  const steps = page.sections.find((section) => section.steps);
  const columns = page.sections.filter((section) => section.bullets && !section.steps && !section.table && !section.quote);
  const rest = page.sections.filter((section) => section !== why && section !== steps && !columns.includes(section));

  return (
    <GuideShell wide>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <header className={cn("grid gap-12 pb-16 pt-10 sm:pt-14 lg:pb-24", Visual && "lg:grid-cols-2 lg:items-center lg:gap-16")}>
          <div>
            <nav aria-label="مسار الصفحة" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Link to="/" className="rounded hover:text-foreground">
                الرئيسية
              </Link>
              <span aria-hidden="true">/</span>
              <Link to="/products" className="rounded hover:text-foreground">
                المنتجات
              </Link>
              <span aria-hidden="true">/</span>
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <ProductIcon product={page.product} className="size-7 rounded-lg" />
                {product.name}
              </span>
            </nav>
            <h1 className="mt-6 text-balance font-display text-[2.1rem] font-extrabold leading-[1.35] sm:text-5xl sm:leading-[1.3]">{page.title}</h1>
            <p className="mt-6 max-w-[60ch] text-lg leading-9 text-foreground/75">{page.answer}</p>
            {page.availability ? (
              <p className="mt-5 flex max-w-[60ch] items-start gap-2.5 text-[15px] leading-7 text-muted-foreground">
                <Info className="mt-1 size-4 shrink-0 text-primary-text" />
                <span>{page.availability}</span>
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-bold text-ink-foreground transition-transform hover:bg-ink/90 active:scale-[0.98]"
              >
                جرّب {product.name} مجاناً
                <ArrowLeft className="size-4" />
              </Link>
              <Link to="/pricing" className="inline-flex h-12 items-center rounded-full border border-border bg-card px-6 text-[15px] font-semibold transition-colors hover:border-primary">
                الخطط والأسعار
              </Link>
            </div>
          </div>
          {Visual ? <Visual /> : null}
        </header>
      </div>

      {why ? (
        <section className="border-t border-border">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
            <div>
              <h2 className="text-balance font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem]">{why.heading}</h2>
              {why.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-5 max-w-[60ch] text-lg leading-9 text-foreground/75">
                  {paragraph}
                </p>
              ))}
            </div>
            {feature?.problems.length ? (
              <ul className="grid self-start overflow-hidden rounded-[22px] border border-border bg-card sm:grid-cols-3">
                {feature.problems.map(([title, text]) => (
                  <li key={title} className="border-border p-6 [&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-s sm:[&:not(:first-child)]:border-t-0">
                    <h3 className="font-bold leading-7">{title}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{text}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      {steps?.steps ? (
        <section className="bg-secondary/50">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
            <h2 className="text-balance font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem]">{steps.heading}</h2>
            <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
              <ol>
                {steps.steps.map((step, index, all) => (
                  <li key={step} className="relative flex gap-4 pb-8 last:pb-0">
                    {index < all.length - 1 ? <span aria-hidden="true" className="absolute bottom-0 start-[7px] top-6 border-s border-primary/40" /> : null}
                    <span aria-hidden="true" className="relative mt-1.5 grid size-4 shrink-0 place-items-center rounded-full border border-primary bg-background">
                      <span className="size-1.5 rounded-full bg-primary" />
                    </span>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        الخطوة <span className="num">{index + 1}</span>
                      </p>
                      {feature?.stepTitles[index] ? <h3 className="mt-1 text-lg font-bold leading-8">{feature.stepTitles[index]}</h3> : null}
                      <p className="mt-1 max-w-[56ch] text-[15px] leading-7 text-muted-foreground">{step}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <FilesPanel />
            </div>
          </div>
        </section>
      ) : null}

      {columns.length ? (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          {feature?.capabilitiesHeading ? (
            <h2 className="max-w-[22ch] text-balance font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem]">{feature.capabilitiesHeading}</h2>
          ) : null}
          <div className={cn("mt-12 grid gap-12", columns.length > 1 && "md:grid-cols-2", columns.length > 2 && "lg:grid-cols-3")}>
            {columns.map((column) => (
              <div key={column.heading}>
                <h3 className="flex items-center gap-2.5 text-lg font-bold">
                  <span aria-hidden="true" className="h-4 w-1 rounded-full bg-primary" />
                  {column.heading}
                </h3>
                <ul className="mt-5 space-y-4">
                  {column.bullets?.map((bullet) => (
                    <li key={bullet} className="flex gap-3 text-[15px] leading-7 text-foreground/80">
                      <Check className="mt-1 size-4 shrink-0 text-success" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {rest.map((section) => (
        <div key={section.heading} className="mx-auto max-w-3xl px-4 sm:px-6">
          <Section section={section} />
        </div>
      ))}

      <section className="border-t border-border">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <h2 className="font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem]">أسئلة شائعة</h2>
          <div className="border-b border-border">
            {page.faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0} className="group border-t border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded py-5 text-lg font-bold [&::-webkit-details-marker]:hidden">
                  <h3>{question}</h3>
                  <ChevronDown className="size-5 shrink-0 text-primary-text transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <p className="max-w-[65ch] pb-6 text-base leading-8 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav aria-label="منتجات أخرى" className="border-t border-border py-16 lg:py-20">
          <h2 className="font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.25rem]">منتجات أخرى من تدقيق</h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((other) => (
              <li key={other.slug}>
                <a href={other.path} className="group flex h-full flex-col rounded-[22px] border border-border bg-card p-6 transition-colors hover:border-primary">
                  <ProductIcon product={other.product} className="size-10" />
                  <span className="mt-5 font-display text-lg font-extrabold">{PRODUCTS[other.product].name}</span>
                  <span className="mt-1 text-sm leading-7 text-muted-foreground">{other.summary}</span>
                  <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-semibold text-primary-text">
                    اكتشف {PRODUCTS[other.product].name}
                    <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {guides.length ? (
          <nav aria-label="أدلة مرتبطة" className="pb-16">
            <h2 className="font-display text-xl font-extrabold">أدلة مرتبطة</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {guides.map((guide) => (
                <li key={guide.slug}>
                  <a href={guide.path} className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary">
                    <PlatformIcon platform={guide.platform} className="size-8 shrink-0 rounded-full" />
                    <span className="font-semibold leading-7">{guide.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <aside className="mb-16 flex flex-col items-center rounded-[28px] bg-secondary px-6 py-16 text-center sm:py-20">
          <p className="max-w-[18ch] text-balance font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.75rem]">ابدأ بملفات شهر واحد.</p>
          <p className="mt-4 max-w-xl text-base leading-8 text-foreground/75 sm:text-lg">ارفع فاتورة المنصة وملف الطلبات مجاناً وشاهد الفروقات لكل فرع.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-bold text-ink-foreground transition-transform hover:bg-ink/90 active:scale-[0.98]"
            >
              ابدأ مجاناً
              <ArrowLeft className="size-4" />
            </Link>
            <Link to="/pricing" className="inline-flex h-12 items-center rounded-full border border-ink/15 bg-card px-6 text-[15px] font-semibold transition-colors hover:border-primary">
              الخطط والأسعار
            </Link>
          </div>
        </aside>

        <p className="pb-10 text-sm text-muted-foreground">
          آخر تحديث: <time dateTime={page.updated}>{formatArabicDate(page.updated)}</time>
        </p>
      </div>
    </GuideShell>
  );
}

/** Beside the steps: the two files going in and what comes out. Illustrative, no figures. */
function FilesPanel() {
  return (
    <div aria-hidden="true" className="rounded-[28px] bg-secondary p-6 sm:p-10">
      <div className="grid gap-3">
        {[
          { icon: FileSpreadsheet, name: "ملف الطلبات", type: "Excel أو CSV" },
          { icon: FileText, name: "فاتورة المنصة", type: "PDF" },
        ].map(({ icon: Icon, name, type }) => (
          <div key={name} className="flex items-center gap-3 rounded-2xl bg-card p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary-text">
              <Icon className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{name}</span>
              <span className="block text-xs text-muted-foreground">{type}</span>
            </span>
            <Check className="size-4 text-success" />
          </div>
        ))}
      </div>
      <div className="my-4 flex justify-center text-primary-text">
        <ChevronDown className="size-5" />
      </div>
      <div className="rounded-2xl bg-ink p-5 text-ink-foreground">
        <p className="text-sm text-ink-muted">النتيجة</p>
        <p className="mt-1 font-display text-lg font-extrabold">الفرق لكل فرع، مع مصدره ومعادلته</p>
      </div>
    </div>
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
      <div className="rounded-[28px] bg-secondary p-4 sm:p-8">
        <div className="rounded-[20px] bg-card p-5 shadow-[0_24px_48px_-28px_rgb(19_35_43/0.35)] sm:p-6">
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
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-4">
          <span className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] text-ink-foreground">
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
