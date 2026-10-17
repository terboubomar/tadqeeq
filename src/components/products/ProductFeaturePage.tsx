import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, FileSpreadsheet, FileText, Info } from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";

import { GuideIcon, GuideShell, Section } from "@/components/guides/GuidePages";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { NabdWorkflow } from "@/components/products/NabdWorkflow";
import { ProductIcon } from "@/components/products/ProductIcon";
import { guideBySlug, type GuideSection } from "@/lib/guides";
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

      {page.product === "nabd" ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="border-t border-border pb-16 pt-6 lg:pb-24 lg:pt-14">
            <NabdWorkflow />
          </div>
        </div>
      ) : null}

      {layoutBlocks(page).map((block) => {
        if (block.kind === "why") return <WhyBlock key={block.section.heading} section={block.section} problems={feature?.problems} />;
        if (block.kind === "steps") {
          const Panel = STEP_VISUALS[page.product];
          return <StepsBlock key={block.section.heading} section={block.section} titles={feature?.stepTitles} panel={Panel ? <Panel /> : null} />;
        }
        if (block.kind === "columns") return <ColumnsBlock key={block.sections[0]!.heading} heading={feature?.capabilitiesHeading} sections={block.sections} />;
        if (block.kind === "list") return <ListBlock key={block.section.heading} section={block.section} />;
        if (block.kind === "split") return <SplitBlock key={block.section.heading} section={block.section} />;
        return (
          <div key={block.section.heading} className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
            <Section section={block.section} />
          </div>
        );
      })}

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
                    <GuideIcon platform={guide.platform} className="size-8" />
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

type LayoutBlock =
  | { kind: "why" | "steps" | "list" | "split" | "plain"; section: GuideSection }
  | { kind: "columns"; sections: GuideSection[] };

/**
 * The page's sections in their own order, each mapped to a block: the first plain paragraph section is the «why»
 * (beside its problem cases), steps become the timeline, adjacent lists become columns when the page gives them one
 * heading (otherwise each list stands alone), later paragraph sections a heading-beside-text split. Tables and
 * quotes keep the guide renderer.
 */
function layoutBlocks(page: ProductPage): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  page.sections.forEach((section, index) => {
    const plain = !section.table && !section.quote;
    if (section.steps && plain) blocks.push({ kind: "steps", section });
    else if (section.bullets && !section.paragraphs && plain) {
      const last = blocks.at(-1);
      if (page.feature?.capabilitiesHeading && last?.kind === "columns") last.sections.push(section);
      else if (page.feature?.capabilitiesHeading) blocks.push({ kind: "columns", sections: [section] });
      else blocks.push({ kind: "list", section });
    } else if (section.paragraphs && !section.bullets && plain) blocks.push({ kind: index === 0 ? "why" : "split", section });
    else blocks.push({ kind: "plain", section });
  });
  return blocks;
}

const H2 = "text-balance font-display text-[1.75rem] font-extrabold leading-[1.4] sm:text-[2.5rem]";

function WhyBlock({ section, problems }: { section: GuideSection; problems?: Array<[string, string]> }) {
  return (
    <section className="border-t border-border">
      <div className={cn("mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:gap-16 lg:py-24", problems?.length && "lg:grid-cols-2")}>
        <div>
          <h2 className={H2}>{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="mt-5 max-w-[60ch] text-lg leading-9 text-foreground/75">
              {paragraph}
            </p>
          ))}
        </div>
        {problems?.length ? (
          <ul className="grid self-start overflow-hidden rounded-[22px] border border-border bg-card sm:grid-cols-3">
            {problems.map(([title, text]) => (
              <li key={title} className="border-border p-6 [&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-s sm:[&:not(:first-child)]:border-t-0">
                <h3 className="font-bold leading-7">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function StepsBlock({ section, titles, panel }: { section: GuideSection; titles?: string[]; panel: ReactNode }) {
  const steps = section.steps ?? [];
  const text = (step: string, index: number) =>
    titles?.[index] ? (
      <>
        <h3 className="mt-1 text-lg font-bold leading-8">{titles[index]}</h3>
        <p className="mt-1 max-w-[56ch] text-[15px] leading-7 text-muted-foreground">{step}</p>
      </>
    ) : (
      <p className="mt-1 max-w-[56ch] text-[17px] font-semibold leading-8">{step}</p>
    );
  const label = (index: number) => (
    <p className="text-xs text-muted-foreground">
      الخطوة <span className="num">{index + 1}</span>
    </p>
  );
  const dot = (
    <span aria-hidden="true" className="relative grid size-4 shrink-0 place-items-center rounded-full border border-primary bg-background">
      <span className="size-1.5 rounded-full bg-primary" />
    </span>
  );
  return (
    <section className="bg-secondary/50">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <h2 className={H2}>{section.heading}</h2>
        {panel ? (
          <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <ol>
              {steps.map((step, index) => (
                <li key={step} className="relative flex gap-4 pb-8 last:pb-0">
                  {index < steps.length - 1 ? <span aria-hidden="true" className="absolute bottom-0 start-[7px] top-6 border-s border-primary/40" /> : null}
                  <span className="mt-1.5">{dot}</span>
                  <div>
                    {label(index)}
                    {text(step, index)}
                  </div>
                </li>
              ))}
            </ol>
            {panel}
          </div>
        ) : (
          /* No side panel: one row across wide screens (rail on top), a vertical list on phones. */
          <ol className="mt-12 grid gap-8 lg:grid-cols-[repeat(var(--steps),minmax(0,1fr))] lg:gap-6" style={{ "--steps": steps.length } as CSSProperties}>
            {steps.map((step, index) => (
              <li key={step} className="relative flex gap-4 lg:block">
                {index < steps.length - 1 ? (
                  <span aria-hidden="true" className="absolute start-[7px] top-6 bottom-[-2rem] border-s border-primary/40 lg:bottom-auto lg:end-[-1.5rem] lg:start-6 lg:top-[7px] lg:border-s-0 lg:border-t" />
                ) : null}
                <span className="mt-1.5 lg:mt-0 lg:block">{dot}</span>
                <div className="lg:mt-5">
                  {label(index)}
                  {text(step, index)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function BulletList({ bullets, wide }: { bullets: string[]; wide?: boolean }) {
  return (
    <ul className={cn("mt-5 gap-x-12 gap-y-4", wide ? "grid md:grid-cols-2" : "space-y-4")}>
      {bullets.map((bullet) => (
        <li key={bullet} className="flex gap-3 text-[15px] leading-7 text-foreground/80">
          <Check className="mt-1 size-4 shrink-0 text-success" />
          <span>{bullet}</span>
        </li>
      ))}
    </ul>
  );
}

function ColumnsBlock({ heading, sections }: { heading?: string; sections: GuideSection[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      {heading ? <h2 className={cn(H2, "max-w-[22ch]")}>{heading}</h2> : null}
      <div className={cn("mt-12 grid gap-12", sections.length > 1 && "md:grid-cols-2", sections.length > 2 && "lg:grid-cols-3")}>
        {sections.map((column) => (
          <div key={column.heading}>
            <h3 className="flex items-center gap-2.5 text-lg font-bold">
              <span aria-hidden="true" className="h-4 w-1 rounded-full bg-primary" />
              {column.heading}
            </h3>
            <BulletList bullets={column.bullets ?? []} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ListBlock({ section }: { section: GuideSection }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
      <h2 className={cn(H2, "max-w-[22ch]")}>{section.heading}</h2>
      <div className="mt-6">
        <BulletList bullets={section.bullets ?? []} wide />
      </div>
    </section>
  );
}

function SplitBlock({ section }: { section: GuideSection }) {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="grid gap-6 border-t border-border py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
        <h2 className={H2}>{section.heading}</h2>
        <div className="space-y-5">
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="max-w-[60ch] text-lg leading-9 text-foreground/75">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
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

/** Frame shared by the illustrative hero panels: tinted surface, white card, example caption. */
function PanelFrame({ title, aside, children, footer }: { title: string; aside?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <figure className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-700">
      <div className="rounded-[28px] bg-secondary p-4 sm:p-8">
        <div className="rounded-[20px] bg-card p-5 shadow-[0_24px_48px_-28px_rgb(19_35_43/0.35)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-base font-extrabold">{title}</p>
            {aside}
          </div>
          {children}
        </div>
        {footer ? <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-4">{footer}</div> : null}
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">مثال توضيحي بأرقام افتراضية.</figcaption>
    </figure>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] text-ink-foreground">{children}</span>;
}

/** Kashif: where 100 riyals of sales go, by fee type. */
function KashifPanel() {
  const rows: Array<[string, string, number]> = [
    ["العمولة", "18.00", 18],
    ["رسوم الدفع", "2.10", 2.1],
    ["الحملات", "3.40", 3.4],
    ["الضريبة على الرسوم", "3.02", 3.02],
    ["التعويضات", "0.80", 0.8],
  ];
  return (
    <PanelFrame
      title="من كل 100 ريال مبيعات"
      aside={<PlatformName platform="keeta" className="text-xs font-semibold text-muted-foreground" iconClassName="size-4 rounded" />}
      footer={
        <>
          <Pill>
            يصلك فعلاً <span className="num font-semibold text-primary">72.68 ر.س</span>
          </Pill>
          <span className="text-xs text-muted-foreground">لكل منصة ولكل فرع</span>
        </>
      }
    >
      <ul className="mt-5 space-y-3.5 text-sm">
        {rows.map(([label, value, share]) => (
          <li key={label}>
            <div className="flex items-center justify-between gap-3">
              <span>{label}</span>
              <span className="num font-semibold">{value}</span>
            </div>
            <div aria-hidden="true" className="mt-1.5 h-1.5 rounded-full bg-background">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(share / 18) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </PanelFrame>
  );
}

/** Radar: open exceptions with severity, amount and status. */
function RadarPanel() {
  const rows: Array<{ title: string; branch: string; level: string; tone: string; amount: string; status: string }> = [
    { title: "عمولة أعلى من المحتسب", branch: "فرع العليا", level: "حرج", tone: "bg-destructive-soft text-destructive", amount: "842.00", status: "قيد المراجعة" },
    { title: "رسوم دفع على طلب نقدي", branch: "فرع النرجس", level: "متوسط", tone: "bg-secondary text-primary-text", amount: "96.60", status: "جديد" },
    { title: "تعويض على طلب سليم", branch: "فرع الملقا", level: "منخفض", tone: "bg-muted text-muted-foreground", amount: "38.00", status: "تم الاعتراض" },
  ];
  return (
    <PanelFrame
      title="الاستثناءات المفتوحة"
      footer={
        <>
          <Pill>
            قابل للاسترداد <span className="num font-semibold text-primary">976.60 ر.س</span>
          </Pill>
          <span className="text-xs text-muted-foreground">لكل استثناء مسؤول وحالة</span>
        </>
      }
    >
      <ul className="mt-4">
        {rows.map((row) => (
          <li key={row.title} className="flex items-center justify-between gap-3 border-t border-border py-3.5 text-sm first:border-t-0">
            <span>
              <span className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", row.tone)}>{row.level}</span>
                <span className="font-semibold">{row.title}</span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {row.branch} · {row.status}
              </span>
            </span>
            <span className="num shrink-0 font-semibold">{row.amount}</span>
          </li>
        ))}
      </ul>
    </PanelFrame>
  );
}

/** Istirdad: proof sent in the branch group, linked to the order, then the claim's status. */
function IstirdadPanel() {
  return (
    <PanelFrame
      title="قروب فرع العليا"
      footer={
        <>
          <Pill>
            تعويض مسترَد <span className="num font-semibold text-primary">46.00 ر.س</span>
          </Pill>
          <span className="text-xs text-muted-foreground">مرسلة · مقبولة · مسترَدة</span>
        </>
      }
    >
      <div className="mt-5 space-y-3 text-sm">
        <div className="max-w-[80%] rounded-2xl rounded-ss-md bg-background p-3">
          <div aria-hidden="true" className="grid h-24 place-items-center rounded-xl bg-muted text-muted-foreground">
            <FileText className="size-6" />
          </div>
          <p className="mt-2">
            الكاشير: طلب <span className="num">48213</span>
          </p>
        </div>
        <div className="ms-auto max-w-[80%] rounded-2xl rounded-se-md bg-ink p-3 text-ink-foreground">
          <p className="flex items-center gap-1.5">
            <Check className="size-4 text-primary" />
            تم ربط الدليل بالطلب <span className="num">48213</span>
          </p>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
          <span>طلب المراجعة جاهز</span>
          <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">مقبولة</span>
        </div>
      </div>
    </PanelFrame>
  );
}

/** Aaid: campaigns by real profit after commission and discounts. */
function AaidPanel() {
  const rows: Array<{ name: string; spend: string; profit: string; roi: string; up: boolean }> = [
    { name: "خصم الويكند", spend: "1,200.00", profit: "+360.00", roi: "30%", up: true },
    { name: "توصيل مجاني", spend: "900.00", profit: "−180.00", roi: "−20%", up: false },
  ];
  return (
    <PanelFrame title="العائد الحقيقي لكل حملة" aside={<span className="text-xs text-muted-foreground">بعد العمولة والخصومات</span>}>
      <table className="mt-5 w-full table-fixed text-[13px] sm:text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="w-[34%] pb-3 pe-2 text-start font-medium">الحملة</th>
            <th scope="col" className="px-2 pb-3 text-start font-medium">الإنفاق</th>
            <th scope="col" className="px-2 pb-3 text-start font-medium">الربح</th>
            <th scope="col" className="px-2 pb-3 text-start font-medium">العائد</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-border">
              <th scope="row" className="py-3.5 pe-2 text-start font-semibold">{row.name}</th>
              <td className="px-2 py-3.5"><span className="num">{row.spend}</span></td>
              <td className="px-2 py-3.5"><span className={cn("num font-semibold", row.up ? "text-success" : "text-destructive")}>{row.profit}</span></td>
              <td className="px-2 py-3.5"><span className={cn("num font-semibold", row.up ? "text-success" : "text-destructive")}>{row.roi}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelFrame>
  );
}

/** Raqeeb: unusual changes, ranked by their effect in riyals. */
function RaqeebPanel() {
  const alerts: Array<{ title: string; where: string; impact: string }> = [
    { title: "عمولة طلبات الاستلام أعلى من المعتاد", where: "فرع النرجس · هنقرستيشن", impact: "+640.00" },
    { title: "رسوم الدفع ارتفعت عن الفترة السابقة", where: "فرع العليا · جاهز", impact: "+210.00" },
  ];
  return (
    <PanelFrame title="تنبيهات بعد آخر رفع" aside={<span className="text-xs text-muted-foreground">مرتبة حسب الأثر بالريال</span>}>
      <ul className="mt-5 space-y-3">
        {alerts.map((alert) => (
          <li key={alert.title} className="rounded-2xl border border-border p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold leading-6">{alert.title}</span>
              <span className="num shrink-0 font-semibold text-destructive">{alert.impact}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{alert.where}</p>
            <div aria-hidden="true" className="mt-3 flex gap-2 text-xs">
              <span className="rounded-full bg-ink px-3 py-1 text-ink-foreground">راجِع</span>
              <span className="rounded-full border border-border px-3 py-1">متوقع</span>
            </div>
          </li>
        ))}
      </ul>
    </PanelFrame>
  );
}

/** Nabd: today's figures for one platform. */
function NabdPanel() {
  const tiles: Array<[string, string]> = [
    ["مبيعات اليوم", "12,480.00"],
    ["تكلفة المنصة من المبيعات", "23.4%"],
    ["التكلفة لكل طلب", "9.80"],
    ["التحويل المتوقع للشهر", "286,400.00"],
  ];
  return (
    <PanelFrame
      title="اليوم"
      aside={<PlatformName platform="hungerstation" className="text-xs font-semibold text-muted-foreground" iconClassName="size-4 rounded" />}
    >
      <dl className="mt-5 grid grid-cols-2 gap-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-background p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="num mt-1.5 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </PanelFrame>
  );
}

const HERO_VISUALS: Partial<Record<ProductKey, ComponentType>> = {
  mutabiq: MutabiqPanel,
  kashif: KashifPanel,
  radar: RadarPanel,
  istirdad: IstirdadPanel,
  aaid: AaidPanel,
  raqeeb: RaqeebPanel,
  nabd: NabdPanel,
};

/** Panels shown beside a page's steps. */
const STEP_VISUALS: Partial<Record<ProductKey, ComponentType>> = {
  mutabiq: FilesPanel,
};
