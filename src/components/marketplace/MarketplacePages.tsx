import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Check, Plus } from "lucide-react";
import { useState } from "react";

import { GuideShell } from "@/components/guides/GuidePages";
import { IntegrationLogoMark, type IntegrationLogo } from "@/components/integrations/IntegrationLogo";
import { MARKETPLACE, MARKETPLACE_CATEGORY_LABEL, MARKETPLACE_INDEX, type MarketplaceCategory, type MarketplaceItem } from "@/lib/marketplace";
import { cn } from "@/lib/utils";

/** Wordmarks that fill only a thin band of their square, so they are drawn larger. */
const WIDE_LOGOS: ReadonlySet<IntegrationLogo> = new Set(["odoo"]);

const STATUS_LABEL: Record<MarketplaceCategory, string> = {
  accounting: "ربط مباشر",
  messaging: "متاح",
  ai: "متاح",
};

/** The product's coloured logo tile, as on the in-app integrations page. */
export function IntegrationTile({ item, size = "md", className }: { item: MarketplaceItem; size?: "sm" | "md" | "lg"; className?: string }) {
  const markSize = { sm: "size-9", md: "size-11 sm:size-12", lg: "size-16 sm:size-20" }[size];
  const wideSize = { sm: "size-20", md: "size-24 sm:size-28", lg: "size-36 sm:size-44" }[size];
  return (
    <span
      className={cn("relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl text-white", item.light && "ring-1 ring-inset ring-border", className)}
      style={{ backgroundColor: item.color }}
    >
      {item.image ? (
        <img src={item.image.src} alt={item.name} loading="lazy" decoding="async" className={cn("h-auto object-contain", item.image.className)} />
      ) : item.logos?.length ? (
        <span className="flex items-center gap-4">
          {item.logos.map((logo) => (
            <IntegrationLogoMark key={logo} logo={logo} className={WIDE_LOGOS.has(logo) ? wideSize : markSize} />
          ))}
        </span>
      ) : (
        <span className="font-display text-[22px] font-extrabold" dir="auto">
          {item.mark}
        </span>
      )}
    </span>
  );
}

function StatusPill({ item }: { item: MarketplaceItem }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
      <span className="size-1.5 rounded-full bg-success" />
      {STATUS_LABEL[item.category]}
    </span>
  );
}

function IntegrationCard({ item }: { item: MarketplaceItem }) {
  return (
    <Link
      to={item.path}
      className="group block h-full rounded-2xl border border-border bg-card p-2.5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/25 active:translate-y-0"
    >
      <IntegrationTile item={item} />
      <span className="mt-2.5 block px-0.5 pb-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-bold leading-6">{item.name}</span>
          <ArrowLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" aria-hidden />
        </span>
        <span className="block text-[12.5px] leading-5 text-muted-foreground">{item.line}</span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusPill item={item} />
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-primary-text">{MARKETPLACE_CATEGORY_LABEL[item.category]}</span>
        </span>
      </span>
    </Link>
  );
}

function RequestCard() {
  return (
    <Link
      to="/contact"
      className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-4 text-center transition-colors hover:border-foreground/30"
    >
      <span className="grid size-10 place-items-center rounded-full bg-secondary text-primary-text">
        <Plus className="size-5" aria-hidden />
      </span>
      <span className="text-[14px] font-bold">نظامك غير موجود؟</span>
      <span className="text-[12.5px] text-muted-foreground">اطلبه منا</span>
    </Link>
  );
}

const Crumbs = ({ name }: { name?: string }) => (
  <nav aria-label="مسار الصفحة" className="text-sm text-muted-foreground">
    <Link to="/" className="hover:text-foreground">
      الرئيسية
    </Link>
    <span className="mx-2">/</span>
    {name ? (
      <>
        <Link to="/marketplace" className="hover:text-foreground">
          {MARKETPLACE_INDEX.title}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{name}</span>
      </>
    ) : (
      <span className="text-foreground">{MARKETPLACE_INDEX.title}</span>
    )}
  </nav>
);

export function MarketplaceIndexPage() {
  const [category, setCategory] = useState<MarketplaceCategory | "all">("all");
  const shown = MARKETPLACE.filter((entry) => category === "all" || entry.category === category);
  return (
    <GuideShell wide>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <Crumbs />
        <header className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-display text-3xl font-extrabold leading-[1.45] sm:text-4xl">{MARKETPLACE_INDEX.title}</h1>
            <p className="mt-3 text-[16px] leading-8 text-muted-foreground">اربط تدقيق بنظامك المحاسبي وقنوات فريقك ومساعدك الذكي.</p>
          </div>
          <div role="group" aria-label="الفئة" className="flex flex-wrap gap-1.5">
            {(["all", "accounting", "messaging", "ai"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={category === key}
                onClick={() => setCategory(key)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  category === key ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/30",
                )}
              >
                {key === "all" ? "الكل" : MARKETPLACE_CATEGORY_LABEL[key]}
              </button>
            ))}
          </div>
        </header>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((entry) => (
            <li key={entry.slug}>
              <IntegrationCard item={entry} />
            </li>
          ))}
          <li>
            <RequestCard />
          </li>
        </ul>
      </div>
    </GuideShell>
  );
}

export function MarketplaceDetailPage({ item }: { item: MarketplaceItem }) {
  const related = [...MARKETPLACE.filter((entry) => entry.slug !== item.slug && entry.category === item.category), ...MARKETPLACE.filter((entry) => entry.category !== item.category)].slice(0, 4);
  return (
    <GuideShell wide>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <Crumbs name={item.name} />
        <header className="mt-6 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <StatusPill item={item} />
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-primary-text">{MARKETPLACE_CATEGORY_LABEL[item.category]}</span>
            </p>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.45] sm:text-[2.6rem]">{item.name} مع تدقيق</h1>
            <p className="mt-3 max-w-xl text-[16px] leading-8 text-muted-foreground sm:text-[17px]">{item.summary}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/auth" search={{ mode: "signup" }} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
                ابدأ مجاناً
                <ArrowLeft className="size-4" />
              </Link>
              {item.guide ? (
                <a href={item.guide} className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-foreground/30">
                  <BookOpen className="size-4" />
                  طريقة الربط
                </a>
              ) : null}
            </div>
          </div>
          <IntegrationTile item={item} size="lg" className="rounded-[24px] max-lg:aspect-[16/7]" />
        </header>

        <dl className={cn("mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border", item.facts.length === 3 && "sm:grid-cols-3")}>
          {item.facts.map(([label, value]) => (
            <div key={label} className="bg-card p-4 max-sm:odd:last:col-span-2">
              <dt className="text-[12px] font-semibold text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-[15px] font-bold">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-extrabold">ما الذي يفعله</h2>
            <ul className="mt-4 space-y-3">
              {item.features.map((feature) => (
                <li key={feature} className="flex gap-3 text-[15px] leading-7">
                  <Check className="mt-1.5 size-4 shrink-0 text-success" aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-extrabold">كيف تربطه</h2>
            <ol className="mt-4 space-y-3">
              {item.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-[15px] leading-7">
                  <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <nav aria-label="تكاملات أخرى" className="mt-12">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-extrabold">تكاملات أخرى</h2>
            <Link to="/marketplace" className="text-sm font-semibold text-primary-text hover:underline">
              كل التكاملات
            </Link>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {related.map((entry) => (
              <li key={entry.slug}>
                <IntegrationCard item={entry} />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </GuideShell>
  );
}
