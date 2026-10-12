import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  ArrowUp,
  Calculator,
  Check,
  ChevronDown,
  HandCoins,
  Menu,
  SearchCheck,
  Megaphone,
  Play,
  MessageCircleQuestion,
  Plus,
  Upload,
  Video,
  X,
  FileCheck2,
  Radar,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { isLoginHost } from "@/lib/login-host";
import { isOpsHost } from "@/lib/ops";
import { getRequestHost } from "@/lib/ops.functions";
import {
  CORE_FEATURE_LABELS,
  PLAN_ADDONS,
  PLAN_FEATURES,
  PRICING_TERMS,
  orderBasedPlans,
  planCardItems,
  planComparison,
  planIncludesAddon,
  recommendPlan,
  type ComparisonCell,
  type ComparisonRow,
  type PublicPlan,
} from "@/lib/plans";
import { cn } from "@/lib/utils";
import { listPublicPlans } from "@/lib/plans.functions";
import { LogoMark, LogoWordmark } from "@/components/brand/Logo";
import { LEGAL_COMPANY, LEGAL_DOCS } from "@/lib/legal";
import { productPageFor } from "@/lib/product-pages";
import { ProductsMenu, ProductsMenuList } from "@/components/products/ProductsMenu";
import { PRODUCTS, productTitle, type ProductKey } from "@/lib/products";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OG_IMAGE, SITE_NAME, SITE_NAME_EN, SITE_URL, canonical, jsonLd, socialMeta } from "@/lib/seo";
import { CONTENT_UPDATED, EXPLAINER_VIDEO, FAQS, FEATURES, formatArabicDate } from "@/lib/site-content";
import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { PLATFORM_KEYS } from "@/lib/platforms";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ location }) => {
    const host = typeof window !== "undefined" ? window.location.host : await getRequestHost();
    if (isOpsHost(host)) throw redirect({ to: "/ops" });
    // login.tadqeeq.app opens straight on sign-in (or sign-up with ?mode=signup).
    if (isLoginHost(host)) {
      const mode = (location.search as Record<string, unknown>)["mode"];
      throw redirect({ to: "/auth", search: mode === "signup" || mode === "reset" ? { mode } : {} });
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESCRIPTION },
      ...socialMeta({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/" }),
    ],
    links: [
      canonical("/"),
      // The page's content as plain Markdown, for AI assistants and agents.
      { rel: "alternate", type: "text/markdown", href: "/llms-full.txt", title: "Tadqeeq — full site content" },
    ],
    scripts: [jsonLd(homeSchema(loaderData ?? []))],
  }),
  loader: () => listPublicPlans(),
  errorComponent: () => <Landing plans={[]} />,
  notFoundComponent: () => <Landing plans={[]} />,
  component: LandingRoute,
});

const HOME_TITLE = "تدقيق فواتير هنقرستيشن وجاهز وكيتا للمطاعم | تدقيق";
const HOME_DESCRIPTION =
  "تدقيق يعيد احتساب كل بند في فواتير هنقرستيشن وجاهز وكيتا من ملف طلباتك وعقدك، ويكشف فروقات العمولة والرسوم لكل فرع، ويجهّز مطالبات التعويض بالأدلة.";

/** Header links after the «المنتجات» menu. */
const NAV = [
  ["#how", "كيف يعمل"],
  ["#pricing", "الخطط والأسعار"],
  ["#faq", "الأسئلة"],
  ["/contact", "تواصل معنا"],
] as const;

const FOOTER_GROUPS = [
  {
    title: "المنتج",
    links: [
      ["/products/invoice-reconciliation", productTitle("mutabiq")],
      ["/products/compensation-claims", productTitle("istirdad")],
      ["/products/promotions-roi", productTitle("aaid")],
      ["/products", "كل المنتجات"],
    ],
  },
  {
    title: "أدلة",
    links: [
      ["/guides/keeta-invoice", "مراجعة فاتورة كيتا"],
      ["/guides/hungerstation-compensation", "تعويضات هنقرستيشن"],
      ["/guides/jahez-commission", "عمولة جاهز"],
      ["/guides", "كل الأدلة"],
    ],
  },
  {
    title: "تعرّف على تدقيق",
    links: [
      ["#video", "فيديو تعريفي"],
      ["#how", "كيف يعمل"],
      ["#pricing", "الخطط والأسعار"],
      ["#faq", "الأسئلة الشائعة"],
      ["/contact", "تواصل معنا"],
    ],
  },
] as const;

/** Restaurants using Tadqeeq, shown with their permission. */
const CLIENTS = [
  { name: "باست", logo: "/clients/past.webp" },
  { name: "مورغي", logo: "/clients/morgy.webp" },
  { name: "تكا نون", logo: "/clients/tikka-noon.webp" },
  { name: "ايل كوت", logo: "/clients/el-cote.webp" },
];

/** Plans with a published price, order-based ones when they exist (structured-data offers). */
function publicPrices(plans: PublicPlan[]): PublicPlan[] {
  const ordered = orderBasedPlans(plans);
  return (ordered.length ? ordered : plans).filter((plan) => !plan.customPrice);
}

function homeSchema(plans: PublicPlan[]) {
  return {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      alternateName: SITE_NAME_EN,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      areaServed: "SA",
      email: LEGAL_COMPANY.email,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: LEGAL_COMPANY.email,
        url: `${SITE_URL}/contact`,
        areaServed: "SA",
        availableLanguage: ["ar", "en"],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      inLanguage: "ar-SA",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      alternateName: SITE_NAME_EN,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "ar-SA",
      description: HOME_DESCRIPTION,
      featureList: FEATURES.map((feature) => `${feature.name} (${feature.nameEn})`),
      screenshot: `${SITE_URL}${EXPLAINER_VIDEO.poster}`,
      ...(publicPrices(plans).length
        ? {
            offers: publicPrices(plans).map((plan) => ({
              "@type": "Offer",
              // Google's SoftwareApplication check rejects a nested priceSpecification, so the billing period goes in the name.
              name: `${plan.name} · ${plan.cycle === "yearly" ? "سنوياً" : "شهرياً"}`,
              price: plan.price,
              priceCurrency: "SAR",
              url: `${SITE_URL}/#pricing`,
            })),
          }
        : {}),
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: `${SITE_URL}/`,
      name: HOME_TITLE,
      description: HOME_DESCRIPTION,
      inLanguage: "ar-SA",
      dateModified: CONTENT_UPDATED,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      primaryImageOfPage: OG_IMAGE,
    },
    {
      "@type": "VideoObject",
      name: "جولة في أدوات تدقيق",
      description:
        "مطابقة الفاتورة وخريطة الرسوم والاستثناءات والتعويضات وعائد العروض ورقيب ونَبْض للمتابعة اليومية والقيود المحاسبية والحساب والفريق والأسعار، في أقل من دقيقتين.",
      thumbnailUrl: `${SITE_URL}${EXPLAINER_VIDEO.poster}`,
      contentUrl: `${SITE_URL}${EXPLAINER_VIDEO.src}`,
      uploadDate: EXPLAINER_VIDEO.uploadDate,
      duration: EXPLAINER_VIDEO.durationIso,
      inLanguage: "ar-SA",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
  };
}

const BARS = [
  [82, 74],
  [64, 61],
  [92, 78],
  [55, 54],
];

function LandingRoute() {
  const plans = Route.useLoaderData();
  return <Landing plans={plans} />;
}

/** Reveals `[data-reveal]` elements as they scroll into view. Content stays visible without JS. */
function useScrollReveal() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-shown", "");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) el.setAttribute("data-shown", "");
      else observer.observe(el);
    });
    root.classList.add("lp-ready");
    return () => observer.disconnect();
  }, []);
  return rootRef;
}

function Landing({ plans }: { plans: PublicPlan[] }) {
  const rootRef = useScrollReveal();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasSection = (href: string) => href !== "#pricing" || plans.length > 0;
  const navItems = NAV.filter(([href]) => hasSection(href));

  return (
    <div ref={rootRef} id="top" className="lp-root min-h-screen bg-background" dir="rtl">
      <ExplainerVideoLauncher />
      <div className="flex items-center justify-center gap-3 bg-ink px-4 py-2.5 text-center text-xs text-ink-foreground sm:text-[13px]">
        <span className="lp-pulse shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">جديد</span>
        <span className="hidden sm:inline">«{PRODUCTS.nabd.name}» لمتابعة تكلفة كل منصة يومياً، وقيود محاسبية جاهزة لنظامك</span>
        <span className="sm:hidden">«{PRODUCTS.nabd.name}» لمتابعة تكلفة المنصات يومياً</span>
        <a href="#products" className="shrink-0 font-semibold text-primary">اكتشف الجديد ←</a>
      </div>

      <div className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
        <header className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 rounded-full border border-border bg-card/95 ps-4 pe-2 shadow-[0_12px_32px_-18px_rgb(15_42_34/0.28)] backdrop-blur sm:h-[68px] sm:ps-5">
          <Link to="/" aria-label="تدقيق — الرئيسية" className="flex items-center gap-2.5">
            <LogoWordmark className="h-8 text-ink sm:h-9" />
            <span className="hidden border-s border-border ps-2.5 text-[11px] leading-tight text-muted-foreground sm:block">
              مراجعة فواتير
              <br />
              التوصيل
            </span>
          </Link>
          <nav aria-label="الرئيسية" className="hidden items-center gap-1 rounded-full bg-background p-1 text-sm xl:flex">
            <ProductsMenu triggerClassName="rounded-full px-4 py-2 text-foreground/75 transition-colors hover:bg-card hover:text-foreground hover:shadow-sm" />
            {navItems.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="whitespace-nowrap rounded-full px-4 py-2 text-foreground/75 transition-colors hover:bg-card hover:text-foreground hover:shadow-sm"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <Link to="/auth" className="hidden px-3 py-2 text-sm font-semibold sm:block">
              تسجيل الدخول
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 sm:h-[46px] sm:px-5"
            >
              ابدأ مجاناً
              <ArrowLeft className="size-4" />
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="grid size-11 place-items-center rounded-full hover:bg-muted xl:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </header>
        {menuOpen ? (
          <nav aria-label="القائمة" className="mx-auto mt-2 flex max-w-7xl flex-col rounded-2xl border border-border bg-card p-2 shadow-lg xl:hidden">
            <ProductsMenuList onNavigate={() => setMenuOpen(false)} />
            {navItems.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-muted">
                {label}
              </a>
            ))}
            <Link to="/auth" className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-muted sm:hidden">
              تسجيل الدخول
            </Link>
          </nav>
        ) : null}
      </div>

      <main>
        {/* Hero after the 21st.dev «ChatDeck» and «LeadFlow AI» templates: centred badge, headline with an accent
            line, actions and proof points, then the product shown wide underneath. */}
        <section className="overflow-hidden">
          <div className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 lg:pb-24 lg:pt-16">
            <div className="lp-stagger mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
              <p className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] font-semibold text-primary-text shadow-[0_6px_18px_-12px_rgb(15_42_34/0.35)]">
                <span aria-hidden="true" className="flex">
                  {PLATFORM_KEYS.map((key, i) => (
                    <PlatformIcon key={key} platform={key} className={cn("size-6 rounded-full ring-2 ring-card", i > 0 && "-ms-2")} />
                  ))}
                </span>
                تدقيق فواتير هنقرستيشن وكيتا وجاهز
              </p>
              <h1 className="font-display text-4xl font-extrabold leading-[1.3] sm:text-5xl lg:text-[3.4rem]">
                لا تدفع فاتورة هنقرستيشن أو جاهز أو كيتا <span className="text-primary-text">قبل ما تتأكد منها.</span>
              </h1>
              <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                تدقيق يعيد احتساب كل بند في فاتورة تطبيق التوصيل من ملف طلباتك ومعادلات عقدك، يكشف الفرق لكل فرع، ويجهّز مطالبة التعويض بأدلتها.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="inline-flex h-[52px] items-center gap-2 rounded-full bg-ink px-7 text-[15px] font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
                >
                  ابدأ التدقيق
                  <ArrowLeft className="size-4" />
                </Link>
                <a href="#video" className="inline-flex h-[52px] items-center gap-2 rounded-full border border-border bg-card px-6 text-[15px] font-semibold">
                  <Play className="size-4 fill-current" />
                  شاهد كيف يعمل
                </a>
              </div>
              <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
                {["Excel وCSV وPDF", "بيانات كل شركة منفصلة", "الذكاء الاصطناعي لا يغيّر الأرقام"].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check className="size-4 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto mt-12 max-w-5xl lg:mt-16">
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-10 -top-6 h-40 rounded-full bg-primary/15 blur-3xl" />
              <div className="relative rounded-[24px] border border-border bg-card/60 p-2 shadow-[0_40px_80px_-40px_rgb(15_42_34/0.35)] sm:p-3">
                <HeroDashboard />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border">
          <div>
            <div className="mx-auto max-w-7xl px-4 py-10 text-center sm:px-6">
              <h2 className="text-sm font-semibold text-muted-foreground">مطاعم تراجع فواتيرها مع تدقيق</h2>
              {/* Black and white and moving; under the pointer a logo shows its colours and the strip pauses. Laid out
                  left to right so the track starts at the left edge, and each half is wider than any screen so the
                  loop never shows a gap. */}
              <div dir="ltr" className="lp-marquee-wrap relative mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
                <ul dir="ltr" className="lp-marquee flex w-max items-start">
                  {[0, 1].flatMap((copy) =>
                    Array.from({ length: 6 }, () => CLIENTS).flat().map((client, index) => (
                      <li key={`${copy}-${index}`} aria-hidden={copy === 1 || index >= CLIENTS.length ? true : undefined} className="px-5 sm:px-7">
                        <figure className="group flex flex-col items-center gap-2">
                          <img
                            src={client.logo}
                            alt={copy === 0 && index < CLIENTS.length ? `شعار ${client.name}` : ""}
                            width={80}
                            height={80}
                            loading="lazy"
                            decoding="async"
                            className="size-16 rounded-2xl opacity-75 ring-1 ring-black/5 grayscale transition-[filter,opacity,transform] duration-300 group-hover:-translate-y-0.5 group-hover:opacity-100 group-hover:grayscale-0 sm:size-20"
                          />
                          <figcaption dir="rtl" className="text-xs font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
                            {client.name}
                          </figcaption>
                        </figure>
                      </li>
                    )),
                  )}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <Records />

        <FeatureGrid />

        <Steps />

        {plans.length ? <Pricing plans={plans} /> : null}

        <section id="faq" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-24">
          <SectionIntro title="الأسئلة الشائعة">
            ما يسأله أصحاب المطاعم عادة.
            <span className="mt-2 block text-xs text-muted-foreground">
              آخر تحديث: <time dateTime={CONTENT_UPDATED}>{formatArabicDate(CONTENT_UPDATED)}</time>
            </span>
          </SectionIntro>
          <div data-reveal className="mx-auto mt-12 max-w-3xl border-b border-border">
            {FAQS.map(([q, a], index) => (
              <details key={q} open={index === 0} className="group border-t border-border">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-[15px] font-semibold sm:text-base">
                  <MessageCircleQuestion strokeWidth={1.75} className="size-[18px] shrink-0 text-primary-text" />
                  <span className="flex-1">{q}</span>
                  <Plus className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
                </summary>
                <p className="pb-5 ps-[30px] text-[15px] leading-8 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="final-cta" className="px-4 pb-16 sm:px-6">
          <div
            data-reveal
            className="mx-auto flex max-w-7xl flex-col items-center gap-5 rounded-[28px] bg-ink px-6 py-16 text-center text-ink-foreground sm:py-20"
          >
            <h2 className="font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.75rem]">اعرف ما تقوله فاتورتك الأخيرة فعلاً.</h2>
            <p className="max-w-xl text-base leading-8 text-ink-muted sm:text-lg">
              ارفع ملف الطلبات والفاتورة لفترة واحدة، وشاهد الفروقات لكل فرع قبل أن تدفع.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="inline-flex h-[52px] items-center rounded-full bg-primary px-7 text-[15px] font-bold text-primary-foreground"
              >
                ابدأ التدقيق
              </Link>
              {plans.length ? (
                <a href="#pricing" className="inline-flex h-[52px] items-center rounded-full border border-ink-foreground/35 px-7 text-[15px] font-semibold">
                  شاهد الخطط
                </a>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-4 border-t border-border bg-[oklch(0.957_0.006_154)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] lg:gap-16">
          <div className="flex flex-col items-start gap-4">
            <Link to="/" aria-label="تدقيق — الرئيسية">
              <LogoWordmark className="h-9 text-ink" />
            </Link>
            <p className="max-w-sm text-sm leading-7 text-muted-foreground">
              نعيد احتساب كل بند في فواتير تطبيقات التوصيل من طلباتك وعقدك، ونجهّز مطالبات التعويض بالأدلة لكل فرع.
            </p>
            <ul aria-label="المنصات المدعومة" className="flex flex-wrap gap-2 text-xs font-semibold">
              {PLATFORM_KEYS.map((key) => (
                <li key={key} className="rounded-full border border-border bg-card py-1 ps-1 pe-3">
                  <PlatformName platform={key} iconClassName="size-5 rounded-full" />
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="روابط التذييل" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 xl:grid-cols-5">
            {FOOTER_GROUPS.map((group) => (
              <div key={group.title}>
                <h2 className="text-sm font-bold">{group.title}</h2>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  {group.links
                    .filter(([href]) => hasSection(href))
                    .map(([href, label]) => (
                      <li key={href}>
                        <a href={href} className="transition-colors hover:text-foreground">
                          {label}
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <div>
              <h2 className="text-sm font-bold">الحساب</h2>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li>
                  <Link to="/auth" search={{ mode: "signup" }} className="transition-colors hover:text-foreground">
                    إنشاء حساب
                  </Link>
                </li>
                <li>
                  <Link to="/auth" className="transition-colors hover:text-foreground">
                    تسجيل الدخول
                  </Link>
                </li>
              </ul>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
              >
                ابدأ مجاناً
                <ArrowLeft className="size-3.5" />
              </Link>
            </div>
            <div>
              <h2 className="text-sm font-bold">قانوني</h2>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {LEGAL_DOCS.map((doc) => (
                  <li key={doc.key}>
                    <Link to={doc.path} className="transition-colors hover:text-foreground">
                      {doc.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:px-6">
            <p>
              <span className="num">© {new Date().getFullYear()}</span> تدقيق · مراجعة فواتير التوصيل للمطاعم · صُنع في السعودية
            </p>
            <a href="#top" className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-foreground">
              العودة للأعلى
              <ArrowUp className="size-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const VIDEO_WIDGET_KEY = "tadqeeq:video-widget-minimized";

/**
 * Video widget: a small portrait card in the corner playing a silent preview of the explainer.
 * Clicking it opens the full film with sound in a pop-up (16:9 on wide screens, 9:16 on phones);
 * × folds it into a play circle (remembered for the session). Any #video link opens the pop-up.
 */
function ExplainerVideoLauncher() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMobile(query.matches);
    setAnimate(!motion.matches);
    const onChange = (event: MediaQueryListEvent) => setMobile(event.matches);
    query.addEventListener("change", onChange);
    try {
      setMinimized(window.sessionStorage.getItem(VIDEO_WIDGET_KEY) === "1");
    } catch {
      // Storage unavailable: start expanded.
    }
    const show = window.setTimeout(() => setShown(true), 1200);

    const fromHash = () => {
      if (window.location.hash !== "#video") return;
      setOpen(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => {
      query.removeEventListener("change", onChange);
      window.clearTimeout(show);
      window.removeEventListener("hashchange", fromHash);
    };
  }, []);

  const setMin = (value: boolean) => {
    setMinimized(value);
    try {
      window.sessionStorage.setItem(VIDEO_WIDGET_KEY, value ? "1" : "0");
    } catch {
      // Not remembered across pages.
    }
  };

  return (
    <>
      <div
        className={cn(
          "fixed bottom-4 left-4 z-40 transition-[opacity,transform] duration-500 sm:bottom-6 sm:left-6",
          shown && !open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
        )}
      >
        {minimized ? (
          <button
            type="button"
            onClick={() => setMin(false)}
            aria-label="إظهار فيديو: شاهد كيف يعمل"
            className="relative grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_18px_40px_-12px_rgb(15_42_34/0.6)] ring-4 ring-ink transition-transform hover:scale-105"
          >
            <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-primary/40 [animation-duration:2.4s]" />
            <Play className="relative size-5 fill-current" />
          </button>
        ) : (
          <div className="group relative w-[104px] sm:w-[150px]">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="شاهد كيف يعمل تدقيق (فيديو بالصوت، دقيقة و44 ثانية)"
              className="relative block aspect-[9/16] w-full overflow-hidden rounded-[20px] bg-ink shadow-[0_24px_50px_-16px_rgb(15_42_34/0.65)] ring-[3px] ring-primary transition-transform hover:-translate-y-1"
            >
              {animate ? (
                <video
                  src={EXPLAINER_VIDEO.preview}
                  poster={EXPLAINER_VIDEO.previewPoster}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  aria-hidden="true"
                  className="size-full object-cover object-top"
                />
              ) : (
                <img src={EXPLAINER_VIDEO.previewPoster} alt="" className="size-full object-cover object-top" />
              )}
              <span className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-gradient-to-t from-ink via-ink/85 to-transparent px-2 pb-2.5 pt-10 text-center text-ink-foreground sm:gap-2 sm:pb-3.5">
                <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110 sm:size-11">
                  <Play className="size-4 fill-current sm:size-5" />
                </span>
                <span className="text-[12px] font-bold leading-4 sm:text-sm">شاهد كيف يعمل</span>
                <span className="hidden text-[11px] text-ink-muted sm:block">
                  بالصوت · <span className="num">{EXPLAINER_VIDEO.durationLabel}</span>
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMin(true)}
              aria-label="تصغير الفيديو"
              className="absolute -top-2.5 -right-2.5 grid size-7 place-items-center rounded-full bg-card text-foreground shadow-md ring-1 ring-border hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            "w-auto max-w-none gap-0 overflow-hidden rounded-[22px] border-0 bg-ink p-0 shadow-2xl [&>button:last-child]:hidden",
            mobile ? "h-[min(84vh,calc(92vw*16/9))] aspect-[9/16]" : "w-[min(92vw,1120px)] aspect-video",
          )}
        >
          <DialogTitle className="sr-only">كيف يشتغل تدقيق</DialogTitle>
          <DialogDescription className="sr-only">فيديو تعريفي مدته دقيقة و44 ثانية.</DialogDescription>
          {open ? (
            <video
              key={mobile ? "mobile" : "wide"}
              src={mobile ? EXPLAINER_VIDEO.mobileSrc : EXPLAINER_VIDEO.src}
              poster={mobile ? EXPLAINER_VIDEO.mobilePoster : EXPLAINER_VIDEO.poster}
              controls
              autoPlay
              playsInline
              className="size-full bg-ink object-contain"
            />
          ) : null}
          <DialogClose
            aria-label="إغلاق الفيديو"
            className="absolute end-3 top-3 grid size-10 place-items-center rounded-full bg-ink/70 text-ink-foreground backdrop-blur transition-colors hover:bg-ink"
          >
            <X className="size-5" />
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionIntro({
  eyebrow,
  title,
  heading = "h2",
  children,
}: {
  /** Small pill above the title (ChatDeck's «Pricing Plans»); use on few sections only. */
  eyebrow?: string;
  title: string;
  /** "aria" keeps heading semantics without a second <h2> when a section renders its intro twice (desktop + phone). */
  heading?: "h2" | "aria";
  children?: ReactNode;
}) {
  const titleClass = "font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]";
  return (
    <div data-reveal className="mx-auto flex max-w-3xl flex-col items-center text-center">
      {eyebrow ? (
        <p className="mb-4 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary-text">{eyebrow}</p>
      ) : null}
      {heading === "h2" ? (
        <h2 className={titleClass}>{title}</h2>
      ) : (
        <p role="heading" aria-level={2} className={titleClass}>
          {title}
        </p>
      )}
      {children ? <div className="mt-4 flex flex-col text-base leading-8 text-muted-foreground sm:text-[17px]">{children}</div> : null}
    </div>
  );
}

function HeroDashboard() {
  return (
    <div aria-hidden="true" className="lp-slide flex overflow-hidden rounded-[18px] border border-border bg-card">
      <div className="hidden w-14 shrink-0 flex-col items-center gap-4 bg-ink pt-5 sm:flex">
        <LogoMark className="h-6 text-ink-foreground" />
        {[0.5, 0.3, 0.3, 0.3].map((o, i) => (
          <span key={i} className="h-[3px] w-[18px] rounded-sm bg-ink-foreground" style={{ opacity: o }} />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-primary-text">اللوحة التنفيذية</p>
            <p className="mt-1 flex items-center gap-2 font-display text-lg font-bold">
              <PlatformName platform="jahez" iconClassName="size-6 rounded-md" /> · سبتمبر
            </p>
          </div>
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">مثال توضيحي</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <div className="lp-pulse rounded-xl bg-ink p-3.5 text-ink-foreground">
            <p className="text-[11px] text-ink-muted">فرق لصالحك</p>
            <p className="num mt-1.5 text-xl font-semibold text-primary">2,638.25</p>
            <p className="mt-1 text-[11px] text-ink-muted">جاهز للمطالبة</p>
          </div>
          <MiniKpi label="المبيعات" value="184,320" />
          <MiniKpi label="خصومات المنصة" value="41,905" />
          <MiniKpi label="استثناءات مفتوحة" value="3" bad />
        </div>
        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="flex flex-col rounded-xl border border-border p-3.5">
            <p className="text-xs font-semibold">المستحق مقابل المحوّل · حسب الفرع</p>
            <div className="flex h-36 items-end gap-4 px-1 pt-3">
              {BARS.map(([due, paid], index) => (
                <div key={index} className="flex h-full flex-1 items-end gap-1">
                  <span
                    className="lp-bar flex-1 rounded-t bg-chart-2"
                    style={{ height: `${due}%`, animationDelay: `${0.6 + index * 0.15}s, ${2 + index * 0.2}s` }}
                  />
                  <span
                    className="lp-bar flex-1 rounded-t bg-primary"
                    style={{ height: `${paid}%`, animationDelay: `${0.6 + index * 0.15}s, ${2 + index * 0.2}s` }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3.5 text-xs">
            <p className="font-semibold">أحدث الفروقات</p>
            {[
              ["عمولة أعلى من العقد", "حرج", true],
              ["تعويض على فرع خاطئ", "تحذير", false],
              ["رسوم غير مصنفة", "تحذير", false],
            ].map(([label, level, critical], index) => (
              <div
                key={String(label)}
                className={cn("flex justify-between rounded-lg px-2.5 py-2", critical ? "lp-pulse bg-secondary" : "lp-in bg-background")}
                style={{ animationDelay: `${1 + index * 0.2}s` }}
              >
                <span>{label}</span>
                <span className={critical ? "font-semibold text-primary-text" : "text-muted-foreground"}>{level}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-3.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("num mt-1.5 text-xl font-semibold", bad && "text-destructive")}>{value}</p>
    </div>
  );
}

type FlowStep = { title: string; who: string; body: string; detail: string; icon: LucideIcon };

const HOW_FLOW: FlowStep[] = [
  {
    title: "ارفع الملفات",
    who: "مرة كل فترة · دقيقتان",
    body: "ارفع ملف الطلبات من بوابة التاجر وفاتورة المنصة لنفس الفترة بصيغتها الأصلية: Excel أو CSV أو PDF.",
    detail: "يتعرّف تدقيق على المنصة والفترة والفروع تلقائياً، وإن غيّرت المنصة صيغة ملفها يظهر تنبيه بدلاً من نتيجة غير موثوقة.",
    icon: Upload,
  },
  {
    title: "نعيد الاحتساب",
    who: "المحرك المحاسبي · تلقائياً",
    body: "محرك ثابت يعيد بناء كل بند في الفاتورة من الطلبات نفسها، بمعادلات عقدك النافذ في تاريخ كل طلب.",
    detail: "نفس الملفات تعطي نفس النتيجة دائماً، وكل احتساب يُحفظ برقم نسخة المحرك وإصدار العقد.",
    icon: Calculator,
  },
  {
    title: "راجع الفروقات",
    who: "في «رادار»",
    body: "كل فرق يتحول إلى استثناء بخطورته ومصدره ومعادلته والسطر المقابل في الفاتورة، ويُسند لمسؤول بحالة واضحة.",
    detail: "الحالات: جديد ← قيد المراجعة ← تم التواصل ← تم الاعتراض ← تم الاسترداد، ويشرح Tadqeeq AI أي فرق دون أن يغيّر رقمه.",
    icon: SearchCheck,
  },
  {
    title: "استرد وأغلق",
    who: "نهاية الفترة",
    body: "جهّز مطالبة الاسترداد بأدلتها، ثم أغلق الفترة لتُحفظ في الفترات السابقة بسجل كامل قابل للمراجعة.",
    detail: "يمكن إعادة تحليل أي فترة لاحقاً عند تحديث العقد، مع بقاء النتيجة الأصلية محفوظة للمقارنة.",
    icon: HandCoins,
  },
];

/** Facts about the product (no customer counts or amounts), after LeadFlow AI's «Our Records» strip. */
const RECORDS: Array<[value: string, label: string]> = [
  ["3", "منصات توصيل: هنقرستيشن وجاهز وكيتا"],
  ["بلا حدود", "فروع ومنصات ومستخدمون في كل الباقات"],
  ["Excel · CSV · PDF", "ملفاتك كما تصدر من بوابة التاجر"],
  ["0", "تغيير من الذكاء الاصطناعي على أرقامك"],
];

function Records() {
  return (
    <section aria-label="تدقيق بالأرقام" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
      <dl data-reveal className="grid overflow-hidden rounded-[24px] border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
        {RECORDS.map(([value, label], index) => (
          <div
            key={label}
            className={cn(
              "flex flex-col gap-2 border-border p-6 text-center sm:p-8",
              index < RECORDS.length - 1 && "border-b sm:border-b-0",
              index % 2 === 0 && "sm:border-e",
              index < 2 && "sm:border-b lg:border-b-0",
              index < RECORDS.length - 1 && "lg:border-e",
            )}
          >
            <dt className="order-2 text-sm leading-6 text-muted-foreground">{label}</dt>
            <dd className={cn("num order-1 font-display font-extrabold text-ink", value.length > 8 ? "text-2xl leading-[2.25rem]" : "text-3xl")}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The products, one card each, after ChatDeck's «Why choose» grid; each opens its own page. */
const FEATURE_CARDS: Array<{ key: ProductKey; icon: LucideIcon }> = [
  { key: "mutabiq", icon: FileCheck2 },
  { key: "kashif", icon: ReceiptText },
  { key: "radar", icon: Radar },
  { key: "istirdad", icon: HandCoins },
  { key: "aaid", icon: Megaphone },
  { key: "nabd", icon: Activity },
];

function FeatureGrid() {
  return (
    <section id="features" className="bg-[oklch(0.957_0.006_154)]">
      <div id="products" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionIntro title="كل خصم في فاتورتك، مُراجَع ومفسَّر.">منصة واحدة تراجع الفاتورة، وتتابع الفروقات، وتسترد حقك.</SectionIntro>
        {/* One block split by hairlines, after ChatDeck's feature grid: the gaps show the border colour. */}
        <div data-reveal className="mt-12 grid gap-px overflow-hidden rounded-[24px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_CARDS.map(({ key, icon: Icon }) => {
            const page = productPageFor(key);
            return (
              <a
                key={key}
                href={page?.path ?? "#pricing"}
                className="group flex flex-col gap-3 bg-card p-7 transition-colors duration-200 hover:bg-secondary/40"
              >
                <Icon strokeWidth={1.75} className="size-6 text-primary-text" />
                <div>
                  <h3 className="font-display text-lg font-extrabold">
                    {PRODUCTS[key].name} <span className="text-sm font-semibold text-muted-foreground">· {PRODUCTS[key].descriptor}</span>
                  </h3>
                  <p className="mt-2 text-[15px] leading-7 text-foreground/80">{page?.summary}</p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary-text">
                  اعرف أكثر
                  <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** How it works in four numbered steps (the header's «كيف يعمل» link lands here). */
function Steps() {
  return (
    <section id="how" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
      <SectionIntro title="أربع خطوات. بدون جداول يدوية.">من الملف إلى الاسترداد، في نفس المكان.</SectionIntro>
      <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HOW_FLOW.map((step, index) => (
          <li key={step.title} data-reveal className="flex flex-col gap-3 rounded-[22px] border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-ink text-ink-foreground">
                <step.icon strokeWidth={1.75} className="size-5" />
              </span>
              <span className="num text-sm font-semibold text-muted-foreground">0{index + 1}</span>
            </div>
            <h3 className="font-display text-lg font-extrabold">{step.title}</h3>
            <p className="text-sm leading-7 text-foreground/80">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Stops on the orders slider; each plan's own limit is added, so every plan can be landed on exactly. */
const ORDER_STEPS = [1000, 2000, 3000, 5000, 8000, 12000, 16000, 20000, 25000, 30000, 40000, 50000, 60000, 80000, 100000, 150000];

/** Slider stops up to the largest plan limit, then one stop past it for "more than". */
function orderSteps(plans: PublicPlan[]): number[] {
  const limits = plans.map((plan) => plan.orderLimit).filter((limit): limit is number => limit !== null);
  const largest = Math.max(0, ...limits);
  if (!largest) return ORDER_STEPS;
  const steps = [...new Set([...ORDER_STEPS.filter((step) => step < largest), ...limits])].sort((a, b) => a - b);
  return [...steps, largest + 1];
}

function Pricing({ plans }: { plans: PublicPlan[] }) {
  const ordered = orderBasedPlans(plans);
  return ordered.length ? <OrderPricing plans={ordered} /> : <LegacyPricing plans={plans} />;
}

/** Plans priced by orders checked per month, with a calculator that points to the right one. */
function OrderPricing({ plans }: { plans: PublicPlan[] }) {
  const [cycle, setCycle] = useState<PublicPlan["cycle"]>("monthly");
  const [orders, setOrders] = useState<number | null>(null);
  const recommended = orders !== null ? recommendPlan(plans, orders) : null;
  const yearly = cycle === "yearly";
  const largestLimit = Math.max(0, ...plans.map((plan) => plan.orderLimit ?? 0));
  const steps = orderSteps(plans);
  // Before the visitor moves the slider it rests on the most chosen plan's limit; cards only change once they do.
  const restingOrders = plans.find((plan) => plan.highlighted)?.orderLimit ?? steps[Math.floor(steps.length / 2)] ?? 0;
  const sliderOrders = orders ?? restingOrders;
  const sliderIndex = Math.max(0, steps.findIndex((step) => step >= sliderOrders));
  const sliderPlan = recommendPlan(plans, sliderOrders);
  const beyond = largestLimit > 0 && sliderOrders > largestLimit;
  const fill = steps.length > 1 ? (sliderIndex / (steps.length - 1)) * 100 : 0;
  const sliderPrice = sliderPlan && !sliderPlan.customPrice ? (yearly && sliderPlan.priceYearly !== null ? sliderPlan.priceYearly : sliderPlan.price) : null;
  const bundled = (plan: PublicPlan) => PLAN_ADDONS.some((addon) => planIncludesAddon(plan.features, addon.key));
  const addonFor = plans.filter((plan) => !bundled(plan) && !plan.customPrice).map((plan) => plan.name);
  const addonIn = plans.filter(bundled).map((plan) => plan.name);
  const comparison = planComparison(plans);
  const addon = PLAN_ADDONS[0];
  const featured = (plan: PublicPlan) => recommended?.id === plan.id || (recommended === null && plan.highlighted);

  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
      {/* The whole pricing block sits in one soft panel with a centred header, after ChatDeck's pricing. */}
      <div className="rounded-[32px] border border-border bg-[oklch(0.957_0.006_154)] px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
      <div className="flex flex-col items-center gap-6">
        <SectionIntro eyebrow="الخطط والأسعار" title="ادفع حسب طلباتك، لا حسب فروعك.">
          فروع ومنصات ومستخدمون بلا حدود في كل الباقات. ابدأ بتجربة مجانية بدون بطاقة، ثم اختر الباقة على قدّ طلباتك الشهرية.
        </SectionIntro>
        <div role="group" aria-label="دورة الفوترة" className="flex rounded-full bg-muted p-1 text-sm">
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={cycle === value}
              onClick={() => setCycle(value)}
              className={cn("rounded-full px-5 py-2.5", cycle === value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
            >
              {value === "monthly" ? "شهري" : "سنوي · شهران مجاناً"}
            </button>
          ))}
        </div>
      </div>

      {/* Orders calculator after the Loops pricing slider (21st.dev «PricingSlider Loops»): drag to your monthly
          orders, the plan that fits and its price update beside it. */}
      <div data-reveal className="mt-10 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col rounded-[22px] border border-border bg-card p-6 sm:p-8">
          <label htmlFor="pricing-orders" className="text-[15px] font-semibold">
            كم طلب يصلك شهرياً من كل تطبيقات التوصيل؟
          </label>
          <p className="mt-4 font-display text-[28px] font-extrabold leading-tight sm:text-[34px]" aria-live="polite">
            {beyond ? "أكثر من " : "حتى "}
            <span className="num">{(beyond ? largestLimit : sliderOrders).toLocaleString("en-US")}</span> طلب
          </p>
          <input
            id="pricing-orders"
            type="range"
            dir="rtl"
            min={0}
            max={steps.length - 1}
            step={1}
            value={sliderIndex}
            aria-valuetext={`${beyond ? "أكثر من" : "حتى"} ${(beyond ? largestLimit : sliderOrders).toLocaleString("en-US")} طلب شهرياً`}
            onChange={(event) => setOrders(steps[Number(event.target.value)] ?? null)}
            style={{ "--fill": `${fill}%` } as CSSProperties}
            className="lp-range mt-8 w-full"
          />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
            <span className="num">{(steps[0] ?? 0).toLocaleString("en-US")}</span>
            <span>
              {largestLimit ? (
                <>
                  <span className="num">{largestLimit.toLocaleString("en-US")}</span>+
                </>
              ) : null}
            </span>
          </div>
          <p className="mt-auto pt-8 text-sm text-muted-foreground">
            فروع ومنصات ومستخدمون بلا حدود في كل الباقات، فلا يتغيّر السعر إلا بعدد الطلبات.
          </p>
        </div>

        <div className="flex flex-col rounded-[22px] bg-ink p-6 text-ink-foreground sm:p-8">
          <p className="text-[15px] font-semibold text-ink-muted">الباقة المناسبة لك</p>
          {sliderPlan ? (
            <>
              <h3 className="mt-4 font-display text-[28px] font-extrabold leading-tight sm:text-[34px]">{sliderPlan.name}</h3>
              {sliderPrice !== null ? (
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-[2.2rem] font-semibold leading-none">{sliderPrice.toLocaleString("en-US")}</span>
                  <span className="text-sm text-ink-muted">
                    ر.س / {yearly && sliderPlan.priceYearly !== null ? "سنوياً" : "شهرياً"}
                  </span>
                </p>
              ) : (
                <p className="mt-3 font-display text-2xl font-extrabold">بالاتفاق</p>
              )}
              <div className="mt-auto pt-8">
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground"
                >
                  {sliderPlan.customPrice ? "تواصل معنا" : "ابدأ تجربتك المجانية"}
                  <ArrowLeft className="size-4" />
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "mt-6 grid items-stretch gap-4 sm:grid-cols-2",
          plans.length <= 3 ? "lg:grid-cols-3" : plans.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5",
        )}
      >
        {plans.map((plan, index) => {
          const fit = recommended?.id === plan.id;
          const dark = fit || (recommended === null && plan.highlighted);
          const price = yearly && plan.priceYearly !== null ? plan.priceYearly : plan.price;
          return (
            <article
              key={plan.id}
              className={cn(
                "relative flex flex-col gap-4 rounded-[22px] p-6 transition-colors",
                dark ? "bg-ink text-ink-foreground shadow-[0_30px_60px_-30px_rgb(15_42_34/0.5)]" : "border border-border bg-card",
              )}
            >
              {fit || (recommended === null && plan.highlighted) ? (
                <span className="absolute -top-3 start-6 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                  {fit ? "الأنسب لطلباتك" : "الأكثر اختياراً"}
                </span>
              ) : null}
              <div>
                <h3 className="font-display text-xl font-extrabold">{plan.name}</h3>
                <p className={cn("mt-1 text-sm", dark ? "text-ink-muted" : "text-muted-foreground")}>
                  {plan.orderLimit !== null || plan.customPrice ? (
                    <>
                      {plan.customPrice ? "أكثر من" : "حتى"} <span className="num">{(plan.orderLimit ?? largestLimit).toLocaleString("en-US")}</span> طلب شهرياً
                    </>
                  ) : (
                    "طلبات بلا حدود"
                  )}
                </p>
              </div>
              {plan.customPrice ? (
                <p className="font-display text-2xl font-extrabold">بالاتفاق</p>
              ) : (
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-[2.2rem] font-semibold leading-none">{price.toLocaleString("en-US")}</span>
                  <span className={cn("text-sm", dark ? "text-ink-muted" : "text-muted-foreground")}>
                    ر.س / {yearly && plan.priceYearly !== null ? "سنوياً" : "شهرياً"}
                  </span>
                </p>
              )}
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className={cn(
                  "inline-flex h-11 items-center justify-center rounded-full text-sm font-bold",
                  dark ? "bg-primary text-primary-foreground" : "bg-ink text-ink-foreground",
                )}
              >
                {plan.customPrice ? "تواصل معنا" : "ابدأ تجربتك المجانية"}
              </Link>
              <PlanCardFeatures plans={plans} index={index} dark={dark} addonOffered={!bundled(plan) && !plan.customPrice && !!addon} />
            </article>
          );
        })}
      </div>

      <PlanComparisonTable plans={plans} rows={comparison} featured={featured} yearly={yearly} />

      <div className="mt-6 grid gap-4">
        {PLAN_ADDONS.map((addon) => (
          <div key={addon.key} data-reveal className="rounded-[22px] bg-secondary p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
            <div>
            <p className="text-xs font-semibold text-primary-text">
              {addonFor.length ? `إضافة اختيارية ${addonFor.length === 1 ? "لباقة" : addonFor.length === 2 ? "لباقتي" : "لباقات"} ${addonFor.join(" و")}` : "إضافة اختيارية"}
              {addonIn.length ? ` · مشمولة في ${addonIn.join(" و")}` : ""}
            </p>
            <p className="mt-2 font-display text-lg font-extrabold leading-8">{addon.label}</p>
            <p className="mt-2 text-sm leading-7 text-foreground/80">
              اعترض على التعويضات بفيديو من قروب الفرع، واسأل عن أرقامك بلغة بسيطة، ودقّق فواتيرك من داخل Claude و ChatGPT.
            </p>
            </div>
            <p className="mt-3 shrink-0 font-semibold sm:mt-0">
              <span className="num text-2xl">{addon.price.toLocaleString("en-US")}</span> ر.س كل {addon.months} أشهر
            </p>
          </div>
        ))}
      </div>

      <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        {PRICING_TERMS.map((term) => (
          <li key={term}>· {term}</li>
        ))}
      </ul>
      </div>
    </section>
  );
}

/** What a plan card includes: its own list, or "everything in the previous plan" plus what it adds. */
function PlanCardFeatures({ plans, index, dark, addonOffered }: { plans: PublicPlan[]; index: number; dark: boolean; addonOffered: boolean }) {
  const { basedOn, items } = planCardItems(plans, index);
  const addon = PLAN_ADDONS[0];
  return (
    <div className={cn("mt-1 border-t pt-4 text-sm", dark ? "border-ink-foreground/15" : "border-border")}>
      {basedOn ? (
        <p className="font-semibold">{items.length ? `كل ما في ${basedOn}، و:` : `كل ما في ${basedOn}، مع حد طلبات أعلى.`}</p>
      ) : (
        <p className="font-semibold">تشمل:</p>
      )}
      {items.length ? (
        <ul className="mt-3 space-y-2.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 leading-6">
              <Check className={cn("mt-0.5 size-4 shrink-0", dark ? "text-primary" : "text-success")} />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {addonOffered && addon ? (
        <p className={cn("mt-3 flex gap-2.5 leading-6", dark ? "text-ink-muted" : "text-muted-foreground")}>
          <Plus className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="block font-semibold">
              إضافة اختيارية · <span className="num">{addon.price.toLocaleString("en-US")}</span> ر.س كل {addon.months} أشهر
            </span>
            <span className="block">«استرداد» للتعويضات، و Tadqeeq AI، والتدقيق من Claude و ChatGPT</span>
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** Every feature against every plan, so a restaurant can compare at a glance. */
function PlanComparisonTable({
  plans,
  rows,
  featured,
  yearly,
}: {
  plans: PublicPlan[];
  rows: ComparisonRow[];
  featured: (plan: PublicPlan) => boolean;
  yearly: boolean;
}) {
  return (
    <div data-reveal className="mt-10">
      <h3 className="font-display text-xl font-extrabold">قارن الباقات</h3>
      <div className="mt-4 overflow-x-auto rounded-[22px] border border-border bg-card">
        <table className="w-full table-fixed text-[12.5px] sm:text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="w-[34%] p-2.5 text-start font-semibold text-muted-foreground sm:w-[40%] sm:p-4">
                الميزة
              </th>
              {plans.map((plan) => {
                const price = yearly && plan.priceYearly !== null ? plan.priceYearly : plan.price;
                return (
                  <th key={plan.id} scope="col" className={cn("p-2 text-center align-bottom sm:p-4", featured(plan) && "bg-secondary")}>
                    <span className="block font-display text-sm font-extrabold sm:text-base">{plan.name}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {plan.customPrice ? (
                        "بالاتفاق"
                      ) : (
                        <>
                          <span className="num">{price.toLocaleString("en-US")}</span> ر.س / {yearly && plan.priceYearly !== null ? "سنوياً" : "شهرياً"}
                        </>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/70 last:border-0">
                <th scope="row" className="p-2.5 text-start font-medium leading-6 sm:p-4">
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td key={plans[index]!.id} className={cn("p-2 text-center sm:p-4", featured(plans[index]!) && "bg-secondary/60")}>
                    <ComparisonValue cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonValue({ cell }: { cell: ComparisonCell }) {
  if (cell.kind === "yes") return <Check aria-label="مشمول" className="mx-auto size-5 text-success" />;
  if (cell.kind === "no") return <span aria-label="غير متاح" className="text-muted-foreground">—</span>;
  if (cell.kind === "addon") {
    // "إضافة · 399 ر.س / 4 أشهر" → the word on one line and the price under it, so it fits a phone column.
    const [word, price] = cell.text.split(" · ");
    return (
      <span className="text-xs font-semibold leading-5 text-primary-text">
        {word}
        {price ? <span className="block font-normal">{price.split(/(\d[\d,]*)/).map((part, i) => (/^\d/.test(part) ? <span key={i} className="num">{part}</span> : part))}</span> : null}
      </span>
    );
  }
  return <span className="font-semibold">{cell.text.split(/(\d[\d,]*)/).map((part, i) => (/^\d/.test(part) ? <span key={i} className="num">{part}</span> : part))}</span>;
}

function LegacyPricing({ plans }: { plans: PublicPlan[] }) {
  const cycles = [...new Set(plans.map((plan) => plan.cycle))];
  const [cycle, setCycle] = useState<PublicPlan["cycle"]>(cycles.includes("monthly") ? "monthly" : "yearly");
  const visible = cycles.length > 1 ? plans.filter((plan) => plan.cycle === cycle) : plans;

  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
      {/* The whole pricing block sits in one soft panel with a centred header, after ChatDeck's pricing. */}
      <div className="rounded-[32px] border border-border bg-[oklch(0.957_0.006_154)] px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
      <div className="flex flex-col items-center gap-6">
        <SectionIntro eyebrow="الخطط والأسعار" title="خطة تناسب حجم مطعمك.">
          كل الخطط تشمل اللوحة التنفيذية ورفع ملفات المنصات الثلاث والصلاحيات.
        </SectionIntro>
        {cycles.length > 1 ? (
          <div role="group" aria-label="دورة الفوترة" className="flex rounded-full bg-muted p-1 text-sm">
            {(["monthly", "yearly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={cycle === value}
                onClick={() => setCycle(value)}
                className={cn(
                  "rounded-full px-5 py-2.5",
                  cycle === value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground",
                )}
              >
                {value === "monthly" ? "شهري" : "سنوي"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-12 grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((plan, index) => (
          <article
            key={plan.id}
            data-reveal
            style={{ transitionDelay: `${index * 0.1}s` }}
            className={cn(
              "relative flex flex-col gap-5 rounded-[22px] p-7",
              plan.highlighted
                ? "bg-ink text-ink-foreground shadow-[0_30px_60px_-30px_rgb(15_42_34/0.5)]"
                : "border border-border bg-card",
            )}
          >
            {plan.highlighted ? (
              <span className="lp-shine absolute -top-3 start-7 z-10 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                الأكثر اختياراً
              </span>
            ) : null}
            <div className={cn("flex flex-col gap-5", plan.highlighted && "lp-float-slow")}>
              <div>
                <h3 className="font-display text-xl font-extrabold">{plan.name}</h3>
                {plan.description ? (
                  <p className={cn("mt-2 text-sm leading-7", plan.highlighted ? "text-ink-muted" : "text-muted-foreground")}>{plan.description}</p>
                ) : null}
              </div>
              <p className="flex items-baseline gap-2">
                <span className="num text-[2.6rem] font-semibold leading-none">{plan.price.toLocaleString("en-US")}</span>
                <span className={cn("text-sm", plan.highlighted ? "text-ink-muted" : "text-muted-foreground")}>
                  ر.س / {plan.cycle === "yearly" ? "سنوياً" : "شهرياً"}
                </span>
              </p>
              <p className={cn("rounded-[10px] px-3 py-2.5 text-[13px]", plan.highlighted ? "bg-ink-foreground/10 text-ink-muted" : "bg-background text-muted-foreground")}>
                {plan.uploadLimit === null ? "رفع ملفات بلا حدود" : `حتى ${plan.uploadLimit} عمليات رفع شهرياً`}
              </p>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className={cn(
                  "inline-flex h-12 items-center justify-center rounded-full text-[15px] font-bold",
                  plan.highlighted ? "bg-primary text-primary-foreground" : "bg-ink text-ink-foreground",
                )}
              >
                اختر {plan.name}
              </Link>
              <ul className="space-y-3 text-sm">
                {CORE_FEATURE_LABELS.map((label) => (
                  <li key={label} className="flex gap-2.5">
                    <Check className={cn("size-4 shrink-0", plan.highlighted ? "text-primary" : "text-success")} />
                    {label}
                  </li>
                ))}
                {PLAN_FEATURES.map((feature) => {
                  const on = plan.features.includes(feature.key);
                  return (
                    <li key={feature.key} className={cn("flex gap-2.5", !on && "line-through opacity-45")}>
                      {on ? (
                        <Check className={cn("size-4 shrink-0", plan.highlighted ? "text-primary" : "text-success")} />
                      ) : (
                        <X className="size-4 shrink-0" />
                      )}
                      {feature.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          </article>
        ))}
      </div>
      </div>
    </section>
  );
}
