import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUp,
  Calculator,
  Check,
  ChevronDown,
  HandCoins,
  Menu,
  SearchCheck,
  Play,
  Plus,
  Upload,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { MotionConfig, motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

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
import { LogoWordmark } from "@/components/brand/Logo";
import { LEGAL_COMPANY, LEGAL_DOCS } from "@/lib/legal";
import { productPageFor } from "@/lib/product-pages";
import { AssistantBeams } from "@/components/home/AssistantBeams";
import { ProductIcon } from "@/components/products/ProductIcon";
import { ProductsMenu, ProductsMenuList } from "@/components/products/ProductsMenu";
import { PRODUCTS, productTitle, type ProductKey } from "@/lib/products";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
      ["#products", "المنتجات"],
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

/**
 * The homepage, after the 21st.dev «Event Dashboard Hero» (anelkabag/hero4) in Tadqeeq's colours, fonts and RTL:
 * a quiet header that settles into a bar once the page moves, a split hero with an animated invoice-check card,
 * the client logos, four steps, one card per product (each opens its own page), pricing, questions and a closing
 * call to action.
 */
function Landing({ plans }: { plans: PublicPlan[] }) {
  const rootRef = useScrollReveal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const hasSection = (href: string) => href !== "#pricing" || plans.length > 0;
  const navItems = NAV.filter(([href]) => hasSection(href));

  // The header gains its bar once the top of the page has scrolled away (no scroll listener).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry?.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} id="top" className="lp-root min-h-screen bg-background" dir="rtl">
      <ExplainerVideoLauncher />
      <span ref={sentinelRef} aria-hidden="true" className="absolute top-0 h-px w-px" />

      <header
        className={cn(
          "sticky top-0 z-40 transition-[background-color,box-shadow] duration-300",
          scrolled ? "bg-background/90 shadow-[0_1px_0_0_rgb(19_35_43/0.08)] backdrop-blur-md" : "bg-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px]">
          <div className="flex items-center gap-8">
            <Link to="/" aria-label="تدقيق: الرئيسية" className="flex items-center">
              <LogoWordmark className="h-8 text-ink sm:h-9" />
            </Link>
            <nav aria-label="الرئيسية" className="hidden items-center gap-0.5 text-sm font-medium xl:flex">
              <ProductsMenu triggerClassName="rounded-md px-3 py-1.5 text-foreground/70 transition-colors hover:bg-ink/5 hover:text-foreground" />
              {navItems.map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="whitespace-nowrap rounded-md px-3 py-1.5 text-foreground/70 transition-colors hover:bg-ink/5 hover:text-foreground"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <Link to="/auth" className="hidden px-3.5 py-1.5 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground sm:block">
              تسجيل الدخول
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-semibold text-ink-foreground transition-[background-color,transform] hover:bg-ink/90 active:scale-[0.98]"
            >
              ابدأ مجاناً
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="grid size-10 place-items-center rounded-md text-foreground/70 hover:bg-ink/5 xl:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {menuOpen ? (
          <nav aria-label="القائمة" className="border-t border-border bg-background px-4 pb-4 pt-2 xl:hidden">
            <ProductsMenuList onNavigate={() => setMenuOpen(false)} />
            {navItems.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block rounded-md px-3 py-2.5 text-sm font-medium hover:bg-ink/5">
                {label}
              </a>
            ))}
            <div className="mt-2 border-t border-border pt-3 sm:hidden">
              <Link to="/auth" className="block rounded-md px-3 py-2.5 text-sm font-medium hover:bg-ink/5">
                تسجيل الدخول
              </Link>
            </div>
          </nav>
        ) : null}
      </header>

      <main>
        <Hero />

        <section aria-labelledby="clients-title" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <h2 id="clients-title" className="text-center text-sm font-medium text-muted-foreground">
            مطاعم تراجع فواتيرها مع تدقيق
          </h2>
          <ul className="mt-6 flex flex-wrap items-start justify-center gap-x-10 gap-y-6">
            {CLIENTS.map((client) => (
              <li key={client.name}>
                <figure className="group flex flex-col items-center gap-2">
                  <img
                    src={client.logo}
                    alt={`شعار ${client.name}`}
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="size-14 rounded-2xl opacity-70 ring-1 ring-ink/10 grayscale transition-[filter,opacity] duration-300 group-hover:opacity-100 group-hover:grayscale-0 sm:size-16"
                  />
                  <figcaption className="text-xs font-medium text-muted-foreground">{client.name}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        <HowItWorks />

        <ProductsGrid />

        <AssistantSection />

        {plans.length ? <Pricing plans={plans} /> : null}

        <section id="faq" className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] lg:py-24">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionIntro title="قبل أن تبدأ">
              ما يسأله أصحاب المطاعم عادة.
              <span className="mt-4 block text-xs text-muted-foreground">
                آخر تحديث: <time dateTime={CONTENT_UPDATED}>{formatArabicDate(CONTENT_UPDATED)}</time>
              </span>
            </SectionIntro>
          </div>
          <div data-reveal className="overflow-hidden rounded-2xl border border-border bg-card">
            {FAQS.map(([q, a], index) => (
              <details key={q} open={index === 0} className="group border-t border-border first:border-t-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-semibold transition-colors hover:bg-muted/50 sm:px-6 sm:text-[17px]">
                  <span>{q}</span>
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="max-w-2xl px-5 pb-5 text-[15px] leading-8 text-muted-foreground sm:px-6">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="final-cta" className="px-4 pb-16 sm:px-6">
          <div
            data-reveal
            className="relative mx-auto flex max-w-7xl flex-col items-center gap-5 overflow-hidden rounded-[24px] bg-ink px-6 py-16 text-center text-ink-foreground sm:py-20"
          >
            <GridPattern className="opacity-[0.07] [--grid-line:var(--ink-foreground)]" />
            <h2 className="relative font-display text-3xl font-bold leading-[1.4] sm:text-[2.6rem]">اعرف ما تقوله فاتورتك الأخيرة فعلاً.</h2>
            <p className="relative max-w-xl text-base leading-8 text-ink-muted sm:text-lg">
              ارفع ملف الطلبات والفاتورة لفترة واحدة، وشاهد الفروقات لكل فرع قبل أن تدفع.
            </p>
            <div className="relative mt-2 flex flex-wrap justify-center gap-3">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-bold text-primary-foreground transition-transform active:scale-[0.98]"
              >
                ابدأ التدقيق
                <ArrowLeft className="size-4" />
              </Link>
              {plans.length ? (
                <a href="#pricing" className="inline-flex h-12 items-center rounded-xl border border-ink-foreground/25 px-6 text-[15px] font-semibold transition-colors hover:bg-ink-foreground/10">
                  شاهد الخطط
                </a>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] lg:gap-16">
          <div className="flex flex-col items-start gap-4">
            <Link to="/" aria-label="تدقيق: الرئيسية">
              <LogoWordmark className="h-9 text-ink" />
            </Link>
            <p className="max-w-sm text-sm leading-7 text-muted-foreground">
              نعيد احتساب كل بند في فواتير تطبيقات التوصيل من طلباتك وعقدك، ونجهّز مطالبات التعويض بالأدلة لكل فرع.
            </p>
            <ul aria-label="المنصات المدعومة" className="flex flex-wrap gap-2 text-xs font-semibold">
              {PLATFORM_KEYS.map((key) => (
                <li key={key} className="rounded-full border border-border bg-background py-1 ps-1 pe-3">
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

/** A faint square grid behind a section, drawn in CSS (the hero's backdrop in the 21st.dev original). */
function GridPattern({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 [--grid-line:var(--ink)]", className)}
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    />
  );
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** The split hero: the promise and two actions on the start side, the animated invoice check beside it. */
function Hero() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px 0px" });
  const reduce = useReducedMotion();
  const shown = inView;
  const { scrollY } = useScroll();
  const driftDown = useTransform(scrollY, [0, 500], [0, reduce ? 0 : 110]);
  const driftUp = useTransform(scrollY, [0, 500], [0, reduce ? 0 : -90]);

  return (
    <MotionConfig reducedMotion="user">
      <section ref={ref} className="relative overflow-hidden pb-20 pt-10 sm:pt-14 lg:pb-28">
        <motion.span aria-hidden="true" style={{ y: driftDown }} className="pointer-events-none absolute -top-40 -start-32 size-[30rem] rounded-full bg-primary/[0.07]" />
        <motion.span aria-hidden="true" style={{ y: driftUp }} className="pointer-events-none absolute -bottom-56 -end-48 size-[36rem] rounded-full bg-ink/[0.035]" />
        <GridPattern className="opacity-[0.035]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
          <div className="lp-stagger flex flex-col items-start">
            <p
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 ps-1 pe-3 text-xs font-medium text-muted-foreground"
            >
              <span aria-hidden="true" className="flex">
                {PLATFORM_KEYS.map((key, i) => (
                  <PlatformIcon key={key} platform={key} className={cn("size-5 rounded-full ring-2 ring-card", i > 0 && "-ms-1.5")} />
                ))}
              </span>
              تدقيق فواتير هنقرستيشن وكيتا وجاهز
            </p>

            <h1
              className="mt-7 font-display text-[2.3rem] font-bold leading-[1.35] text-ink sm:text-5xl sm:leading-[1.3] lg:text-[3.1rem]"
            >
              لا تدفع فاتورة هنقرستيشن أو جاهز أو كيتا{" "}
              <span className="relative inline-block">
                <span className="relative z-10">قبل ما تتأكد منها.</span>
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-1.5 -z-0 h-3 origin-right rounded-full bg-primary/25"
                  initial={{ scaleX: 0 }}
                  animate={shown ? { scaleX: 1 } : undefined}
                  transition={{ duration: 0.7, delay: 0.75, ease: EASE_OUT }}
                />
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
              تدقيق يعيد احتساب كل بند في فاتورة تطبيق التوصيل من ملف طلباتك ومعادلات عقدك، يكشف الفرق لكل فرع، ويجهّز مطالبة التعويض بأدلتها.
            </p>

            <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-ink-foreground transition-[background-color,transform] hover:bg-ink/90 active:scale-[0.98]"
              >
                ابدأ التدقيق
                <ArrowLeft className="size-4" />
              </Link>
              <a
                href="#video"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-[15px] font-semibold text-foreground transition-colors hover:bg-muted/60"
              >
                <Play className="size-4 fill-current" />
                شاهد كيف يعمل
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
              {["Excel وCSV وPDF", "بيانات كل شركة منفصلة", "الذكاء الاصطناعي لا يغيّر الأرقام"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="size-4 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={shown ? { opacity: 1, y: 0, scale: 1 } : undefined}
            transition={{ duration: 0.75, delay: 0.3, ease: EASE_OUT }}
            className="relative"
          >
            <motion.span
              aria-hidden="true"
              className="absolute -bottom-4 -end-4 size-32 rounded-2xl bg-primary/15"
              initial={{ rotate: 0 }}
              animate={shown ? { rotate: -8 } : undefined}
              transition={{ type: "spring", stiffness: 60, delay: 1 }}
            />
            <InvoiceCheckCard shown={shown} />
          </motion.div>
        </div>
      </section>
    </MotionConfig>
  );
}

const CARD_TOTALS = [
  { label: "حسب فاتورة المنصة", value: "16,590.00" },
  { label: "حسب عقدك", value: "14,931.00" },
  { label: "الفرق لصالحك", value: "1,659.00", highlight: true },
];

const CARD_FINDINGS = [
  { branch: "فرع العليا", platform: "hungerstation" as const, issue: "عمولة أعلى من نسبة العقد", amount: "842.50" },
  { branch: "فرع النخيل", platform: "jahez" as const, issue: "تعويض مخصوم مرتين", amount: "142.50" },
];

/** Differences found per month in the example; the last month is highlighted. */
const CARD_MONTHS: Array<[month: string, height: number]> = [
  ["أبريل", 42],
  ["مايو", 64],
  ["يونيو", 48],
  ["يوليو", 78],
  ["أغسطس", 70],
  ["سبتمبر", 92],
];

/** The hero's product card: an invoice check with its totals, the latest differences and a month-by-month chart. */
function InvoiceCheckCard({ shown }: { shown: boolean }) {
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 8 },
    animate: shown ? { opacity: 1, y: 0 } : undefined,
    transition: { delay, duration: 0.4 },
  });
  return (
    <figure className="relative z-10 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_6px_rgb(19_35_43/0.04),0_24px_56px_-24px_rgb(19_35_43/0.28)]">
      <div className="flex items-center justify-between border-b border-border bg-background/70 px-5 py-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <ProductIcon product="mutabiq" className="size-6 rounded-md [&_svg]:size-3.5" />
          {productTitle("mutabiq")}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">مثال توضيحي</span>
      </div>

      <div className="space-y-5 p-5">
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {CARD_TOTALS.map((total, i) => (
            <motion.div
              key={total.label}
              {...rise(0.6 + i * 0.08)}
              className={cn("rounded-xl border p-3", total.highlight ? "col-span-2 border-ink bg-ink text-ink-foreground sm:col-span-1" : "border-border bg-background/60")}
            >
              <dt className={cn("text-[11px] leading-5", total.highlight ? "text-ink-muted" : "text-muted-foreground")}>{total.label}</dt>
              <dd className={cn("num mt-1 text-base font-semibold sm:text-lg", total.highlight && "text-primary")}>{total.value}</dd>
            </motion.div>
          ))}
        </dl>

        <div>
          <p className="text-xs font-semibold text-foreground">أحدث الفروقات</p>
          <ul className="mt-2.5 space-y-2">
            {CARD_FINDINGS.map((finding, i) => (
              <motion.li
                key={finding.branch}
                initial={{ opacity: 0, x: 8 }}
                animate={shown ? { opacity: 1, x: 0 } : undefined}
                transition={{ delay: 0.75 + i * 0.1, duration: 0.4 }}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 p-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <PlatformIcon platform={finding.platform} className="size-7 shrink-0 rounded-lg" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{finding.branch}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{finding.issue}</span>
                  </span>
                </span>
                <span className="num shrink-0 rounded-full bg-success-soft px-2.5 py-0.5 text-[12px] font-semibold text-success">{finding.amount}</span>
              </motion.li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold text-foreground">الفروقات المكتشفة شهرياً</p>
          <div className="mt-3 flex h-24 items-end gap-2">
            {CARD_MONTHS.map(([month, height], i) => (
              <div key={month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <motion.div
                  className={cn("w-full origin-bottom rounded-t-md", i === CARD_MONTHS.length - 1 ? "bg-primary" : "bg-ink/12")}
                  style={{ height: `${height}%` }}
                  initial={{ scaleY: 0 }}
                  animate={shown ? { scaleY: 1 } : undefined}
                  transition={{ delay: 0.85 + i * 0.06, duration: 0.5, ease: "easeOut" }}
                />
                <span className="text-[10px] text-muted-foreground">{month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

const HOW_STEPS: Array<{ title: string; body: string; icon: LucideIcon }> = [
  { title: "ارفع الملفات", body: "ملف الطلبات من بوابة التاجر وفاتورة المنصة لنفس الفترة، بصيغتها الأصلية: Excel أو CSV أو PDF.", icon: Upload },
  { title: "نعيد الاحتساب", body: "محرك ثابت يعيد بناء كل بند من الطلبات نفسها، بمعادلات عقدك النافذ في تاريخ كل طلب.", icon: Calculator },
  { title: "راجع الفروقات", body: "كل فرق باسم الفرع ومبلغه ومصدره والسطر المقابل في الفاتورة، مع مسؤول وحالة واضحة.", icon: SearchCheck },
  { title: "استرد وأغلق", body: "جهّز مطالبة الاسترداد بأدلتها، ثم أغلق الفترة بسجل كامل قابل للمراجعة.", icon: HandCoins },
];

/** An open four-stage process, with the original content and reading order. */
function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 bg-card">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-16 lg:py-28">
        <div className="max-w-3xl">
          <h2 id="how-title" className="text-balance font-display text-3xl font-semibold leading-[1.6] text-foreground sm:text-4xl">أربع خطوات. بدون جداول يدوية.</h2>
          <p className="mt-5 text-base leading-8 text-muted-foreground sm:text-lg">ارفع ملفين في نهاية الفترة، وتدقيق يتولى الباقي.</p>
        </div>
        <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4 lg:gap-x-12">
          {HOW_STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="flex items-center gap-5" aria-hidden="true">
                <span className="num text-sm text-primary-text">0{index + 1}</span>
                <span className="h-px flex-1 bg-border" />
                <step.icon strokeWidth={1.5} className="size-5 shrink-0 text-muted-foreground" />
              </div>
              <h3 className="mt-7 text-balance font-display text-lg font-semibold leading-8">{step.title}</h3>
              <p className="mt-3 max-w-sm text-pretty text-sm leading-7 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Product cards laid out on a three-column grid; «مُطابِق» and «رقيب» take two columns. Each opens its own page. */
const PRODUCT_CARDS: Array<{ key: ProductKey; wide?: boolean; dark?: boolean }> = [
  { key: "mutabiq", wide: true, dark: true },
  { key: "kashif" },
  { key: "radar" },
  { key: "istirdad" },
  { key: "aaid" },
  { key: "nabd" },
  { key: "raqeeb", wide: true },
];

/** Moves the card's spotlight to the cursor via CSS variables (transform-free, no re-render). */
function trackSpotlight(event: ReactPointerEvent<HTMLElement>) {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
  el.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
}

/** A whitespace-led journey; each product retains its own page and original summary. */
function ProductsGrid() {
  return (
    <section id="products" aria-labelledby="products-title" className="scroll-mt-20 bg-background">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-16 lg:py-28">
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end lg:gap-16">
          <div className="max-w-2xl">
            <h2 id="products-title" className="text-balance font-display text-3xl font-semibold leading-[1.6] text-foreground sm:text-4xl">أداة لكل بند في فاتورتك.</h2>
            <p className="mt-5 max-w-xl text-pretty text-base leading-8 text-muted-foreground sm:text-lg">كل منتج يعالج جزءاً من الفاتورة. افتح أي منتج لتعرف كيف يعمل بالتفصيل.</p>
          </div>
          <Button asChild variant="ghost" className="group h-12 shrink-0 gap-4 rounded-md px-0 text-foreground hover:bg-transparent hover:text-primary-text">
            <Link to="/products">كل المنتجات <ArrowLeft className="transition-transform duration-200 group-hover:-translate-x-1" /></Link>
          </Button>
        </div>
        <ol className="relative mt-14 lg:mt-20">
        {PRODUCT_CARDS.map(({ key }, index) => {
          const page = productPageFor(key);
          if (!page) return null;
          return (
            <li key={key} className="relative">
              <span aria-hidden="true" className={cn("pointer-events-none absolute start-3 w-px bg-border lg:start-4", index === 0 ? "top-14 bottom-0 lg:top-20" : index === PRODUCT_CARDS.length - 1 ? "top-0 h-14 lg:h-20" : "inset-y-0")} />
              <a href={page.path} aria-labelledby={`journey-${key}`} className="group relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-6 py-10 focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-ring sm:gap-x-10 lg:grid-cols-[2rem_minmax(0,1fr)] lg:gap-x-14 lg:py-14">
                <span aria-hidden="true" className="num relative mt-1 self-start bg-background py-1 text-xs text-muted-foreground transition-colors group-hover:text-primary-text lg:text-sm">{String(index + 1).padStart(2, "0")}</span>
                <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_2.5rem] lg:items-center lg:gap-12">
                  <div className="flex min-w-0 items-center gap-5">
                    <ProductIcon product={key} className="size-12 shrink-0 rounded-lg lg:size-14" />
                    <div className="min-w-0">
                      <h3 id={`journey-${key}`} className="font-display text-2xl font-semibold leading-10 transition-colors group-hover:text-primary-text">{PRODUCTS[key].name}</h3>
                      <p className="mt-1 text-sm leading-7 text-muted-foreground">{PRODUCTS[key].descriptor}</p>
                    </div>
                  </div>
                  <p className="max-w-md text-pretty text-base leading-8 text-muted-foreground">{page.summary}</p>
                  <span aria-hidden="true" className="flex size-10 items-center justify-center text-foreground transition-transform duration-200 group-hover:-translate-x-1"><ArrowLeft className="size-5" strokeWidth={1.5} /></span>
                </div>
              </a>
            </li>
          );
        })}
        </ol>
      </div>
    </section>
  );
}

const ASSISTANT_STEPS = [
  { title: "اكتب طلبك في المحادثة", body: "مثل: «دقق فاتورة هنقرستيشن لشهر سبتمبر، رسوم البنك 1.8%»." },
  { title: "ارفع من الرابط الجاهز", body: "رابط آمن فيه المنصة والنسبة مسبقاً. تسحب ملف الطلبات والفاتورة وتضغط تحليل." },
  { title: "اسأل عن النتيجة", body: "الفروقات وما تطالب به، أعلى الفروع تكلفة، والمقارنة مع الشهر الماضي، في نفس المحادثة." },
];

/** Using Tadqeeq from an AI assistant over MCP (الشاملة, or the add-on on other plans): three steps beside the beams. */
function AssistantSection() {
  return (
    <section id="assistant" className="bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div data-reveal>
          <h2 className="font-display text-3xl font-bold leading-[1.4] sm:text-[2.5rem]">دقّق فواتيرك من داخل Claude و ChatGPT.</h2>
          <p className="mt-4 max-w-xl text-base leading-8 text-ink-muted sm:text-[17px]">
            اربط حساب تدقيق بمساعدك الذكي عبر MCP واطلب التدقيق بجملة. يعطيك رابط رفع جاهز، وبعد الرفع يشرح لك النتيجة في نفس المحادثة. الأرقام
            من المحرك المحاسبي في تدقيق، والمساعد يشرحها فقط.
          </p>
          <ol className="mt-8 space-y-5">
            {ASSISTANT_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{index + 1}</span>
                <span>
                  <span className="block font-semibold">{step.title}</span>
                  <span className="mt-1 block text-sm leading-7 text-ink-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-ink-muted">متاح في باقة الشاملة، أو كإضافة لباقتك.</p>
        </div>
        <figure data-reveal>
          <AssistantBeams />
          <figcaption className="mt-3 text-center text-xs text-ink-muted">يعمل مع Claude و ChatGPT وكل مساعد يدعم ربط MCP بحسابك</figcaption>
        </figure>
      </div>
    </section>
  );
}

/** A section's heading and lead line. */
function SectionIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div data-reveal className="flex max-w-2xl flex-col">
      <h2 className="font-display text-3xl font-bold leading-[1.4] text-ink sm:text-[2.5rem]">{title}</h2>
      {children ? <div className="mt-4 flex flex-col text-base leading-8 text-muted-foreground sm:text-[17px]">{children}</div> : null}
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
            className="relative grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_18px_40px_-12px_rgb(19_35_43/0.6)] ring-4 ring-ink transition-transform hover:scale-105"
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
              className="relative block aspect-[9/16] w-full overflow-hidden rounded-[20px] bg-ink shadow-[0_24px_50px_-16px_rgb(19_35_43/0.65)] ring-[3px] ring-primary transition-transform hover:-translate-y-1"
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
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionIntro title="ادفع حسب طلباتك، لا حسب فروعك.">
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
                dark ? "bg-ink text-ink-foreground shadow-[0_30px_60px_-30px_rgb(19_35_43/0.5)]" : "border border-border bg-card",
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

      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        {PRICING_TERMS.map((term) => (
          <li key={term}>· {term}</li>
        ))}
      </ul>
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
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionIntro title="خطة تناسب حجم مطعمك.">
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
                ? "bg-ink text-ink-foreground shadow-[0_30px_60px_-30px_rgb(19_35_43/0.5)]"
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
    </section>
  );
}
