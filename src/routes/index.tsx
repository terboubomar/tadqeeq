import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
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
import { useEffect, useRef, useState, type ReactNode } from "react";

import { isLoginHost } from "@/lib/login-host";
import { SUITES } from "@/lib/suites";
import { MizanMark } from "@/components/brand/SuiteMarks";
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
import { ProductsMenu, ProductsMenuList } from "@/components/products/ProductsMenu";
import { PRODUCTS, productTitle, type ProductKey } from "@/lib/products";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OG_IMAGE, SITE_NAME, SITE_NAME_EN, SITE_URL, canonical, jsonLd, socialMeta } from "@/lib/seo";
import { CONTENT_UPDATED, EXPLAINER_VIDEO, FAQS, FEATURES, formatArabicDate } from "@/lib/site-content";
import { PlatformIcon, PlatformName, PlatformWordmark } from "@/components/brand/PlatformLogo";
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
        <section className="overflow-hidden">
          <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:pt-20">
            <div className="lp-stagger grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end lg:gap-14">
              <div>
              <p className="flex items-center gap-2.5 text-[13px] font-semibold text-primary-text">
                <span aria-hidden="true" className="flex">
                  {PLATFORM_KEYS.map((key, i) => (
                    <PlatformIcon key={key} platform={key} className={cn("size-6 rounded-full ring-2 ring-background", i > 0 && "-ms-2")} />
                  ))}
                </span>
                تدقيق فواتير هنقرستيشن وكيتا وجاهز
              </p>
              <h1 className="mt-5 font-display text-[2.15rem] font-extrabold leading-[1.3] sm:text-5xl lg:text-[3.3rem]">
                لا تدفع فاتورة هنقرستيشن أو جاهز أو كيتا قبل ما تتأكد منها.
              </h1>
              </div>
              <div className="flex flex-col gap-6">
              <p className="max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
                تدقيق يعيد احتساب كل بند في فاتورة تطبيق التوصيل من ملف طلباتك ومعادلات عقدك، يكشف الفرق لكل فرع، ويجهّز مطالبة التعويض بأدلتها.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="inline-flex h-[52px] items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
                >
                  ابدأ التدقيق
                  <ArrowLeft className="size-4" />
                </Link>
                <a href="#video" className="inline-flex h-[52px] items-center gap-2 rounded-full border border-border bg-card px-6 text-[15px] font-semibold">
                  <Play className="size-4 fill-current" />
                  شاهد كيف يعمل
                </a>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
                {["Excel وCSV وPDF", "بيانات كل شركة منفصلة", "الذكاء الاصطناعي لا يغيّر الأرقام"].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check className="size-4 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
              </div>
            </div>
            <div data-reveal className="mt-12 lg:mt-16">
              <AppShot
                priority
                src="/home/app-dashboard.webp"
                alt="اللوحة التنفيذية في تدقيق: المبيعات اليومية والعمولة ونسبة تكلفة المنصة لكل فترة"
                width={1800}
                height={1125}
              />
              <p className="mt-3 text-center text-xs text-muted-foreground">اللوحة التنفيذية كما تظهر في تدقيق، {DEMO_NOTE}.</p>
            </div>
          </div>
        </section>

        <section className="border-y border-border">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-4 px-4 py-8 text-sm text-muted-foreground sm:gap-x-10 sm:px-6">
            <span>يدعم فواتير وملفات:</span>
            <ul className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
              {PLATFORM_KEYS.map((key) => (
                <li key={key}>
                  <PlatformWordmark platform={key} className="h-10 sm:h-12" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-28">
          <SectionIntro title="ثلاث منصات، ثلاث صيغ، وفاتورة لا تُراجع.">
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

        <HowSteps />

        <DayWithTadqeeq />

        <TwoPlatforms />

        <CompensationSteps />

        <ChecksList />

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
  id,
  children,
}: {
  eyebrow?: string;
  title: string;
  /** For aria-labelledby on the section. */
  id?: string;
  tone?: "primary" | "success";
  /** "aria" keeps heading semantics without a second <h2> when a section renders its intro twice (desktop + phone). */
  heading?: "h2" | "aria";
  children?: ReactNode;
}) {
  const titleClass = cn(eyebrow && "mt-3", "font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]");
  return (
    <div data-reveal className="flex flex-col">
      {eyebrow ? (
        <p className={cn("flex items-center gap-2 text-[13px] font-semibold", tone === "success" ? "text-success" : "text-primary-text")}>
          <span className={cn("size-1.5 rounded-full", tone === "success" ? "bg-success" : "bg-primary")} />
          {eyebrow}
        </p>
      ) : null}
      {heading === "h2" ? (
        <h2 id={id} className={titleClass}>{title}</h2>
      ) : (
        <p role="heading" aria-level={2} className={titleClass}>
          {title}
        </p>
      )}
      {children ? <div className="mt-4 flex flex-col text-base leading-8 text-muted-foreground sm:text-[17px]">{children}</div> : null}
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

/** What every order-based plan includes. */
const ORDER_PRESETS = [5000, 12000, 30000, 60000];

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

      <div data-reveal className="mt-10 flex flex-col gap-4 rounded-[22px] border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor="pricing-orders" className="text-[15px] font-semibold">
          كم طلب يصلك شهرياً من كل تطبيقات التوصيل؟
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="pricing-orders"
            type="number"
            inputMode="numeric"
            min={0}
            dir="ltr"
            placeholder="مثلاً 8000"
            value={orders ?? ""}
            onChange={(event) => setOrders(event.target.value === "" ? null : Math.max(0, Number(event.target.value)))}
            className="num h-11 w-36 rounded-full border border-border bg-background px-4 text-center"
          />
          {ORDER_PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOrders(value)}
              className={cn("num rounded-full border px-3 py-2 text-sm", orders === value ? "border-primary bg-secondary" : "border-border")}
            >
              {value.toLocaleString("en-US")}
            </button>
          ))}
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

/** A real screen from the app (demo data for a fictional restaurant group), in a quiet window frame. */
function AppShot({ src, alt, width, height, priority = false, className }: { src: string; alt: string; width: number; height: number; priority?: boolean; className?: string }) {
  return (
    <figure className={cn("overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_30px_70px_-40px_rgb(19_35_43/0.45)]", className)}>
      <div aria-hidden="true" className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
      </div>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        {...(priority ? { fetchPriority: "high" as const } : {})}
        className="block h-auto w-full"
      />
    </figure>
  );
}

const DEMO_NOTE = "بيانات توضيحية لمجموعة مطاعم افتراضية";

/** The four steps of a period, side by side. */
function HowSteps() {
  return (
    <section id="how" aria-labelledby="how-title" className="bg-muted">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-24">
        <div data-reveal className="max-w-2xl">
          <h2 id="how-title" className="font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]">أربع خطوات. بدون جداول يدوية.</h2>
          <p className="mt-3 text-base leading-8 text-muted-foreground sm:text-[17px]">من رفع الملفين إلى إغلاق الفترة، كل خطوة تبني على السابقة.</p>
        </div>
        <ol data-reveal className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {HOW_FLOW.map((step) => (
            <li key={step.title} className="relative flex flex-col rounded-[18px] border border-border bg-card p-6">
              <span className="grid size-11 place-items-center rounded-xl bg-ink text-primary">
                <step.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
              <p className="mt-1 text-xs font-semibold text-primary-text">{step.who}</p>
              <p className="mt-3 text-[14px] leading-7 text-foreground/80">{step.body}</p>
              <p className="mt-auto pt-4 text-[12.5px] leading-6 text-muted-foreground">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

type DayMoment = { when: string; product?: ProductKey; tag?: string; title: string; body: string; image: string; alt: string };

const DAY: DayMoment[] = [
  {
    when: "كل صباح",
    product: "nabd",
    title: "مبيعات أمس وتكلفة كل منصة، قبل أن تصل الفاتورة.",
    body: SHOWCASE.find((s) => s.key === "daily")!.body,
    image: "/home/app-nabd.webp",
    alt: "شاشة «نبض»: إجمالي المبيعات وتكلفة المنصات وصافي التحويل والفروع الأعلى تكلفة",
  },
  {
    when: "عند وصول الفاتورة",
    product: "mutabiq",
    title: "ما خصمته المنصة. ما يقوله عقدك. والفرق بينهما.",
    body: "ارفع الفاتورة ويعيد تدقيق بناءها بنداً بنداً من ملف الطلبات. عند الاختلاف ترى البند والنسبة المحتسبة والنسبة المتفق عليها.",
    image: "/home/app-mutabiq.webp",
    alt: "شاشة «مُطابِق»: إجمالي الفاتورة وفرق المطالبة وحالة بنود الفاتورة",
  },
  {
    when: "في نفس الجلسة",
    product: "kashif",
    title: SHOWCASE.find((s) => s.key === "charges")!.tagline,
    body: SHOWCASE.find((s) => s.key === "charges")!.body,
    image: "/home/app-kashif.webp",
    alt: "شاشة «كاشِف»: الرسوم حسب التصنيف وتغطية التصنيف والبنود غير المصنفة",
  },
  {
    when: "خلال الأسبوع",
    product: "istirdad",
    title: "تعويض خُصم على طلب سليم؟ دليله جاهز من قروب الفرع.",
    body: SHOWCASE.find((s) => s.key === "compensation")!.body,
    image: "/home/app-istirdad.webp",
    alt: "شاشة «استرداد»: المبلغ المسترد ونسبة الاسترداد والحالات الجاهزة للإرسال",
  },
  {
    when: "نهاية الشهر",
    tag: "الاتجاهات والمقارنة",
    title: "الشهر كله، شهراً بشهر ومنصة بمنصة.",
    body: "المبيعات ونسبة تكلفة المنصة والعمولة لكل شهر ومنصة، مع التغير عن الشهر السابق وتقارير تُرسل نفسها بالبريد.",
    image: "/home/app-reports.webp",
    alt: "شاشة الاتجاهات والمقارنة: مبيعات الشهر وتكلفة المنصة ونسبة العمولة شهراً بشهر",
  },
];

/** One working day (and month) with Tadqeeq: a moment, what happens, and the real screen for it. */
function DayWithTadqeeq() {
  return (
    <section id="day" aria-labelledby="day-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
      <SectionIntro eyebrow="يوم مع تدقيق" title="من أول طلب في الصباح إلى إغلاق الشهر." id="day-title">
        كل أداة تعمل من نفس الفروع والعقود، فالرقم الذي تراجعه في مكان صحيح في كل مكان.
      </SectionIntro>
      <ol className="relative mt-14 space-y-16 border-s border-border ps-6 sm:ps-10 lg:space-y-24">
        {DAY.map((moment) => {
          const product = moment.product ? PRODUCTS[moment.product] : undefined;
          const page = moment.product ? productPageFor(moment.product) : undefined;
          return (
            <li key={moment.image} data-reveal className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-14">
              <span aria-hidden="true" className="absolute -start-[31px] top-1.5 size-3.5 rounded-full border-2 border-primary bg-background sm:-start-[47px]" />
              <div>
                <p className="text-[13px] font-semibold text-primary-text">
                  {moment.when} · {product ? `«${product.name}» ${product.descriptor}` : moment.tag}
                </p>
                <h3 className="mt-3 font-display text-2xl font-bold leading-[1.45] sm:text-[1.75rem]">{moment.title}</h3>
                <p className="mt-3 text-[15px] leading-8 text-muted-foreground">{moment.body}</p>
                {page && product ? (
                  <a href={page.path} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-primary-text">
                    اعرف المزيد عن {product.name}
                    <ArrowLeft className="size-4" />
                  </a>
                ) : null}
              </div>
              <AppShot src={moment.image} alt={moment.alt} width={1400} height={moment.product === "istirdad" ? 651 : 787} />
            </li>
          );
        })}
      </ol>
      <p className="mt-10 text-center text-xs text-muted-foreground">الشاشات من تدقيق نفسه، {DEMO_NOTE}.</p>
    </section>
  );
}

const MIZAN_TOOLS = ["invoice", "charges", "exceptions", "promotions", "watch", "daily", "journal", "columns", "ai"];

/** The two platforms and what is inside each. */
function TwoPlatforms() {
  const tools = MIZAN_TOOLS.map((key) => SHOWCASE.find((item) => item.key === key)!);
  const istirdad = SHOWCASE.find((item) => item.key === "compensation")!;
  return (
    <section id="products" aria-labelledby="products-title" className="bg-[oklch(0.975_0.018_85)]">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <div data-reveal className="max-w-2xl">
          <h2 id="products-title" className="font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]">منصتان في حساب واحد.</h2>
          <p className="mt-3 text-base leading-8 text-muted-foreground sm:text-[17px]">
            «{SUITES.mizan.name}» لتدقيق الفواتير والأداء، و«{SUITES.istirdad.name}» لاسترداد التعويضات. تتنقل بينهما من أعلى الشاشة.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <article data-reveal className="rounded-[24px] bg-ink p-6 text-ink-foreground sm:p-8">
            <header className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink-2">
                <MizanMark className="size-10 text-ink-foreground" />
              </span>
              <div>
                <h3 className="font-display text-[26px] font-bold leading-tight">{SUITES.mizan.name}</h3>
                <p className="mt-1 text-sm text-primary">{SUITES.mizan.descriptor}</p>
              </div>
            </header>
            <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {tools.map((item) => {
                const page = item.product ? productPageFor(item.product) : undefined;
                return (
                  <li key={item.key} className="flex gap-3">
                    <item.icon className="mt-1 size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {page ? (
                          <a href={page.path} className="hover:text-primary">{item.name}</a>
                        ) : (
                          item.name
                        )}
                        {item.descriptor ? <span className="ms-1.5 text-[13px] font-normal text-ink-muted">{item.descriptor}</span> : null}
                      </p>
                      <p className="mt-1 text-[13.5px] leading-6 text-ink-muted">{item.tagline}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>

          <article data-reveal className="flex flex-col rounded-[24px] bg-success-soft p-6 sm:p-8">
            <header className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-success text-white">
                <HandCoins className="size-7" strokeWidth={1.75} />
              </span>
              <div>
                <h3 className="font-display text-[26px] font-bold leading-tight">{SUITES.istirdad.name}</h3>
                <p className="mt-1 text-sm font-semibold text-success">{SUITES.istirdad.descriptor}</p>
              </div>
            </header>
            <p className="mt-8 text-lg font-semibold leading-8">{istirdad.tagline}</p>
            <p className="mt-2 text-[14.5px] leading-7 text-foreground/80">{istirdad.body}</p>
            <ul className="mt-6 space-y-2.5 text-[14px]">
              {SUITES.istirdad.highlights.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {line}
                </li>
              ))}
            </ul>
            <a href="#compensation" className="mt-auto inline-flex items-center gap-1.5 pt-8 text-sm font-semibold text-success">
              كيف يعمل «{SUITES.istirdad.name}»
              <ArrowLeft className="size-4" />
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}

/** «استرداد» step by step, from the branch to the refund. */
function CompensationSteps() {
  return (
    <section id="compensation" aria-labelledby="compensation-title" className="bg-success-soft">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-28">
        <SectionIntro eyebrow={`${PRODUCTS.istirdad.name} · ${PRODUCTS.istirdad.descriptor}`} title="تعويض لم تتسبب فيه؟ اعترض عليه بالدليل." tone="success" id="compensation-title">
          من صورة في قروب الفرع إلى مبلغ مسترد، دون تطبيق إضافي للموظفين.
          <a href={productPageFor("istirdad")?.path ?? "/products"} className="mt-6 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-success">
            اعرف المزيد عن {PRODUCTS.istirdad.name}
            <ArrowLeft className="size-4" />
          </a>
        </SectionIntro>
        <ol data-reveal className="space-y-3">
          {COMP_FLOW.map((step) => (
            <li key={step.title} className="flex gap-4 rounded-[18px] bg-card p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success text-white">
                <step.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold">
                  {step.title}
                  <span className="ms-2 text-xs font-semibold text-success">{step.who}</span>
                </h3>
                <p className="mt-1.5 text-[14px] leading-7 text-foreground/80">{step.body}</p>
                <p className="mt-1 text-[12.5px] leading-6 text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Every fee line the audit checks, how, and a worked example. */
function ChecksList() {
  return (
    <section id="checks" aria-labelledby="checks-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
      <div data-reveal className="max-w-3xl">
        <h2 id="checks-title" className="font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]">كل بند في الفاتورة، لا الإجمالي فقط.</h2>
        <p className="mt-3 text-base leading-8 text-muted-foreground sm:text-[17px]">
          أي خصم لا يطابق خريطة الرسوم يظهر كبند غير مصنف بدلاً من أن يمر دون أن يلاحظه أحد.
        </p>
      </div>
      <ul data-reveal className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CHECKS.map((item, index) => {
          const flagged = index === CHECKS.length - 1;
          return (
            <li key={item.title} className={cn("flex flex-col rounded-[18px] border p-5", flagged ? "border-primary/40 bg-secondary/50" : "border-border bg-card")}>
              <span className={cn("grid size-10 place-items-center rounded-xl", flagged ? "bg-primary text-primary-foreground" : "bg-muted text-ink")}>
                <item.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-bold">{item.title}</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">{item.body}</p>
              <p className="mt-3 text-[13.5px] leading-7 text-foreground/80">{item.how}</p>
              <p className="mt-auto pt-4">
                <span className="block rounded-lg bg-muted px-3 py-2 text-[12.5px] leading-6 text-foreground/80">مثال: {item.example}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Who Tadqeeq is for, and what each role gets. */
function Audiences() {
  return (
    <section id="who" aria-labelledby="who-title" className="bg-muted">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionIntro title="لمن يملك الأرقام ويُسأل عنها." id="who-title" />
        <ul data-reveal className="mt-12 grid gap-4 md:grid-cols-2">
          {AUDIENCES.map((item) => (
            <li key={item.key} className="flex flex-col gap-4 rounded-[20px] bg-card p-6 sm:flex-row sm:gap-6 sm:p-7">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink text-primary">
                <item.icon className="size-6" />
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-bold">{item.name}</h3>
                <p className="mt-1 font-semibold text-primary-text">{item.tagline}</p>
                <p className="mt-2 text-[14.5px] leading-7 text-foreground/80">{item.body}</p>
                {item.points ? (
                  <ul className="mt-4 space-y-2 text-[13.5px] text-muted-foreground">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        {point}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** What the account gives every team, beyond the audit tools themselves. */
function Capabilities() {
  return (
    <section id="platform" aria-labelledby="platform-title" className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-28">
      <div data-reveal>
        <h2 id="platform-title" className="font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.4rem]">كل شركاتك وفريقك وتقاريرك في حساب واحد.</h2>
        <Link
          to="/auth"
          search={{ mode: "signup" }}
          className="mt-8 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
        >
          ابدأ مجاناً
          <ArrowLeft className="size-4" />
        </Link>
      </div>
      <dl data-reveal className="divide-y divide-border border-y border-border">
        {CAPABILITIES.map((item) => (
          <div key={item.key} className="grid gap-2 py-6 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-8">
            <dt className="flex items-start gap-3 font-bold">
              <item.icon className="mt-0.5 size-5 shrink-0 text-primary-text" />
              {item.name}
            </dt>
            <dd>
              <p className="font-semibold">{item.tagline}</p>
              <p className="mt-1 text-[14.5px] leading-7 text-muted-foreground">{item.body}</p>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
