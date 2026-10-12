import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileSpreadsheet,
  FileText,
  HandCoins,
  LayoutDashboard,
  Link2,
  LineChart,
  Menu,
  Percent,
  Receipt,
  RotateCcw,
  Scale,
  SearchCheck,
  ShieldCheck,
  Store,
  Tag,
  Truck,
  AlertTriangle,
  Megaphone,
  PieChart,
  Play,
  Plus,
  Eye,
  Columns3,
  Sparkles,
  Upload,
  Users,
  Video,
  X,
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
      ["#checks", "ما الذي نراجعه"],
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
      ["#who", "لمن تدقيق"],
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

const BEFORE = [
  "الفاتورة تُدفع كما وصلت",
  "نسبة العمولة لا يراجعها أحد",
  "تعويضات تُخصم بلا دليل",
  "ربح كل فرع تقديري",
  "إغلاق الشهر في جداول يدوية",
];

const AFTER = [
  "كل بند مُعاد احتسابه قبل السداد",
  "نسبة عقدك على كل طلب",
  "تعويضات تُعترض بفيديو من الفرع",
  "تقرير واضح لكل فرع",
  "فترة مغلقة بسجل قابل للمراجعة",
];

type CheckItem = { title: string; body: string; icon: LucideIcon; how: string; example: string };

const CHECKS: CheckItem[] = [
  {
    title: "عمولة المبيعات",
    body: "حسب نسبة العقد لكل فرع وقناة",
    icon: Percent,
    how: "نضرب قيمة كل طلب في نسبة العمولة المتفق عليها لذلك الفرع والقناة، ونقارن الناتج بالعمولة المخصومة في الفاتورة.",
    example: "طلب 100 ر.س × 18% = 18.00، والفاتورة خصمت 20.00 ← فرق 2.00 لصالحك",
  },
  {
    title: "رسوم الدفع الإلكتروني",
    body: "مدى والبطاقات وآبل باي",
    icon: CreditCard,
    how: "نطبّق نسبة رسوم كل وسيلة دفع على الطلبات المدفوعة بها فقط، ونستبعد الطلبات النقدية من الاحتساب.",
    example: "طلب مدى 80 ر.س × 1% = 0.80، وطلب نقدي بلا رسوم دفع",
  },
  {
    title: "حملات التوصيل المجاني",
    body: "حصة المطعم من كل حملة",
    icon: Truck,
    how: "نحتسب حصة المطعم من رسوم التوصيل حسب نسبة المشاركة في العقد، ونتأكد أن الحملة كانت فعّالة في تاريخ الطلب.",
    example: "رسوم توصيل 12 ر.س × حصة 50% = 6.00 على المطعم",
  },
  {
    title: "التعويضات",
    body: "التكرار والفرع الخاطئ والطلبات المفقودة",
    icon: RotateCcw,
    how: "نبحث عن التعويض المكرر لنفس الطلب، والمخصوم على فرع غير فرع الطلب، والتعويض على طلب غير موجود في ملف الطلبات.",
    example: "تعويض 142.50 ر.س خُصم مرتين لنفس الطلب ← يُسترد أحدهما",
  },
  {
    title: "رسوم العروض ووقت الانتظار",
    body: "مع قياس العائد على كل عرض",
    icon: Tag,
    how: "نطابق رسوم كل عرض مع شروطه وفترته، ونحتسب رسوم الانتظار من أوقات التحضير الفعلية، ثم نقيس العائد على كل عرض.",
    example: "عرض خصم 20% كلّف 2,400 ر.س وجلب 4,300 مبيعات إضافية ← عائد 1.8x",
  },
  {
    title: "ضريبة القيمة المضافة",
    body: "على كل بند خاضع للضريبة",
    icon: Receipt,
    how: "نحتسب 15% على البنود الخاضعة للضريبة فقط، وأي فرق في العمولة أو الرسوم ينعكس على ضريبته تلقائياً.",
    example: "فرق عمولة 1,659.00 × 15% = 248.85 ضريبة زائدة",
  },
  {
    title: "صافي التسوية",
    body: "المستحق مقابل المحوّل فعلياً",
    icon: Scale,
    how: "نطرح كل الخصومات المدققة من المبيعات لنصل إلى المستحق، ونقارنه بالمبلغ المحوّل فعلياً في كشف التسوية.",
    example: "المستحق 142,415.00 مقابل المحوّل 140,507.15 ← فرق 1,907.85",
  },
  {
    title: "بنود غير مصنفة",
    body: "أي خصم لا يطابق خريطة الرسوم",
    icon: CircleHelp,
    how: "أي خصم لا يطابق بنداً في خريطة الرسوم لا يُقبل تلقائياً، بل يظهر كبند يحتاج مراجعة مع سطره في الفاتورة.",
    example: "«رسوم خدمة إضافية» 350.00 ر.س غير موجودة في العقد ← تحتاج مراجعة",
  },
];

const AUDIENCES: TourItem[] = [
  {
    key: "owner",
    name: "صاحب المطعم",
    tagline: "اعرف كم تأخذ المنصة فعلاً من كل طلب.",
    body: "ارفع ملفين في نهاية الشهر واعرف قبل السداد إن كانت الفاتورة صحيحة.",
    icon: Store,
    points: ["ملخص واضح للمستحق والمخصوم والفرق", "نسبة تكلفة كل منصة يوماً بيوم", "مطالبة تعويض جاهزة بالأدلة"],
  },
  {
    key: "finance",
    name: "المدير المالي",
    tagline: "إغلاق شهري قابل للمراجعة لكل منصة.",
    body: "كل رقم مربوط بمصدره، وكل فرق له حالة ومسؤول قبل اعتماد الفترة.",
    icon: LineChart,
    points: ["مطابقة كل بند بمعادلته", "متابعة حالة كل فترة", "سجل كامل للإجراءات"],
  },
  {
    key: "group",
    name: "مجموعة مطاعم",
    tagline: "كل فروعك ومنصاتك في مساحة واحدة.",
    body: "قارن الفروع والمنصات واعرف أين تتكرر الفروقات لتتفاوض بأرقام.",
    icon: Building2,
    points: ["تقارير موحدة لكل الفروع", "مقارنة الفترات", "صلاحيات منفصلة للموظفين"],
  },
  {
    key: "accounting",
    name: "فريق المحاسبة",
    tagline: "الأرقام التي تحتاجها من دون جداول يدوية.",
    body: "تدقيق منظم وسريع، وقيود الشهر جاهزة للاستيراد في نظامك المحاسبي.",
    icon: FileSpreadsheet,
    points: ["قيود لكل فرع بمركز تكلفته", "تصدير إلى Odoo وZoho وQuickBooks وقيود ودفترة", "مصدر واضح لكل رقم"],
  },
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
        <header className="relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 rounded-full border border-border bg-card/95 ps-4 pe-2 shadow-[0_12px_32px_-18px_rgb(19_35_43/0.28)] backdrop-blur sm:h-[68px] sm:ps-5">
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
        <section className="relative overflow-hidden">
          {/* Quiet frame rails at the edges, as in the 21st.dev "Fintech SaaS" template. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-24 hidden lg:block">
            <span className="absolute start-0 top-0 h-px w-10 bg-border" />
            <span className="absolute start-10 -top-8 grid h-16 w-28 place-items-center rounded-2xl border border-border">
              <span className="size-1.5 rounded-full border border-muted-foreground/50" />
            </span>
            <span className="absolute end-0 top-0 h-px w-10 bg-border" />
            <span className="absolute end-10 -top-8 grid h-16 w-28 place-items-center rounded-2xl border border-border">
              <span className="size-1.5 rounded-full border border-muted-foreground/50" />
            </span>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[34rem] hidden h-[40rem] lg:block">
            <span className="absolute -start-px top-0 h-full w-44 rounded-se-[2.5rem] border-e border-t border-border" />
            <span className="absolute -end-px top-0 h-full w-44 rounded-ss-[2.5rem] border-s border-t border-border" />
          </div>

          <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24 lg:pt-28">
            <div className="lp-stagger flex flex-col items-center gap-7">
              <p className="flex items-center gap-2.5 text-sm text-foreground/80 sm:text-[15px]">
                <span aria-hidden="true" className="flex">
                  {PLATFORM_KEYS.map((key, i) => (
                    <PlatformIcon key={key} platform={key} className={cn("size-6 rounded-full ring-2 ring-background", i > 0 && "-ms-2")} />
                  ))}
                </span>
                تدقيق فواتير
                <span aria-hidden="true" className="grid size-5 place-items-center rounded-[6px] bg-primary text-primary-foreground">
                  <Check className="size-3.5" />
                </span>
                <span className="font-semibold text-foreground">هنقرستيشن وكيتا وجاهز</span>
              </p>
              <h1 className="max-w-4xl text-balance font-display text-4xl font-extrabold leading-[1.35] sm:text-5xl lg:text-[3.6rem]">
                لا تدفع فاتورة هنقرستيشن أو جاهز أو كيتا{" "}
                <span className="text-muted-foreground/70">قبل ما تتأكد منها.</span>
              </h1>
              <p className="max-w-xl text-pretty text-base leading-8 text-muted-foreground sm:text-lg">
                تدقيق يعيد احتساب كل بند في فاتورة تطبيق التوصيل من ملف طلباتك ومعادلات عقدك، يكشف الفرق لكل فرع، ويجهّز مطالبة التعويض بأدلتها.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="inline-flex h-[54px] items-center gap-2 rounded-xl bg-ink px-7 text-[15px] font-semibold text-ink-foreground shadow-[0_14px_30px_-16px_rgb(19_35_43/0.55)] transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                >
                  ابدأ التدقيق
                  <ArrowLeft className="size-4" />
                </Link>
                <a
                  href="#video"
                  className="inline-flex h-[54px] items-center gap-2 rounded-xl bg-card px-7 text-[15px] font-semibold shadow-[0_10px_24px_-18px_rgb(19_35_43/0.4)] ring-1 ring-border transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
                >
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
          </div>

          <div className="relative mx-auto max-w-5xl px-4 pb-20 sm:px-6 lg:pb-28">
            <span
              aria-hidden="true"
              className="absolute -top-3 start-6 z-10 inline-flex -rotate-3 items-center gap-2 rounded-full bg-card px-4 py-2 text-[13px] font-semibold shadow-[0_12px_28px_-16px_rgb(19_35_43/0.45)] ring-1 ring-border sm:start-12"
            >
              <span className="size-2 rounded-full bg-success" />
              مطابقة تلقائية · مباشرة
            </span>
            <div className="rounded-[2rem] bg-ink/[0.04] p-2 ring-1 ring-border">
              <HeroDashboard />
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

        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-28">
          <SectionIntro eyebrow="المشكلة" title="ثلاث منصات، ثلاث صيغ، وفاتورة لا تُراجع.">
            كل منصة تكتب خصوماتها بطريقتها. ومن دون إعادة احتساب، تُدفع الفاتورة كما وصلت — بعمولتها ورسومها وتعويضاتها.
          </SectionIntro>
          <div data-reveal className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[18px] border border-border bg-card p-6">
              <p className="text-xs font-semibold text-destructive">من دون تدقيق</p>
              <ul className="mt-4 space-y-3 text-[15px] text-foreground/80">
                {BEFORE.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span className="grid size-5 place-items-center rounded-full bg-destructive/12 text-destructive">
                      <X className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lp-float rounded-[18px] bg-ink p-6 text-ink-foreground shadow-[0_30px_60px_-30px_rgb(19_35_43/0.45)]">
              <p className="text-xs font-semibold text-primary">مع تدقيق</p>
              <ul className="mt-4 space-y-3 text-[15px]">
                {AFTER.map((item, index) => (
                  <li key={item} className="lp-in flex items-center gap-2.5" style={{ animationDelay: `${0.4 + index * 0.15}s` }}>
                    <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <HowItWorks />

        <section id="features" className="bg-[oklch(0.975_0.018_85)]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-28">
            <SectionIntro eyebrow="مُطابِق · مطابقة الفاتورة" title="ما خصمته المنصة. ما يقوله عقدك. والفرق بينهما.">
              ارفع الفاتورة ويعيد تدقيق بناءها بنداً بنداً من ملف الطلبات. عند الاختلاف ترى البند والنسبة المحتسبة والنسبة المتفق عليها.
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-foreground"
              >
                جرّب مُطابِق
                <ArrowLeft className="size-4" />
              </Link>
            </SectionIntro>
            <InvoiceMock />
          </div>
        </section>

        <CompensationFlow />

        <ProductShowcase />

        <ChecksGrid />

        <AssistantSection />

        <Audiences />

        <Capabilities />

        {plans.length ? <Pricing plans={plans} /> : null}

        <section id="faq" className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] lg:py-24">
          <SectionIntro eyebrow="أسئلة" title="قبل أن تبدأ">
            ما يسأله أصحاب المطاعم عادة.
            <span className="mt-4 block text-xs text-muted-foreground">
              آخر تحديث: <time dateTime={CONTENT_UPDATED}>{formatArabicDate(CONTENT_UPDATED)}</time>
            </span>
          </SectionIntro>
          <div data-reveal className="border-b border-border">
            {FAQS.map(([q, a], index) => (
              <details key={q} open={index === 0} className="group border-t border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold">
                  <span>{q}</span>
                  <ChevronDown className="size-5 shrink-0 text-primary-text transition-transform group-open:rotate-180" />
                </summary>
                <p className="max-w-2xl pb-5 text-[15px] leading-8 text-muted-foreground">{a}</p>
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

      <footer className="mt-4 border-t border-border bg-[oklch(0.975_0.018_85)]">
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

const SHOWCASE: TourItem[] = [
  {
    key: "invoice",
    name: PRODUCTS.mutabiq.name,
    descriptor: PRODUCTS.mutabiq.descriptor,
    product: "mutabiq",
    tagline: "ما خصمته المنصة، وما يقوله عقدك، والفرق.",
    body: "ارفع الفاتورة وملف الطلبات ويعيد تدقيق احتساب كل بند من عقدك. كل فرق يظهر باسمه ومبلغه ونسبته، وجاهز للمطالبة.",
    icon: FileSpreadsheet,
  },
  {
    key: "charges",
    name: PRODUCTS.kashif.name,
    descriptor: PRODUCTS.kashif.descriptor,
    product: "kashif",
    tagline: "أين يذهب كل ريال تخصمه المنصة.",
    body: "كل خصم في الفاتورة مصنف: عمولة، رسوم دفع، حملات، ضريبة، وفواتير إعلانات CPC موزعة على الفروع. وأي بند لا يطابق الخريطة يظهر كبند غير مصنف بدلاً من أن يختفي.",
    icon: PieChart,
  },
  {
    key: "exceptions",
    name: PRODUCTS.radar.name,
    descriptor: PRODUCTS.radar.descriptor,
    product: "radar",
    tagline: "كل فرق له حالة ومسؤول حتى يُغلق.",
    body: "الفروقات تتحول إلى استثناءات بأولوية وحالة ومسؤول، مع سجل لكل إجراء حتى يبقى إغلاق الشهر قابلاً للمراجعة.",
    icon: AlertTriangle,
  },
  {
    key: "compensation",
    name: PRODUCTS.istirdad.name,
    descriptor: PRODUCTS.istirdad.descriptor,
    product: "istirdad",
    tagline: "تعويضات لم تتسبب فيها، تُعترض بالدليل.",
    body: "الكاشير يرسل فيديو الطلب في قروب الفرع على Telegram، وتدقيق يربطه برقم الطلب ويجهز ملف الاعتراض بالعربي والإنجليزي.",
    icon: Video,
  },
  {
    key: "promotions",
    name: PRODUCTS.aaid.name,
    descriptor: PRODUCTS.aaid.descriptor,
    product: "aaid",
    tagline: "الربح بعد العمولة والخصومات، لا رقم المنصة.",
    body: "لكل حملة ما دفعته فيها وما بقي لك فعلاً بعد العمولة والخصومات والإعلان، مع الحملات الخاسرة وأين تنقل ميزانيتك.",
    icon: Megaphone,
  },
  {
    key: "watch",
    name: PRODUCTS.raqeeb.name,
    descriptor: PRODUCTS.raqeeb.descriptor,
    product: "raqeeb",
    tagline: "يقارن كل فرع بتاريخه، وينبّهك لما هو غير معتاد.",
    body: "بعد كل رفع يقارن تدقيق العمولة والرسوم والتعويضات لكل فرع بأشهره السابقة وبالفروع المشابهة، ويرتب التنبيهات حسب أثرها بالريال.",
    icon: Eye,
  },
  {
    key: "daily",
    name: PRODUCTS.nabd.name,
    descriptor: PRODUCTS.nabd.descriptor,
    product: "nabd",
    tagline: "تكلفة كل منصة، يوماً بيوم، قبل أن تصل الفاتورة.",
    body: "ارفع ملف الطلبات اليومي من هنقرستيشن أو كيتا أو جاهز، وتابع المبيعات ونسبة تكلفة المنصة والتحويل المتوقع لنهاية الشهر لكل فرع. وإذا صُدّر الملف قبل أن تحسب المنصة عمولتها، ينبّهك بدلاً من أن يعرض نسبة خاطئة.",
    icon: Activity,
  },
  {
    key: "journal",
    name: "القيود المحاسبية",
    tagline: "قيود الشهر جاهزة لنظامك المحاسبي.",
    body: "من نتيجة التدقيق يجهّز تدقيق قيداً لكل فرع ومنصة: المبيعات والعمولة والرسوم والضريبة والإعلانات والأجهزة والاشتراكات، مع مركز تكلفة لكل فرع. صدّرها إلى Excel أو Odoo أو Zoho Books أو QuickBooks أو قيود أو دفترة.",
    icon: BookOpen,
  },
  {
    key: "columns",
    name: "قراءة ذكية للملفات",
    tagline: "المنصة غيّرت ملفها؟ تدقيق يفهم التغيير.",
    body: "إذا تغيّر اسم عمود يقترح تدقيق العمود المطابق ويطلب تأكيدك مرة واحدة، وينبهك لأي عمود مالي جديد أو مختفٍ. والملفات الكبيرة تُقرأ بدون مشاكل.",
    icon: Columns3,
  },
  {
    key: "ai",
    name: PRODUCTS.ai.name,
    descriptor: PRODUCTS.ai.descriptor,
    tagline: "أرقامك، مشروحة بلغة بسيطة.",
    body: "اسأل عن أي فترة واحصل على إجابة من الحقائق المدققة. الأرقام من المحرك المحاسبي، والصياغة من الذكاء الاصطناعي، ولا يغيّر أي رقم.",
    icon: Sparkles,
  },
];

type TourItem = { key: string; name: string; descriptor?: string; product?: ProductKey; tagline: string; body: string; icon: LucideIcon; points?: string[] };

/** Link to the product's public page, when the tour item is a product that has one. */
function TourMoreLink({ item, className }: { item: TourItem; className: string }) {
  const page = item.product ? productPageFor(item.product) : undefined;
  if (!page) return null;
  return (
    <a
      href={page.path}
      className={`inline-flex w-fit items-center rounded-full border border-border bg-card font-semibold transition-colors hover:border-primary ${className}`}
    >
      اعرف المزيد عن {item.name}
    </a>
  );
}

/** Scroll-pinned tour: the section stays on screen while scrolling moves through the items. */
function PinnedTour({
  id,
  eyebrow,
  title,
  hint,
  items,
  renderVisual,
  ctaLabel,
  className,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  hint: string;
  items: TourItem[];
  renderVisual: (key: string, active: boolean) => ReactNode;
  ctaLabel: (item: TourItem) => string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ index: 0, progress: 0 });
  const count = items.length;

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const raw = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;
      const scaled = raw * count;
      const index = Math.min(count - 1, Math.floor(scaled));
      const progress = raw >= 1 ? 1 : scaled - index;
      setState((prev) =>
        prev.index === index && Math.abs(prev.progress - progress) < 0.01 ? prev : { index, progress },
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [count]);

  function jumpTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const scrollable = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (scrollable * (index + 0.05)) / count, behavior: "smooth" });
  }

  const current = items[state.index] ?? items[0]!;
  const counter = (i: number) => `${String(i + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`;

  return (
    <section id={id} aria-labelledby={`${id}-title`} className={className}>
      <div className="mx-auto max-w-7xl px-4 pt-20 text-center sm:px-6 lg:pt-28">
        <div data-reveal>
          {eyebrow ? (
            <p className="flex items-center justify-center gap-2 text-[13px] font-semibold text-primary-text">
              <span className="size-1.5 rounded-full bg-primary" />
              {eyebrow}
            </p>
          ) : null}
          <h2 id={`${id}-title`} className="mt-3 font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]">
            {title}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {hint}
          </p>
        </div>
      </div>

      <div ref={trackRef} className="relative hidden lg:block" style={{ height: `${count * 85 + 40}vh` }}>
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-14 px-6 pt-20">
            <div>
              <div key={current.key} className="lp-stagger flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary-text">
                    <current.icon className="size-6" />
                  </span>
                  <span className="num text-sm text-muted-foreground" dir="ltr">
                    {counter(state.index)}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-5xl font-extrabold leading-[1.25]">
                  {current.name}
                  {current.descriptor ? <span className="ms-3 align-middle text-lg font-semibold text-primary-text">{current.descriptor}</span> : null}
                </h3>
                <p className="mt-4 text-xl font-medium text-foreground/85">{current.tagline}</p>
                <p className="mt-3 max-w-lg text-base leading-8 text-muted-foreground">{current.body}</p>
                {current.points ? (
                  <ul className="mt-4 space-y-2 text-[15px]">
                    {current.points.map((point) => (
                      <li key={point} className="flex items-center gap-2.5">
                        <Check className="size-4 shrink-0 text-success" />
                        {point}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    to="/auth"
                    search={{ mode: "signup" }}
                    className="inline-flex h-12 w-fit items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
                  >
                    {ctaLabel(current)}
                    <ArrowLeft className="size-4" />
                  </Link>
                  <TourMoreLink item={current} className="h-12 px-5 text-[15px]" />
                </div>
              </div>
              <ol className="mt-8 border-t border-border pt-4">
                {items.map((item, index) => {
                  const fill = index < state.index ? 1 : index === state.index ? state.progress : 0;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => jumpTo(index)}
                        aria-current={index === state.index ? "step" : undefined}
                        className={cn(
                          "flex w-full items-center gap-4 py-2 text-start text-[15px] transition-colors",
                          index === state.index ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className="relative h-0.5 w-12 shrink-0 overflow-hidden rounded-full bg-border">
                          <span
                            className="absolute inset-y-0 start-0 rounded-full bg-primary"
                            style={{ width: `${Math.round(fill * 100)}%` }}
                          />
                        </span>
                        {item.name}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="relative h-[560px] overflow-hidden rounded-[28px] bg-secondary">
              <span aria-hidden="true" className="absolute -top-24 -start-24 size-72 rounded-full bg-primary/10" />
              <span aria-hidden="true" className="absolute -bottom-40 -end-24 size-[26rem] rounded-full border border-primary/25" />
              {items.map((item, index) => (
                <div
                  key={item.key}
                  aria-hidden={index !== state.index}
                  className={cn(
                    "absolute inset-0 grid place-items-center p-10 transition-[opacity,transform] duration-700 ease-out",
                    index === state.index
                      ? "translate-y-0 scale-100 opacity-100"
                      : index < state.index
                        ? "pointer-events-none -translate-y-10 scale-95 opacity-0"
                        : "pointer-events-none translate-y-10 scale-95 opacity-0",
                  )}
                >
                  {renderVisual(item.key, index === state.index)}
                </div>
              ))}
              <span className="absolute bottom-4 start-5 rounded-full bg-card/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                مثال توضيحي
              </span>
            </div>
          </div>
        </div>
      </div>

      <MobilePinned
        labels={items.map((item) => item.name)}
        panelClass="bg-secondary"
        fillClass="bg-primary"
        renderVisual={(index, active) => renderVisual(items[index]!.key, active)}
        renderText={(index) => {
          const item = items[index]!;
          return (
            <>
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary-text">
                  <item.icon className="size-[18px]" />
                </span>
                <span className="num text-xs text-muted-foreground" dir="ltr">
                  {counter(index)}
                </span>
              </div>
              <h3 className="mt-2 font-display text-2xl font-extrabold">
                {item.name}
                {item.descriptor ? <span className="ms-2 align-middle text-sm font-semibold text-primary-text">{item.descriptor}</span> : null}
              </h3>
              <p className="mt-1 text-[15px] font-medium">{item.tagline}</p>
              <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{item.body}</p>
              <TourMoreLink item={item} className="mt-2 h-9 px-3.5 text-[13px]" />
              {item.points ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {item.points.map((point) => (
                    <li key={point} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
                      <Check className="size-3.5 shrink-0 text-success" />
                      {point}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          );
        }}
      />
    </section>
  );
}

function ProductShowcase() {
  return (
    <PinnedTour
      id="products"
      title="كل أداة في تدقيق، وهي تعمل."
      hint="واصل التمرير للانتقال من أداة إلى أخرى."
      items={SHOWCASE}
      renderVisual={(key, active) => <ShowcaseVisual kind={key} active={active} />}
      ctaLabel={(item) => `جرّب ${item.name}`}
      className="bg-background"
    />
  );
}

const CAPABILITIES: TourItem[] = [
  {
    key: "companies",
    name: "عدة شركات في حساب واحد",
    tagline: "كل علامة تجارية في مساحة مستقلة.",
    body: "لكل شركة أو علامة تجارية بياناتها وفروعها وفريقها، وتنتقل بينها من أعلى الشاشة دون تسجيل خروج. عدد الشركات حسب باقتك.",
    icon: Building2,
  },
  {
    key: "team",
    name: "أدوار وصلاحيات",
    tagline: "كل موظف يرى ما يخصه فقط.",
    body: "المالك والمدير والمدقق المالي ومسؤول التعويضات ومدير الفرع والمشاهد. لكل موظف دخول مستقل، ومدير الفرع يمكن حصره في فروعه.",
    icon: Users,
  },
  {
    key: "security",
    name: "دخول محمي برمز",
    tagline: "كلمة المرور وحدها لا تكفي.",
    body: "كل تسجيل دخول بكلمة المرور يحتاج رمزاً من 6 أرقام يصل بريدك، ويمكنك استخدام تطبيق المصادقة بدلاً منه.",
    icon: ShieldCheck,
  },
  {
    key: "contracts",
    name: "العقود وأرشيف الفترات",
    tagline: "كل فترة تبقى كما اعتُمدت.",
    body: "نسب العمولة والرسوم المتفق عليها مع كل منصة في نسخ معتمدة تُقفل. كل فترة تُحفظ، وعند تعديل عقد أو ربط فرع تعيد تحليلها بضغطة دون رفع الملفات من جديد.",
    icon: FileText,
  },
  {
    key: "reports",
    name: "اللوحة التنفيذية والتقارير",
    tagline: "من الملخص إلى الفرع إلى اليوم.",
    body: "المستحق والمخصوم والفرق ونسبة تكلفة المنصة في شاشة واحدة، مع تقارير الفروع والأيام والبنود. واسم الفرع في الفاتورة تربطه مرة واحدة ويتذكره تدقيق.",
    icon: LayoutDashboard,
  },
];

/** What the account gives every team, beyond the audit tools themselves. */
function Capabilities() {
  return (
    <PinnedTour
      id="platform"
      eyebrow="الحساب والفريق والتقارير"
      title="كل شركاتك وفريقك وتقاريرك في حساب واحد."
      hint="واصل التمرير لترى ما يحصل عليه فريقك."
      items={CAPABILITIES}
      renderVisual={(key, active) => <CapabilityVisual kind={key} active={active} />}
      ctaLabel={() => "ابدأ مجاناً"}
      className="bg-[oklch(0.975_0.018_85)] pb-4"
    />
  );
}

function CapabilityVisual({ kind, active }: { kind: string; active: boolean }) {
  const card = "w-full max-w-md rounded-2xl bg-card p-5 shadow-[0_24px_48px_-28px_rgb(19_35_43/0.45)]";
  const rise = (i: number) => ({
    className: cn("transition-[opacity,transform] duration-500", active ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"),
    style: { transitionDelay: `${0.15 + i * 0.12}s` },
  });
  if (kind === "companies") {
    const companies: Array<[string, string, boolean]> = [
      ["مطاعم الشرق", "12 فرعاً", true],
      ["برجر الحي", "5 فروع", false],
      ["قهوة المساء", "3 فروع", false],
    ];
    return (
      <div className={card}>
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="size-4 text-primary-text" /> مطاعم الشرق
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
        <ul className="mt-2 space-y-1.5 rounded-xl border border-border p-1.5">
          {companies.map(([name, branches, current], i) => (
            <li key={name} {...rise(i)}>
              <span className={cn("flex items-center justify-between rounded-lg px-3 py-2 text-[13px]", current ? "bg-secondary font-semibold" : "")}>
                <span className="flex items-center gap-2">
                  {current ? <Check className="size-4 text-success" /> : <span className="size-4" />}
                  {name}
                </span>
                <span className="text-xs text-muted-foreground">{branches}</span>
              </span>
            </li>
          ))}
        </ul>
        <p {...rise(3)}>
          <span className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
            <Plus className="size-3.5" /> إضافة شركة
          </span>
        </p>
      </div>
    );
  }
  if (kind === "team") {
    const people: Array<[string, string, string]> = [
      ["سارة", "مدقق / مالية", "كل الفروع"],
      ["خالد", "مسؤول التعويضات", "كل الفروع"],
      ["فهد", "مدير فرع", "العليا · الملقا"],
    ];
    return (
      <div className={card}>
        <p className="text-sm font-semibold">المستخدمون والصلاحيات</p>
        <ul className="mt-4 space-y-2.5">
          {people.map(([name, role, scope], i) => (
            <li key={name} {...rise(i)}>
              <span className="flex items-center gap-3 rounded-xl border border-border p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-primary-text">{name[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{name}</span>
                  <span className="block text-xs text-muted-foreground">{role}</span>
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px]">{scope}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (kind === "security") {
    const digits = ["4", "8", "2", "9", "1", "6"];
    return (
      <div className={cn(card, "text-center")}>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-primary-text">
          <ShieldCheck className="size-6" />
        </span>
        <p className="mt-3 text-sm font-semibold">أدخل الرمز المرسل إلى بريدك</p>
        <div dir="ltr" className="mt-4 flex justify-center gap-2">
          {digits.map((digit, i) => (
            <span
              key={i}
              className={cn(
                "num grid size-10 place-items-center rounded-lg border text-lg font-semibold transition-colors duration-300",
                active ? "border-primary text-foreground" : "border-border text-transparent",
              )}
              style={{ transitionDelay: `${0.2 + i * 0.15}s` }}
            >
              {digit}
            </span>
          ))}
        </div>
        <p {...rise(8)}>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-success-soft px-3 py-2 text-xs font-semibold text-success">
            <Check className="size-4" /> تم التحقق
          </span>
        </p>
      </div>
    );
  }
  if (kind === "contracts") {
    const versions: Array<[string, string, string, string, string]> = [
      ["النسخة 2", "18%", "1.8%", "معتمدة", "bg-success/15 text-success"],
      ["النسخة 1", "20%", "2%", "مقفلة", "bg-muted text-muted-foreground"],
    ];
    return (
      <div className={card}>
        <p className="text-sm font-semibold">عقد هنقرستيشن</p>
        <ul className="mt-4 space-y-2.5">
          {versions.map(([name, commission, paymentFee, status, tone], i) => (
            <li key={name} {...rise(i)}>
              <span className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span>
                  <span className="block text-[13px] font-semibold">{name}</span>
                  <span className="block text-xs text-muted-foreground">
                    عمولة <bdi dir="ltr" className="num">{commission}</bdi> · رسوم دفع <bdi dir="ltr" className="num">{paymentFee}</bdi>
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", tone)}>{status}</span>
              </span>
            </li>
          ))}
        </ul>
        <p {...rise(2)}>
          <span className="mt-3 flex items-center justify-between rounded-xl bg-ink px-3.5 py-2.5 text-xs text-ink-foreground">
            <span>فترة سبتمبر</span>
            <span className="flex items-center gap-1.5 font-semibold text-primary">
              <RotateCcw className="size-3.5" /> إعادة التحليل
            </span>
          </span>
        </p>
      </div>
    );
  }
  const rows: Array<[string, number]> = [
    ["العليا", 78],
    ["الملقا", 62],
    ["النرجس", 45],
  ];
  return (
    <div className={card}>
      <div className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["المستحق", "142,415"],
            ["المحوّل", "140,507"],
            ["الفرق", "1,907.85"],
          ] as const
        ).map(([label, value], i) => (
          <div key={label} {...rise(i)}>
            <span className={cn("block rounded-xl px-2 py-2.5", i === 2 ? "bg-ink text-ink-foreground" : "bg-muted/60")}>
              <span className={cn("block text-[10.5px]", i === 2 ? "text-ink-muted" : "text-muted-foreground")}>{label}</span>
              <span className={cn("num mt-1 block text-[14px] font-semibold", i === 2 && "text-primary")}>{value}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">الفرق حسب الفرع</p>
      <div className="mt-2 space-y-2.5">
        {rows.map(([branch, width], i) => (
          <div key={branch} className="flex items-center gap-3 text-[12.5px]">
            <span className="w-14 shrink-0">{branch}</span>
            <span className="h-2 flex-1 rounded-full bg-muted">
              <span
                className="block h-2 rounded-full bg-chart-2 transition-[width] duration-1000 ease-out"
                style={{ width: active ? `${width}%` : "0%", transitionDelay: `${0.4 + i * 0.12}s` }}
              />
            </span>
          </div>
        ))}
      </div>
      <p {...rise(5)}>
        <span className="mt-4 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs font-semibold text-success">
          <Link2 className="size-3.5 shrink-0" /> فرع العليا مربوط باسمه في الفاتورة
        </span>
      </p>
    </div>
  );
}

function Audiences() {
  return (
    <PinnedTour
      id="who"
      eyebrow="لمن تدقيق"
      title="لمن يملك الأرقام ويُسأل عنها."
      hint="واصل التمرير لترى ما يحصل عليه كل دور."
      items={AUDIENCES}
      renderVisual={(key, active) => <AudienceVisual kind={key} active={active} />}
      ctaLabel={() => "ابدأ التدقيق"}
      className="bg-muted pb-4"
    />
  );
}

function AudienceVisual({ kind, active }: { kind: string; active: boolean }) {
  const card = "w-full max-w-md rounded-2xl bg-card p-5 shadow-[0_24px_48px_-28px_rgb(19_35_43/0.45)]";
  if (kind === "owner") {
    const rows: Array<[string, string, string]> = [
      ["المستحق حسب عقدك", "142,415.00", "text-foreground"],
      ["المحوّل من المنصة", "140,507.15", "text-foreground"],
      ["الفرق لصالحك", "1,907.85", "text-primary-text"],
    ];
    return (
      <div className={card}>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          ملخص الشهر · <PlatformName platform="hungerstation" />
        </p>
        <div className="mt-4 space-y-2.5">
          {rows.map(([label, value, tone], i) => (
            <div
              key={label}
              className={cn(
                "flex items-center justify-between rounded-xl px-3.5 py-3 transition-[opacity,transform] duration-500",
                i === rows.length - 1 ? "bg-ink text-ink-foreground" : "bg-background",
                active ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0",
              )}
              style={{ transitionDelay: `${0.1 + i * 0.12}s` }}
            >
              <span className="text-sm">{label}</span>
              <span className={cn("num text-lg font-semibold", i === rows.length - 1 ? "text-primary" : tone)}>{value}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-2 text-[13px] text-success">
          <Check className="size-4" /> مطالبة التعويض جاهزة بالأدلة
        </p>
      </div>
    );
  }
  if (kind === "finance") {
    const steps: Array<[string, boolean]> = [
      ["رفع ملفات الفترة", true],
      ["إعادة احتساب البنود", true],
      ["مراجعة 3 استثناءات", true],
      ["اعتماد الفترة", false],
    ];
    return (
      <div className={card}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">إغلاق سبتمبر · جاهز</p>
          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning">بانتظار الاعتماد</span>
        </div>
        <ol className="mt-4 space-y-2.5">
          {steps.map(([label, done], i) => (
            <li
              key={label}
              className={cn("flex items-center gap-3 rounded-xl border border-border p-3 text-sm transition-[opacity,transform] duration-500", active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}
              style={{ transitionDelay: `${0.1 + i * 0.12}s` }}
            >
              <span className={cn("grid size-6 place-items-center rounded-full", done ? "bg-success text-white" : "border-2 border-primary")}>
                {done ? <Check className="size-3.5" /> : null}
              </span>
              <span className={done ? "" : "font-semibold"}>{label}</span>
              <span className="ms-auto text-xs text-muted-foreground">{done ? "مكتمل" : "التالي"}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (kind === "group") {
    const branches: Array<[string, number]> = [
      ["فرع العليا", 21.4],
      ["فرع الملقا", 22.1],
      ["فرع النرجس", 25.8],
      ["فرع الروضة", 20.9],
    ];
    return (
      <div className={card}>
        <p className="text-sm font-semibold">نسبة الخصومات حسب الفرع</p>
        <div className="mt-4 space-y-3.5">
          {branches.map(([name, rate], i) => {
            const high = rate > 25;
            return (
              <div key={name}>
                <div className="flex justify-between text-[13px]">
                  <span>{name}</span>
                  <span className={cn("num font-semibold", high ? "text-destructive" : "text-muted-foreground")}>{rate}%</span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-muted">
                  <div
                    className={cn("h-2.5 rounded-full transition-[width] duration-1000 ease-out", high ? "bg-destructive" : "bg-chart-2")}
                    style={{ width: active ? `${rate * 3.2}%` : "0%", transitionDelay: `${i * 0.12}s` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 rounded-xl bg-secondary p-3 text-xs">فرع النرجس أعلى بـ 4 نقاط من بقية الفروع، والفرق يتكرر كل شهر.</p>
      </div>
    );
  }
  const rows: Array<[string, string, string]> = [
    ["عمولة المبيعات", "16,590.00", "+1,659.00"],
    ["ضريبة العمولة", "2,488.50", "+248.85"],
    ["رسوم الدفع", "1,204.30", "مطابق"],
  ];
  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">نتيجة التدقيق</p>
        <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
          <FileSpreadsheet className="size-3.5" /> تصدير Excel
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-border text-[13px]">
        <div className="grid grid-cols-3 bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span>البند</span>
          <span>الفاتورة</span>
          <span>الفرق</span>
        </div>
        {rows.map(([label, value, diff], i) => (
          <div
            key={label}
            className={cn("grid grid-cols-3 border-t border-border px-3 py-2.5 transition-opacity duration-500", active ? "opacity-100" : "opacity-0")}
            style={{ transitionDelay: `${0.15 + i * 0.12}s` }}
          >
            <span>{label}</span>
            <span className="num">{value}</span>
            <span className={cn(diff === "مطابق" ? "font-semibold text-success" : "num text-destructive")}>{diff}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">كل رقم مربوط بسطره في ملف الطلبات والفاتورة.</p>
    </div>
  );
}

function ShowcaseVisual({ kind, active }: { kind: string; active: boolean }) {
  const card = "w-full max-w-md rounded-2xl bg-card p-5 shadow-[0_24px_48px_-28px_rgb(19_35_43/0.45)]";
  if (kind === "invoice") {
    return (
      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card p-4">
            <p className="text-xs text-muted-foreground">حسب فاتورة المنصة</p>
            <p className="num mt-2 text-2xl font-semibold">16,590.00</p>
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-[0_20px_40px_-24px_rgb(19_35_43/0.35)]">
            <p className="text-xs text-muted-foreground">حسب عقدك</p>
            <p className="num mt-2 text-2xl font-semibold text-success">14,931.00</p>
          </div>
        </div>
        <div className={card}>
          <div className="flex justify-between text-sm">
            <span>عمولة المبيعات</span>
            <span className="text-xs text-muted-foreground">
              محتسبة <span className="num">20%</span> · متفق عليها <span className="num">18%</span>
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="lp-pulse rounded-full bg-ink px-3.5 py-2 text-sm text-ink-foreground">
              الفرق <span className="num text-primary">+1,659.00</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" /> مطالبة جاهزة
            </span>
          </div>
        </div>
      </div>
    );
  }
  if (kind === "charges") {
    const rows: Array<[string, number, string]> = [
      ["عمولة المبيعات", 62, "bg-chart-2"],
      ["رسوم الدفع الإلكتروني", 14, "bg-primary"],
      ["حملات التوصيل المجاني", 12, "bg-chart-3"],
      ["ضريبة القيمة المضافة", 9, "bg-chart-5"],
      ["بنود غير مصنفة", 3, "bg-destructive"],
    ];
    return (
      <div className={card}>
        <p className="text-sm font-semibold">توزيع خصومات المنصة</p>
        <div className="mt-4 space-y-3.5">
          {rows.map(([label, value, color], i) => (
            <div key={label}>
              <div className="flex justify-between text-[13px]">
                <span>{label}</span>
                <span className="num text-muted-foreground">{value}%</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-muted">
                <div
                  className={cn("h-2 rounded-full transition-[width] duration-1000 ease-out", color)}
                  style={{ width: active ? `${value}%` : "0%", transitionDelay: `${i * 0.12}s` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "exceptions") {
    const rows: Array<[string, string, string, string]> = [
      ["عمولة أعلى من العقد", "فرع العليا", "مفتوح", "bg-destructive/12 text-destructive"],
      ["تعويض على فرع خاطئ", "فرع الملقا", "قيد المعالجة", "bg-warning/15 text-warning"],
      ["رسوم حملة غير متفق عليها", "فرع النرجس", "مغلق", "bg-success/15 text-success"],
    ];
    return (
      <div className={card}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">الاستثناءات المفتوحة</p>
          <span className="num rounded-full bg-muted px-2 py-0.5 text-xs">3</span>
        </div>
        <div className="mt-4 space-y-2.5">
          {rows.map(([title, branch, status, tone], i) => (
            <div
              key={title}
              className={cn("flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-[opacity,transform] duration-500", active ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0")}
              style={{ transitionDelay: `${0.15 + i * 0.12}s` }}
            >
              <div>
                <p className="text-[13px] font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{branch}</p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", tone)}>{status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "compensation") {
    return (
      <div className="flex w-full max-w-md items-center gap-3">
        <div className="lp-float w-40 shrink-0 rounded-2xl bg-card p-3 shadow-[0_20px_40px_-24px_rgb(19_35_43/0.35)]">
          <p className="text-[11px] font-semibold">قروب فرع الملقا</p>
          <div className="lp-rec relative mt-2 grid h-28 place-items-center rounded-xl bg-ink/90 text-ink-foreground">
            <Video className="size-6" />
          </div>
          <p className="lp-pop mt-2 rounded-lg bg-success-soft px-2 py-1.5 text-[11px] text-success">✓ تم الربط بالطلب</p>
        </div>
        <div className="flex-1 rounded-2xl bg-card p-4">
          <p className="num text-xs text-muted-foreground">HS-88214073</p>
          <p className="num mt-1 text-2xl font-semibold">142.50 <span className="text-xs">ر.س</span></p>
          <p className="mt-1 text-xs text-muted-foreground">طلب ناقص · فرع الملقا</p>
          <p className="lp-pop mt-3 rounded-lg bg-success-soft p-2 text-xs font-semibold text-success" style={{ animationDelay: "0.8s" }}>
            يوجد دليل فيديو
          </p>
          <p className="lp-pop mt-2 w-fit rounded-full bg-ink px-3 py-1.5 text-xs text-ink-foreground" style={{ animationDelay: "1.6s" }}>
            ملف الاعتراض جاهز
          </p>
        </div>
      </div>
    );
  }
  if (kind === "promotions") {
    const rows: Array<[string, number, string, boolean]> = [
      ["خصم 20% على الوجبات", 78, "1.8x", true],
      ["توصيل مجاني فوق 50 ر.س", 46, "1.1x", true],
      ["خصم 30% للعملاء الجدد", 24, "0.6x", false],
    ];
    return (
      <div className={card}>
        <p className="text-sm font-semibold">العائد على كل عرض</p>
        <div className="mt-4 space-y-4">
          {rows.map(([label, width, roi, good], i) => (
            <div key={label}>
              <div className="flex justify-between text-[13px]">
                <span>{label}</span>
                <span className={cn("num font-semibold", good ? "text-success" : "text-destructive")}>{roi}</span>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-muted">
                <div
                  className={cn("h-2.5 rounded-full transition-[width] duration-1000 ease-out", good ? "bg-success" : "bg-destructive")}
                  style={{ width: active ? `${width}%` : "0%", transitionDelay: `${i * 0.15}s` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-secondary p-3 text-xs text-foreground/80">العرض الثالث كلّف أكثر مما جلب من مبيعات إضافية.</p>
      </div>
    );
  }
  if (kind === "watch") {
    const rows: Array<[string, string, string, boolean]> = [
      ["عمولة طلبات الاستلام · فرع العليا", "21.4%", "16.2%", true],
      ["رسوم الدفع · فرع الملقا", "2.2%", "ضمن المعتاد", false],
      ["التعويضات · فرع النرجس", "0.4%", "ضمن المعتاد", false],
    ];
    return (
      <div className={card}>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="size-4 text-primary-text" /> رقيب <span className="font-normal text-muted-foreground">· المراقب الذكي</span>
          </p>
          <span className="rounded-full bg-destructive/12 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">تنبيه واحد</span>
        </div>
        <div className="mt-4 space-y-2.5">
          {rows.map(([label, value, usual, alert], i) => (
            <div
              key={label}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border p-3 transition-[opacity,transform] duration-500",
                alert ? "border-destructive/40 bg-destructive/6" : "border-border",
                active ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0",
              )}
              style={{ transitionDelay: `${0.15 + i * 0.12}s` }}
            >
              <p className="text-[13px] font-semibold">{label}</p>
              <p className="shrink-0 text-end">
                <span className={cn("num block text-sm font-semibold", alert && "text-destructive")}>{value}</span>
                <span className={cn("block text-[11px]", alert ? "text-destructive" : "text-success")}>{alert ? (
                    <>
                      المعتاد <bdi dir="ltr">{usual}</bdi>
                    </>
                  ) : (
                    `✓ ${usual}`
                  )}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-secondary p-3 text-xs text-foreground/80">
          أثر التنبيه هذا الشهر: <span className="num font-semibold">1,240 ر.س</span>
        </p>
      </div>
    );
  }
  if (kind === "daily") {
    const days: Array<[string, number, boolean]> = [
      ["01", 72, false],
      ["02", 66, false],
      ["03", 71, false],
      ["04", 60, false],
      ["05", 68, false],
      ["06", 74, false],
      ["07", 70, true],
    ];
    return (
      <div className={card}>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-primary-text" /> {PRODUCTS.nabd.name} <span className="font-normal text-muted-foreground">· {PRODUCTS.nabd.descriptor}</span>
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["المبيعات", "861,071"],
              ["تكلفة المنصة", "27.6%"],
              ["التحويل المتوقع", "2.3M"],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted/60 px-2 py-2.5">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="num mt-1 text-[15px] font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div dir="ltr" className="mt-4 flex h-24 items-end gap-2">
          {days.map(([day, height, incomplete], i) => (
            <div key={day} className="flex h-full flex-1 flex-col items-center gap-1">
              <div className="relative w-full flex-1">
                <div
                  className={cn("absolute inset-x-0 bottom-0 rounded-t-md transition-[height] duration-1000 ease-out", incomplete ? "bg-chart-1/30" : "bg-chart-1")}
                  style={{ height: active ? `${height}%` : "0%", transitionDelay: `${i * 0.08}s` }}
                />
              </div>
              <span className="num text-[10px] text-muted-foreground">{Number(day)}</span>
            </div>
          ))}
        </div>
        <p
          className={cn("mt-4 rounded-xl bg-warning/15 p-3 text-xs font-semibold text-warning transition-opacity duration-700", active ? "opacity-100" : "opacity-0")}
          style={{ transitionDelay: "0.8s" }}
        >
          ملف يوم 7 غير مكتمل: طلبات بلا عمولة بعد، أعد تصديره لاحقاً
        </p>
      </div>
    );
  }
  if (kind === "journal") {
    const lines: Array<[string, string, string]> = [
      ["ذمم المنصات", "112,418.40", ""],
      ["عمولة المنصات", "26,312.75", ""],
      ["ضريبة المدخلات", "3,946.91", ""],
      ["إيرادات المبيعات", "", "124,067.88"],
      ["ضريبة المخرجات", "", "18,610.18"],
    ];
    return (
      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">قيد فرع العليا · هنقرستيشن</p>
          <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px]">مركز تكلفة: العليا</span>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-border text-[12px] sm:text-[12.5px]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground sm:gap-3 sm:px-3">
            <span>الحساب</span>
            <span className="w-[4.6rem] text-end sm:w-20">مدين</span>
            <span className="w-[4.6rem] text-end sm:w-20">دائن</span>
          </div>
          {lines.map(([account, debit, credit], i) => (
            <div
              key={account}
              className={cn("grid grid-cols-[1fr_auto_auto] gap-2 border-t border-border px-2.5 py-1.5 transition-opacity duration-500 sm:gap-3 sm:px-3 sm:py-2", active ? "opacity-100" : "opacity-0")}
              style={{ transitionDelay: `${0.1 + i * 0.12}s` }}
            >
              <span className="truncate">{account}</span>
              <span className="num w-[4.6rem] text-end sm:w-20">{debit}</span>
              <span className="num w-[4.6rem] text-end sm:w-20">{credit}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">تصدير إلى</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {["Excel", "Odoo", "Zoho Books", "QuickBooks", "قيود", "دفترة"].map((system) => (
            <span key={system} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold">
              {system}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "columns") {
    return (
      <div className={cn(card, "flex flex-col gap-4")}>
        <p className="text-sm font-semibold">المنصة غيّرت ملفها</p>
        <div dir="ltr" className="flex flex-wrap items-center gap-2.5 font-mono text-[13px]">
          <span className="rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground line-through">Commission</span>
          <ArrowRight className="size-4 text-primary-text" />
          <span className={cn("rounded-lg border border-primary px-2.5 py-1.5 transition-opacity duration-700", active ? "opacity-100" : "opacity-0")} style={{ transitionDelay: "0.3s" }}>
            Commission Amount
          </span>
          <Check className={cn("size-5 text-success transition-opacity duration-500", active ? "opacity-100" : "opacity-0")} style={{ transitionDelay: "0.8s" }} />
        </div>
        <p className="rounded-xl bg-success-soft p-3 text-xs font-semibold text-success">✓ تأكيد بسيط مرة واحدة، ويتذكره تدقيق للملفات القادمة</p>
        <p className="rounded-xl bg-warning/15 p-3 text-xs font-semibold text-warning">عمود مالي جديد: «Packaging fee» · راجعه قبل اعتماد النتيجة</p>
      </div>
    );
  }
  return (
    <div className={cn(card, "flex flex-col gap-3")}>
      <p className="flex items-center gap-2 text-xs font-semibold text-primary-text">
        <Sparkles className="size-4" /> Tadqeeq AI
      </p>
      <p className="w-fit self-end rounded-2xl rounded-ee-sm bg-ink px-3.5 py-2 text-sm text-ink-foreground">ما الذي أكل أكثر من إيراداتي هذا الشهر؟</p>
      <p className={cn("rounded-2xl rounded-es-sm bg-muted px-3.5 py-2.5 text-sm leading-7 transition-opacity duration-700", active ? "opacity-100" : "opacity-0")} style={{ transitionDelay: "0.4s" }}>
        العمولة أخذت 20% من المبيعات في هنقرستيشن، أعلى بنقطتين من عقدك. الفرق <span className="num font-semibold">1,659.00 ر.س</span> ومسجل كاستثناء جاهز للمطالبة.
      </p>
      <p className="text-[11px] text-muted-foreground">الأرقام من المحرك المحاسبي، والصياغة من الذكاء الاصطناعي.</p>
    </div>
  );
}

type CheckState = "idle" | "scanning" | "checked";

function CheckCard({
  item,
  state,
  flagged,
  compact = false,
  selected = false,
  onSelect,
}: {
  item: CheckItem;
  state: CheckState;
  flagged: boolean;
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const dark = flagged && state === "checked";
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "step" : undefined}
      className={cn(
        "group relative h-full w-full overflow-hidden rounded-[14px] border text-start transition-[border-color,background-color,box-shadow,transform,opacity] duration-500 hover:-translate-y-1",
        compact ? "p-4" : "p-5",
        dark
          ? "border-ink bg-ink text-ink-foreground"
          : state === "scanning" || selected
            ? "border-primary bg-card shadow-[0_0_0_4px_oklch(0.66_0.13_70/0.18)]"
            : "border-border bg-card hover:border-primary/50",
      )}
    >
      {state === "scanning" ? <span aria-hidden="true" className="lp-scanbar absolute inset-y-0 w-1/3" /> : null}
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid place-items-center rounded-xl transition-colors duration-500",
            compact ? "size-9" : "size-10",
            dark ? "bg-ink-foreground/10 text-primary" : "bg-muted text-primary-text",
          )}
        >
          <Icon className="size-5" />
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-all duration-300",
            state === "checked" ? "scale-100 opacity-100" : "scale-75 opacity-0",
            flagged ? "bg-primary text-primary-foreground" : "bg-success/15 text-success",
          )}
        >
          {flagged ? "يحتاج مراجعة" : "✓ تم التحقق"}
        </span>
      </div>
      <h3 className={cn("relative font-bold", compact ? "mt-3 text-[15px]" : "mt-4")}>{item.title}</h3>
      <p className={cn("relative mt-1.5 text-[13px]", dark ? "text-ink-muted" : "text-muted-foreground")}>{item.body}</p>
      <span className={cn("relative mt-3 block text-[11px] font-semibold", dark ? "text-primary" : "text-primary-text")}>
        {onSelect ? "كيف نتحقق؟" : null}
      </span>
    </button>
  );
}

function CheckExplainer({ item, index, flagged }: { item: CheckItem; index: number; flagged: boolean }) {
  const Icon = item.icon;
  return (
    <div key={item.title} className="lp-stagger mt-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 place-items-center rounded-xl", flagged ? "bg-ink text-primary" : "bg-secondary text-primary-text")}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="num text-[11px] text-muted-foreground" dir="ltr">
            {String(index + 1).padStart(2, "0")} / {String(CHECKS.length).padStart(2, "0")}
          </p>
          <p className="font-bold">{item.title}</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] font-semibold text-primary-text">كيف نتحقق</p>
      <p className="mt-1 text-sm leading-7 text-foreground/85">{item.how}</p>
      <p className="mt-3 rounded-xl bg-muted px-3 py-2.5 text-[13px]">
        <span className="font-semibold">مثال: </span>
        {item.example}
      </p>
    </div>
  );
}

/** 0..1 progress of scrolling through a tall track whose child is sticky. */
function useTrackProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const raw = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0;
      setProgress((prev) => (Math.abs(prev - raw) < 0.004 ? prev : raw));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return [ref, progress] as const;
}

/** Scales its child down (never up) so it fits the box, whatever the phone's height. */
function FitBox({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next = Math.min(1, (outer.clientHeight - 24) / inner.offsetHeight);
      setScale(next > 0 ? Math.round(next * 100) / 100 : 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={outerRef} className="absolute inset-0 grid place-items-center overflow-hidden px-3">
      <div ref={innerRef} className="grid w-full place-items-center" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/** Phone version of the pinned sections: progress segments, the current step's text, and its visual fitted below. */
function MobilePinned({
  labels,
  stepVh = 60,
  panelClass,
  fillClass,
  renderText,
  renderVisual,
}: {
  labels: string[];
  stepVh?: number;
  panelClass: string;
  fillClass: string;
  renderText: (index: number) => ReactNode;
  renderVisual: (index: number, active: boolean) => ReactNode;
}) {
  const [trackRef, progress] = useTrackProgress<HTMLDivElement>();
  const count = labels.length;
  const scaled = Math.min(0.999, progress / 0.92) * count;
  const active = Math.min(count - 1, Math.floor(scaled));
  const within = progress >= 0.92 ? 1 : scaled - active;

  function jumpTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const scrollable = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + scrollable * 0.92 * ((index + 0.15) / count), behavior: "smooth" });
  }

  return (
    <div ref={trackRef} className="relative lg:hidden" style={{ height: `${100 + count * stepVh}vh` }}>
      <div className="sticky top-0 flex h-[100svh] flex-col px-4 pt-[84px] pb-4 sm:px-6 sm:pt-[96px]">
        <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">
          <div className="flex gap-1.5">
            {labels.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => jumpTo(index)}
                aria-label={label}
                aria-current={index === active ? "step" : undefined}
                className="flex-1 py-2"
              >
                <span className="block h-1 overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className={cn("block h-full rounded-full transition-[width] duration-300 ease-out", fillClass)}
                    style={{ width: `${Math.round((index < active ? 1 : index === active ? within : 0) * 100)}%` }}
                  />
                </span>
              </button>
            ))}
          </div>
          <div key={active} className="lp-stagger mt-1.5 flex shrink-0 flex-col">
            {renderText(active)}
          </div>
          <div className={cn("relative mt-3 min-h-0 flex-1 overflow-hidden rounded-3xl", panelClass)}>
            {labels.map((label, index) => (
              <div
                key={label}
                aria-hidden={index !== active}
                className={cn(
                  "absolute inset-0 transition-[opacity,transform] duration-500 ease-out",
                  index === active
                    ? "translate-y-0 opacity-100"
                    : index < active
                      ? "pointer-events-none -translate-y-6 opacity-0"
                      : "pointer-events-none translate-y-6 opacity-0",
                )}
              >
                <FitBox>{renderVisual(index, index === active)}</FitBox>
              </div>
            ))}
            <span className="absolute bottom-3 start-4 rounded-full bg-card/80 px-2.5 py-1 text-[10px] text-muted-foreground">
              مثال توضيحي
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Where the audit is for a 0..1 scroll progress: `active` lines are checked, the next one is being scanned. */
function checkProgress(progress: number) {
  // Slightly shorter than the track so the last card settles before the section unpins.
  const active = Math.min(CHECKS.length, Math.floor(Math.min(1, progress / 0.9) * CHECKS.length));
  const focus = Math.min(active, CHECKS.length - 1);
  return { active, verified: Math.min(active, CHECKS.length - 1), done: active >= CHECKS.length, focus };
}

function ChecksGrid() {
  const [trackRef, progress] = useTrackProgress<HTMLDivElement>();
  const [mobileTrackRef, mobileProgress] = useTrackProgress<HTMLDivElement>();
  const desktop = checkProgress(progress);
  const mobile = checkProgress(mobileProgress);

  function jumpTo(track: HTMLDivElement | null, index: number) {
    if (!track) return;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const scrollable = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + scrollable * 0.9 * ((index + 0.3) / CHECKS.length), behavior: "smooth" });
  }

  const intro = (heading: "h2" | "aria") => (
    <SectionIntro eyebrow="ما الذي نراجعه" title="كل بند في الفاتورة، لا الإجمالي فقط." heading={heading}>
      أي خصم لا يطابق خريطة الرسوم يظهر كبند غير مصنف بدلاً من أن يمر دون أن يلاحظه أحد.
    </SectionIntro>
  );

  const status = ({ active, verified, done }: ReturnType<typeof checkProgress>) => (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          تم التحقق من <span className="num text-2xl font-semibold text-foreground">{verified}</span> من{" "}
          <span className="num">{CHECKS.length - 1}</span> بنود
        </p>
        <span className={cn("text-xs font-semibold", done ? "text-success" : "text-primary-text")}>
          {done ? "اكتمل التدقيق" : "جارٍ التدقيق"}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${Math.round((active / CHECKS.length) * 100)}%` }}
        />
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-500",
          done ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-ink px-4 py-3 text-ink-foreground">
            <p className="text-[13px]">7 بنود مطابقة، وبند واحد يحتاج مراجعة</p>
            <p className="shrink-0 text-end">
              <span className="num block text-xl font-semibold text-primary">1,907.85</span>
              <span className="text-[11px] text-ink-muted">ر.س لصالحك · مثال</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const cardState = (index: number, active: number): CheckState =>
    index < active ? "checked" : index === active ? "scanning" : "idle";

  return (
    <section id="checks" aria-label="ما الذي نراجعه">
      <div ref={trackRef} className="relative hidden lg:block" style={{ height: `${CHECKS.length * 45 + 70}vh` }}>
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-12 px-6 pt-20">
            <div>
              <div className="[&_h2]:text-[2.2rem] [&_h2]:leading-[1.35]">{intro("h2")}</div>
              <div className="mt-6">{status(desktop)}</div>
              <CheckExplainer
                key={desktop.focus}
                item={CHECKS[desktop.focus]!}
                index={desktop.focus}
                flagged={desktop.focus === CHECKS.length - 1}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CHECKS.map((item, index) => (
                <CheckCard
                  key={item.title}
                  compact
                  item={item}
                  flagged={index === CHECKS.length - 1}
                  selected={!desktop.done && index === desktop.focus}
                  state={cardState(index, desktop.active)}
                  onSelect={() => jumpTo(trackRef.current, index)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-20 sm:px-6 lg:hidden">{intro("aria")}</div>
      <div ref={mobileTrackRef} className="relative lg:hidden" style={{ height: `${100 + CHECKS.length * 40}vh` }}>
        <div className="sticky top-0 flex h-[100svh] flex-col px-4 pt-[88px] pb-4 sm:px-6 sm:pt-[100px]">
          <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">
            {status(mobile)}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {CHECKS.map((item, index) => (
                <CheckTile
                  key={item.title}
                  item={item}
                  flagged={index === CHECKS.length - 1}
                  selected={!mobile.done && index === mobile.focus}
                  state={cardState(index, mobile.active)}
                  onSelect={() => jumpTo(mobileTrackRef.current, index)}
                />
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,black_88%,transparent)]">
              <CheckExplainer
                key={mobile.focus}
                item={CHECKS[mobile.focus]!}
                index={mobile.focus}
                flagged={mobile.focus === CHECKS.length - 1}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Compact phone tile for one fee line: icon, short title and its check state. */
function CheckTile({
  item,
  state,
  flagged,
  selected,
  onSelect,
}: {
  item: CheckItem;
  state: CheckState;
  flagged: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const dark = flagged && state === "checked";
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={item.title}
      aria-current={selected ? "step" : undefined}
      className={cn(
        "relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border px-1 pt-2.5 pb-2 text-center transition-[border-color,background-color,box-shadow] duration-500",
        dark
          ? "border-ink bg-ink text-ink-foreground"
          : state === "scanning" || selected
            ? "border-primary bg-card shadow-[0_0_0_3px_oklch(0.66_0.13_70/0.18)]"
            : "border-border bg-card",
      )}
    >
      {state === "scanning" ? <span aria-hidden="true" className="lp-scanbar absolute inset-y-0 w-1/2" /> : null}
      <span
        className={cn(
          "relative grid size-8 place-items-center rounded-lg",
          dark ? "bg-ink-foreground/10 text-primary" : "bg-muted text-primary-text",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="relative line-clamp-2 text-[10.5px] leading-[15px] font-semibold">{item.title}</span>
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1 end-1 grid size-4 place-items-center rounded-full text-[9px] font-bold transition-[opacity,transform] duration-300",
          state === "checked" ? "scale-100 opacity-100" : "scale-50 opacity-0",
          flagged ? "bg-primary text-primary-foreground" : "bg-success text-white",
        )}
      >
        {flagged ? "!" : <Check className="size-2.5" />}
      </span>
    </button>
  );
}

const ASSISTANT_STEPS = [
  { title: "اكتب طلبك في المحادثة", body: "مثل: «دقق فاتورة هنقرستيشن لشهر سبتمبر، رسوم البنك 1.8%»." },
  { title: "ارفع من الرابط الجاهز", body: "رابط آمن فيه المنصة والنسبة مسبقاً. تسحب ملف الطلبات والفاتورة وتضغط تحليل." },
  { title: "اسأل عن النتيجة", body: "الفروقات وما تطالب به، أعلى الفروع تكلفة، والمقارنة مع الشهر الماضي، في نفس المحادثة." },
];

/** Using Tadqeeq from Claude or ChatGPT (the MCP: الشاملة, or the add-on on other plans): three steps and an illustrative chat. */
function AssistantSection() {
  return (
    <section id="assistant" className="bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-28">
        <div data-reveal>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            جديد · في الشاملة، أو كإضافة لباقتك
          </p>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]">دقّق فواتيرك من داخل Claude و ChatGPT.</h2>
          <p className="mt-4 text-base leading-8 text-ink-muted sm:text-[17px]">
            اربط حساب تدقيق بمساعدك الذكي واطلب التدقيق بجملة. يعطيك رابط رفع جاهز، وبعد الرفع يشرح لك النتيجة في نفس المحادثة. الأرقام من
            المحرك المحاسبي في تدقيق، والمساعد يشرحها فقط.
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
          <a href="#pricing" className="mt-8 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
            اطّلع على الباقات
            <ArrowLeft className="size-4" />
          </a>
        </div>
        <AssistantChatMock />
      </div>
    </section>
  );
}

function AssistantChatMock() {
  const user = "ms-auto max-w-[85%] rounded-2xl rounded-se-sm bg-primary px-4 py-3 text-sm leading-7 text-primary-foreground";
  const bot = "max-w-[92%] rounded-2xl rounded-ss-sm bg-ink-foreground/10 px-4 py-3 text-sm leading-7";
  return (
    <div data-reveal aria-label="مثال توضيحي لمحادثة مع المساعد" className="rounded-[22px] border border-ink-foreground/15 bg-ink-foreground/[0.04] p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between text-xs text-ink-muted">
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Claude · ChatGPT + تدقيق
        </span>
        <span className="rounded-full border border-ink-foreground/20 px-2.5 py-0.5">مثال توضيحي</span>
      </div>
      <div className="space-y-3">
        <p className={user}>دقق فاتورة هنقرستيشن لشهر سبتمبر، رسوم البنك 1.8%</p>
        <div className={bot}>
          جهّزت لك رابط الرفع. ارفع ملف الطلبات والفاتورة ثم ارجع واكتب «خلصت».
          <span className="mt-2 flex items-center gap-2 rounded-xl bg-ink-foreground/10 px-3 py-2 text-xs">
            <Upload className="size-4 shrink-0 text-primary" />
            <span dir="ltr" className="num truncate">tadqeeq.app/import</span>
            <span className="ms-auto shrink-0 text-ink-muted">
              هنقرستيشن · <span className="num">1.8%</span>
            </span>
          </span>
        </div>
        <p className={user}>خلصت</p>
        <div className={bot}>
          <p>دققت سبتمبر لـ <span className="num">6</span> فروع:</p>
          <ul className="mt-2 space-y-1.5">
            <li className="flex justify-between gap-3">
              <span>فرق في العمولة (<span className="num">3</span> فروع)</span>
              <span className="font-semibold text-primary"><span className="num">2,340</span> ر.س</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>تعويضات بدون دليل</span>
              <span className="font-semibold text-primary"><span className="num">1,180</span> ر.س</span>
            </li>
            <li className="flex justify-between gap-3 border-t border-ink-foreground/15 pt-1.5">
              <span className="font-semibold">تستطيع المطالبة بـ</span>
              <span className="font-bold"><span className="num">3,520</span> ر.س</span>
            </li>
          </ul>
          <p className="mt-2 text-ink-muted">أعلى فرع تكلفة: العليا. تبي أقارنه مع أغسطس؟</p>
        </div>
      </div>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  tone = "primary",
  heading = "h2",
  children,
}: {
  eyebrow: string;
  title: string;
  tone?: "primary" | "success";
  /** "aria" keeps heading semantics without a second <h2> when a section renders its intro twice (desktop + phone). */
  heading?: "h2" | "aria";
  children?: ReactNode;
}) {
  const titleClass = "mt-3 font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]";
  return (
    <div data-reveal className="flex flex-col">
      <p className={cn("flex items-center gap-2 text-[13px] font-semibold", tone === "success" ? "text-success" : "text-primary-text")}>
        <span className={cn("size-1.5 rounded-full", tone === "success" ? "bg-success" : "bg-primary")} />
        {eyebrow}
      </p>
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
    <div
      aria-hidden="true"
      className="lp-slide flex overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_30px_60px_-30px_rgb(19_35_43/0.25)] lg:-me-24 lg:rounded-e-none"
    >
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

function InvoiceMock() {
  return (
    <div data-reveal aria-hidden="true" className="flex flex-col gap-4 rounded-[22px] bg-secondary p-5 sm:p-9">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="rounded-2xl bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">حسب فاتورة المنصة</p>
            <PlatformName platform="hungerstation" className="text-[11px] font-semibold" iconClassName="size-4 rounded" />
          </div>
          <p className="num mt-2.5 text-3xl font-semibold">16,590.00</p>
          <p className="mt-2 text-xs text-muted-foreground">عمولة 20% محتسبة</p>
        </div>
        <div className="rounded-2xl bg-card p-5 shadow-[0_20px_40px_-24px_rgb(19_35_43/0.35)]">
          <p className="text-xs text-muted-foreground">حسب عقدك</p>
          <p className="num mt-2.5 text-3xl font-semibold text-success">14,931.00</p>
          <p className="mt-2 text-xs text-muted-foreground">عمولة 18% متفق عليها</p>
        </div>
      </div>
      <div className="flex flex-col gap-1 rounded-2xl bg-card p-3 text-[13px]">
        {[
          ["عمولة المبيعات", "+1,659.00", false],
          ["ضريبة القيمة المضافة على العمولة", "+248.85", false],
          ["رسوم الدفع الإلكتروني", "مطابق", true],
        ].map(([label, value, ok], index) => (
          <div key={String(label)} className="lp-scan flex justify-between rounded-md px-2 py-2.5" style={{ animationDelay: `${index * 2}s` }}>
            <span>{label}</span>
            <span className={ok ? "font-semibold text-success" : "num text-destructive"}>{value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <span className="lp-pulse flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[13px] text-ink-foreground">
          الفرق لصالحك <span className="num text-primary">1,907.85 ر.س</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-[13px]">
          <Check className="size-3.5 text-success" />
          مطالبة جاهزة
        </span>
      </div>
    </div>
  );
}

type FlowStep = { title: string; who: string; body: string; detail: string; icon: LucideIcon };

const COMP_FLOW: FlowStep[] = [
  {
    title: "الكاشير يصوّر الطلب",
    who: "في الفرع · ثانيتان",
    body: "قبل تسليم الطلب للمندوب، يرسل الكاشير فيديو أو صورة للطلب والإيصال في قروب الفرع على Telegram.",
    detail: "لا تطبيق ولا تسجيل دخول للموظف، فقط القروب الذي يستخدمه الفرع أصلاً.",
    icon: Video,
  },
  {
    title: "تدقيق يربطه برقم الطلب",
    who: "تلقائياً · خلال ثوانٍ",
    body: "البوت يقرأ رقم الطلب من الإيصال أو من نص الرسالة، ويحفظ الدليل مربوطاً بالفرع ووقت الإرسال.",
    detail: "حتى لو لم يكتب الكاشير الرقم، يُقرأ من صورة الإيصال.",
    icon: Upload,
  },
  {
    title: "التعويض يظهر في الفاتورة",
    who: "عند رفع ملف التعويضات",
    body: "عندما تخصم المنصة تعويضاً على طلب، يطابقه تدقيق مع الدليل المحفوظ ويكشف التكرار أو الفرع الخاطئ.",
    detail: "كل تعويض يظهر بحالته: يوجد دليل، أو لا يوجد، أو مشتبه بالتكرار.",
    icon: SearchCheck,
  },
  {
    title: "ملف الاعتراض جاهز",
    who: "بضغطة واحدة",
    body: "يكتب الموظف ما حدث، ويبني تدقيق رسالة الاعتراض بالعربي والإنجليزي من البيانات المؤكدة، مرفقاً بالدليل.",
    detail: "انسخ الرسالة وأرسلها للمنصة مع رابط الفيديو.",
    icon: FileSpreadsheet,
  },
  {
    title: "متابعة حتى الاسترداد",
    who: "في «استرداد»",
    body: "كل حالة تتنقل من مرسلة إلى مقبولة ثم مسترَدة، مع مرجع المنصة ولوحة تعرض ما استرددته فعلاً.",
    detail: "المبالغ المسترَدة ونسبة الاسترداد لكل فرع ومنصة في مكان واحد.",
    icon: HandCoins,
  },
];

const FLOW_TONES = {
  success: {
    eyebrowTone: "success" as const,
    track: "bg-success/20",
    fill: "bg-success",
    on: "border-success bg-success text-white",
    done: "border-success bg-card text-success",
    idle: "border-success/25 bg-card text-muted-foreground",
    who: "text-success",
    panel: "bg-success/15",
    blob: "bg-success/10",
    ring: "border-success/25",
    counter: "text-success",
    note: "bg-card/70",
    mobileIcon: "bg-success text-white",
    mobileNote: "bg-success-soft",
  },
  primary: {
    eyebrowTone: "primary" as const,
    track: "bg-primary/20",
    fill: "bg-primary",
    on: "border-primary bg-primary text-primary-foreground",
    done: "border-primary bg-card text-primary-text",
    idle: "border-border bg-card text-muted-foreground",
    who: "text-primary-text",
    panel: "bg-secondary",
    blob: "bg-primary/10",
    ring: "border-primary/25",
    counter: "text-primary-text",
    note: "bg-card",
    mobileIcon: "bg-ink text-primary",
    mobileNote: "bg-muted",
  },
};

/** Scroll-pinned workflow: a vertical stepper explains each stage while the visual changes beside it. */
function ScrollFlow({
  id,
  eyebrow,
  title,
  tone,
  className,
  steps,
  renderVisual,
}: {
  id: string;
  eyebrow: string;
  title: string;
  tone: keyof typeof FLOW_TONES;
  className?: string;
  steps: FlowStep[];
  renderVisual: (index: number, active: boolean) => ReactNode;
}) {
  const t = FLOW_TONES[tone];
  const [trackRef, progress] = useTrackProgress<HTMLDivElement>();
  const count = steps.length;
  const active = Math.min(count - 1, Math.floor(Math.min(0.999, progress / 0.92) * count));

  function jumpTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const scrollable = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + scrollable * 0.92 * ((index + 0.3) / count), behavior: "smooth" });
  }

  const intro = (heading: "h2" | "aria") => <SectionIntro eyebrow={eyebrow} title={title} tone={t.eyebrowTone} heading={heading} />;
  const counter = (i: number) => `${String(i + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`;

  return (
    <section id={id} aria-label={eyebrow} className={className}>
      <div ref={trackRef} className="relative hidden lg:block" style={{ height: `${count * 60 + 60}vh` }}>
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-12 px-6 pt-20">
            <div>
              <div className="[&_h2]:text-[2.2rem] [&_h2]:leading-[1.35]">{intro("h2")}</div>
              <ol className="relative mt-6">
                <span aria-hidden="true" className={cn("absolute inset-y-4 start-[19px] w-0.5 rounded-full", t.track)}>
                  <span
                    className={cn("block w-full rounded-full transition-[height] duration-500 ease-out", t.fill)}
                    style={{ height: `${(active / Math.max(1, count - 1)) * 100}%` }}
                  />
                </span>
                {steps.map((step, index) => {
                  const on = index === active;
                  const done = index < active;
                  return (
                    <li key={step.title} className="relative">
                      <button
                        type="button"
                        onClick={() => jumpTo(index)}
                        aria-current={on ? "step" : undefined}
                        className="flex w-full items-start gap-4 py-2 text-start"
                      >
                        <span
                          className={cn(
                            "relative z-10 grid size-10 shrink-0 place-items-center rounded-full border-2 transition-colors duration-500",
                            on ? t.on : done ? t.done : t.idle,
                          )}
                        >
                          {done ? <Check className="size-5" /> : <step.icon className="size-[18px]" />}
                        </span>
                        <span className="min-w-0 flex-1 pt-1.5">
                          <span className={cn("block font-bold transition-colors", on ? "text-foreground" : "text-foreground/60")}>
                            {step.title}
                          </span>
                          <span
                            className={cn(
                              "grid transition-[grid-template-rows,opacity] duration-500",
                              on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                            )}
                          >
                            <span className="overflow-hidden">
                              <span className={cn("mt-1 block text-[11px] font-semibold", t.who)}>{step.who}</span>
                              <span className="mt-1.5 block text-sm leading-7 text-foreground/80">{step.body}</span>
                              <span className={cn("mt-2 block rounded-lg px-3 py-2 text-[13px] text-muted-foreground", t.note)}>{step.detail}</span>
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className={cn("relative h-[560px] overflow-hidden rounded-[28px]", t.panel)}>
              <span aria-hidden="true" className={cn("absolute -top-24 -start-24 size-72 rounded-full", t.blob)} />
              <span aria-hidden="true" className={cn("absolute -bottom-40 -end-24 size-[26rem] rounded-full border", t.ring)} />
              <span className={cn("num absolute top-5 end-6 text-sm", t.counter)} dir="ltr">
                {counter(active)}
              </span>
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  aria-hidden={index !== active}
                  className={cn(
                    "absolute inset-0 grid place-items-center p-10 transition-[opacity,transform] duration-700 ease-out",
                    index === active
                      ? "translate-y-0 scale-100 opacity-100"
                      : index < active
                        ? "pointer-events-none -translate-y-10 scale-95 opacity-0"
                        : "pointer-events-none translate-y-10 scale-95 opacity-0",
                  )}
                >
                  {renderVisual(index, index === active)}
                </div>
              ))}
              <span className="absolute bottom-4 start-5 rounded-full bg-card/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                مثال توضيحي
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-20 sm:px-6 lg:hidden">{intro("aria")}</div>
      <MobilePinned
        labels={steps.map((step) => step.title)}
        panelClass={t.panel}
        fillClass={t.fill}
        renderVisual={renderVisual}
        renderText={(index) => {
          const step = steps[index]!;
          return (
            <>
              <div className="flex items-center gap-3">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", t.mobileIcon)}>
                  <step.icon className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[11px]">
                    <span className="num text-muted-foreground" dir="ltr">
                      {counter(index)}
                    </span>
                    <span className={cn("font-semibold", t.who)}>{step.who}</span>
                  </p>
                  <h3 className="text-lg font-bold">{step.title}</h3>
                </div>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-foreground/80">{step.body}</p>
              <p className={cn("mt-2 rounded-lg px-3 py-2 text-xs leading-5 text-muted-foreground", t.mobileNote)}>{step.detail}</p>
            </>
          );
        }}
      />
    </section>
  );
}

function CompensationFlow() {
  return (
    <ScrollFlow
      id="compensation"
      eyebrow="استرداد · مركز التعويضات"
      title="تعويض لم تتسبب فيه؟ اعترض عليه بالدليل."
      tone="success"
      className="bg-success-soft"
      steps={COMP_FLOW}
      renderVisual={(index, active) => <CompensationStepVisual step={index} active={active} />}
    />
  );
}

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

function HowItWorks() {
  return (
    <ScrollFlow
      id="how"
      eyebrow="كيف يعمل"
      title="أربع خطوات. بدون جداول يدوية."
      tone="primary"
      className="bg-muted"
      steps={HOW_FLOW}
      renderVisual={(index, active) => <HowStepVisual step={index} active={active} />}
    />
  );
}

function HowStepVisual({ step, active }: { step: number; active: boolean }) {
  const shadow = "shadow-[0_24px_48px_-28px_rgb(19_35_43/0.45)]";
  const rise = (delay: number, extra = "") => ({
    className: cn(extra, "transition-[opacity,transform] duration-500", active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"),
    style: { transitionDelay: `${delay}s` },
  });
  if (step === 0) {
    const files: Array<[string, string, string]> = [
      ["orders_aug.xlsx", "ملف الطلبات · 12,806 طلب", "XLSX"],
      ["invoice_aug.pdf", "فاتورة المنصة · 14 صفحة", "PDF"],
    ];
    return (
      <div className={cn("w-full max-w-md rounded-2xl bg-card p-5", shadow)}>
        <div className="grid place-items-center rounded-xl border-2 border-dashed border-primary/40 bg-secondary/50 px-4 py-6 text-center">
          <Upload className="size-6 text-primary-text" />
          <p className="mt-2 text-sm font-semibold">اسحب الملفات هنا</p>
          <p className="text-[11px] text-muted-foreground">Excel · CSV · PDF</p>
        </div>
        <div className="mt-3 space-y-2">
          {files.map(([name, meta, ext], i) => (
            <div key={name} {...rise(0.15 + i * 0.15, "flex items-center gap-3 rounded-xl border border-border p-2.5")}>
              <span className="num grid size-9 place-items-center rounded-lg bg-muted text-[10px] font-semibold">{ext}</span>
              <div className="min-w-0 flex-1">
                <p className="num truncate text-[13px] font-semibold" dir="ltr">{name}</p>
                <p className="text-[11px] text-muted-foreground">{meta}</p>
              </div>
              <Check className="size-4 text-success" />
            </div>
          ))}
        </div>
        <div {...rise(0.5, "mt-3 flex flex-wrap gap-2 text-[11px]")}>
          <span className="inline-flex items-center gap-1 rounded-full bg-ink py-1 ps-1 pe-2.5 text-ink-foreground">
            <PlatformIcon platform="hungerstation" className="size-4 rounded-full" />
            المنصة: هنقرستيشن
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1">الفترة: أغسطس</span>
          <span className="rounded-full bg-muted px-2.5 py-1">12 فرعاً</span>
        </div>
      </div>
    );
  }
  if (step === 1) {
    const lines: Array<[string, string, string]> = [
      ["عمولة المبيعات", "82,950.00 × 18%", "14,931.00"],
      ["رسوم الدفع", "61,200.00 × 1%", "612.00"],
      ["حملات التوصيل", "702 طلب × 6.00", "4,212.00"],
      ["ضريبة الرسوم", "19,755.00 × 15%", "2,963.25"],
    ];
    return (
      <div className={cn("w-full max-w-md rounded-2xl bg-card p-5", shadow)}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">إعادة الاحتساب</p>
          <span className="num rounded-full bg-muted px-2.5 py-1 text-[11px]" dir="ltr">engine v1.1 · عقد 2026</span>
        </div>
        <div className="mt-4 space-y-2">
          {lines.map(([label, formula, value], i) => (
            <div key={label} {...rise(0.1 + i * 0.14, "flex items-center justify-between gap-3 rounded-xl bg-background px-3.5 py-2.5 text-[13px]")}>
              <span className="font-semibold">{label}</span>
              <span className="num text-[11px] text-muted-foreground" dir="ltr">{formula}</span>
              <span className="num font-semibold">{value}</span>
            </div>
          ))}
        </div>
        <p {...rise(0.75, "mt-3 flex items-center gap-2 text-[12px] text-success")}>
          <Check className="size-4" /> كل بند مُعاد احتسابه من الطلبات نفسها
        </p>
      </div>
    );
  }
  if (step === 2) {
    const statuses = ["جديد", "قيد المراجعة", "تم التواصل", "تم الاعتراض"];
    return (
      <div className={cn("w-full max-w-md rounded-2xl bg-card p-5", shadow)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">فرق عمولة الفرع</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              فرع النرجس · <PlatformName platform="hungerstation" iconClassName="size-4 rounded" /> · أغسطس
            </p>
          </div>
          <span className="rounded-full bg-destructive/12 px-2.5 py-1 text-[11px] font-semibold text-destructive">حرج</span>
        </div>
        <div {...rise(0.1, "mt-4 grid grid-cols-3 gap-2 text-center text-[11px]")}>
          <div className="rounded-xl bg-background p-2.5">
            <p className="text-muted-foreground">الفاتورة</p>
            <p className="num mt-1 text-sm font-semibold">16,590.00</p>
          </div>
          <div className="rounded-xl bg-background p-2.5">
            <p className="text-muted-foreground">المحتسب</p>
            <p className="num mt-1 text-sm font-semibold text-success">14,931.00</p>
          </div>
          <div className="rounded-xl bg-ink p-2.5 text-ink-foreground">
            <p className="text-ink-muted">الفرق</p>
            <p className="num mt-1 text-sm font-semibold text-primary">1,659.00</p>
          </div>
        </div>
        <p {...rise(0.3, "mt-3 rounded-xl bg-muted px-3 py-2 text-[12px]")}>
          المصدر: السطر 14 في الفاتورة · المعادلة: المبيعات × 18%
        </p>
        <div {...rise(0.5, "mt-3 flex flex-wrap items-center gap-1.5 text-[11px]")}>
          {statuses.map((label, i) => (
            <span
              key={label}
              className={cn(
                "rounded-full px-2.5 py-1",
                i === 1 ? "bg-primary font-semibold text-primary-foreground" : i < 1 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
              )}
            >
              {label}
            </span>
          ))}
          <span className="ms-auto flex items-center gap-1.5 text-muted-foreground">
            <span className="grid size-6 place-items-center rounded-full bg-chart-2 text-[10px] font-bold text-white">س</span>
            سارة
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className={cn("rounded-2xl bg-ink p-5 text-ink-foreground", shadow)}>
        <p className="text-[11px] text-ink-muted">مطالبة الاسترداد · أغسطس</p>
        <p className="num mt-1 text-3xl font-semibold text-primary">2,638.25</p>
        <div {...rise(0.2, "mt-3 flex flex-wrap gap-2 text-[11px]")}>
          <span className="rounded-full bg-ink-foreground/10 px-2.5 py-1">3 استثناءات</span>
          <span className="rounded-full bg-ink-foreground/10 px-2.5 py-1">أدلة مرفقة</span>
          <span className="rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground">جاهزة للإرسال</span>
        </div>
      </div>
      <div {...rise(0.45, cn("rounded-2xl bg-card p-4", shadow))}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">الفترات السابقة</p>
          <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">أغسطس · مغلقة</span>
        </div>
        <div className="mt-3 space-y-1.5 text-[12px] text-muted-foreground">
          <div className="flex justify-between"><span className="flex items-center gap-1">يوليو · <PlatformName platform="hungerstation" iconClassName="size-4 rounded" /></span><span>مغلقة</span></div>
          <div className="flex justify-between"><span className="flex items-center gap-1">يونيو · <PlatformName platform="jahez" iconClassName="size-4 rounded" /></span><span>مغلقة</span></div>
        </div>
      </div>
    </div>
  );
}

function CompensationStepVisual({ step, active }: { step: number; active: boolean }) {
  const shadow = "shadow-[0_24px_48px_-28px_rgb(19_35_43/0.45)]";
  const rise = (delay: number, extra = "") => ({
    className: cn(extra, "transition-[opacity,transform] duration-500", active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"),
    style: { transitionDelay: `${delay}s` },
  });
  if (step === 0) {
    return (
      <div className={cn("w-full max-w-xs rounded-[26px] bg-card p-4", shadow)}>
        <div className="flex items-center gap-2.5 border-b border-border pb-3">
          <span className="grid size-9 place-items-center rounded-full bg-chart-2 text-sm font-bold text-white">م</span>
          <div>
            <p className="text-sm font-semibold">قروب فرع الملقا</p>
            <p className="text-[11px] text-muted-foreground">3 أعضاء · بوت تدقيق</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col items-start gap-2">
          <div {...rise(0.1)}>
            <div className="lp-rec relative grid h-36 w-52 place-items-center rounded-2xl bg-ink/90 text-ink-foreground">
              <Video className="size-7" />
              <span className="num absolute bottom-2 end-2.5 rounded bg-black/40 px-1.5 text-[10px]">0:42</span>
            </div>
          </div>
          <p {...rise(0.3)}>
            <span className="block rounded-2xl rounded-ss-sm bg-muted px-3 py-2 text-[13px]">طلب الملقا قبل التسليم</span>
          </p>
          <span className="text-[10px] text-muted-foreground">خالد · 21:14</span>
        </div>
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="flex w-full max-w-md flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        <div className={cn("shrink-0 rounded-2xl bg-card p-3 sm:w-40", shadow)}>
          <div className="space-y-1.5 rounded-xl bg-muted p-3">
            <span className="block h-1.5 w-3/4 rounded bg-foreground/20" />
            <span className="block h-1.5 w-1/2 rounded bg-foreground/20" />
            <span className={cn("block rounded px-1 py-0.5 text-center font-mono text-[10px] transition-colors duration-700", active ? "bg-primary/25 text-foreground" : "bg-transparent")}>
              HS-88214073
            </span>
            <span className="block h-1.5 w-2/3 rounded bg-foreground/20" />
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">صورة الإيصال</p>
        </div>
        <div className="flex-1 space-y-2.5">
          <div {...rise(0.2)}>
            <div className="flex items-center justify-between rounded-xl bg-card px-3.5 py-2.5 text-[13px]">
              <span className="text-muted-foreground">رقم الطلب</span>
              <span className="num font-semibold">HS-88214073</span>
            </div>
          </div>
          <div {...rise(0.35)}>
            <div className="flex items-center justify-between rounded-xl bg-card px-3.5 py-2.5 text-[13px]">
              <span className="text-muted-foreground">الفرع</span>
              <span className="font-semibold">فرع الملقا</span>
            </div>
          </div>
          <div {...rise(0.5)}>
            <div className="flex items-center justify-between rounded-xl bg-card px-3.5 py-2.5 text-[13px]">
              <span className="text-muted-foreground">وقت الإرسال</span>
              <span className="num font-semibold">21:14</span>
            </div>
          </div>
          <div {...rise(0.7)}>
            <p className="flex items-center gap-2 rounded-xl bg-success px-3.5 py-2.5 text-[13px] font-semibold text-white">
              <Check className="size-4" /> تم ربط الدليل بالطلب
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (step === 2) {
    const rows: Array<[string, string, string, string]> = [
      ["HS-88214073", "142.50", "يوجد دليل", "bg-success/15 text-success"],
      ["HS-88213551", "64.00", "مكرر", "bg-warning/15 text-warning"],
      ["HS-88210917", "38.25", "لا يوجد دليل", "bg-muted text-muted-foreground"],
    ];
    return (
      <div className={cn("w-full max-w-md rounded-2xl bg-card p-5", shadow)}>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          تعويضات فاتورة <PlatformName platform="hungerstation" /> · سبتمبر
        </p>
        <div className="mt-4 space-y-2">
          {rows.map(([order, amount, status, tone], i) => (
            <div key={order} {...rise(0.1 + i * 0.12)}>
              <div className={cn("flex items-center gap-3 rounded-xl border p-3", i === 0 ? "border-success/40 bg-success-soft" : "border-border")}>
                <span className="num text-[13px] font-semibold">{order}</span>
                <span className="num ms-auto text-[13px]">{amount}</span>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", tone)}>{status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (step === 3) {
    return (
      <div className={cn("w-full max-w-md rounded-2xl bg-card p-5", shadow)}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">رسالة الاعتراض</p>
          <span className="flex rounded-full bg-muted p-0.5 text-[11px]">
            <span className="rounded-full bg-card px-2.5 py-1 font-semibold shadow-sm">عربي</span>
            <span className="px-2.5 py-1 text-muted-foreground">English</span>
          </span>
        </div>
        <div className="mt-3 rounded-xl bg-muted p-3.5 text-[13px] leading-7">
          <p {...rise(0.1)}>نطلب مراجعة التعويض على الطلب HS-88214073 بمبلغ 142.50 ر.س لفرع الملقا.</p>
          <p {...rise(0.35)}>الفيديو المرفق يُظهر تغليف الطلب كاملاً وتسليمه للمندوب الساعة 21:14.</p>
        </div>
        <div {...rise(0.6, "mt-3 flex gap-2")}>
          <span className="rounded-full bg-ink px-3.5 py-2 text-[13px] text-ink-foreground">نسخ الرسالة</span>
          <span className="rounded-full border border-border px-3.5 py-2 text-[13px]">رابط الفيديو</span>
        </div>
      </div>
    );
  }
  const stages: Array<[string, boolean]> = [
    ["مرسلة", true],
    ["مقبولة", true],
    ["مسترَدة", true],
  ];
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className={cn("rounded-2xl bg-card p-5", shadow)}>
        <div className="flex items-center justify-between">
          <p className="num text-sm font-semibold">HS-88214073</p>
          <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">مسترَدة</span>
        </div>
        <ol className="mt-4 flex items-center gap-2">
          {stages.map(([label], i) => (
            <li key={label} {...rise(0.1 + i * 0.2, "flex flex-1 items-center gap-2")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success text-white">
                <Check className="size-4" />
              </span>
              <span className="text-[13px]">{label}</span>
              {i < stages.length - 1 ? <span className="h-0.5 flex-1 rounded bg-success/40" /> : null}
            </li>
          ))}
        </ol>
      </div>
      <div {...rise(0.7, "grid grid-cols-2 gap-3")}>
        <div className="rounded-2xl bg-ink p-4 text-ink-foreground">
          <p className="text-[11px] text-ink-muted">مسترَد هذا الشهر</p>
          <p className="num mt-1 text-xl font-semibold text-primary">4,820.00</p>
        </div>
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[11px] text-muted-foreground">نسبة الاسترداد</p>
          <p className="num mt-1 text-xl font-semibold text-success">68%</p>
        </div>
      </div>
    </div>
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
      <div className="flex flex-wrap items-end justify-between gap-6">
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
