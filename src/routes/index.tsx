import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileSpreadsheet,
  HandCoins,
  LineChart,
  Menu,
  Percent,
  Receipt,
  RotateCcw,
  Scale,
  SearchCheck,
  Store,
  Tag,
  Truck,
  AlertTriangle,
  Megaphone,
  PieChart,
  Sparkles,
  Upload,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { isOpsHost } from "@/lib/ops";
import { getRequestHost } from "@/lib/ops.functions";
import { CORE_FEATURE_LABELS, PLAN_FEATURES, type PublicPlan } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { listPublicPlans } from "@/lib/plans.functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const host = typeof window !== "undefined" ? window.location.host : await getRequestHost();
    if (isOpsHost(host)) throw redirect({ to: "/ops" });
  },
  head: () => ({
    meta: [
      { title: "تدقيق · تدقيق فواتير هنقرستيشن وكيتا وجاهز للمطاعم" },
      { name: "description", content: "منصة سعودية تعيد احتساب فواتير تطبيقات التوصيل وتكشف الفروقات لكل فرع." },
      { property: "og:title", content: "تدقيق · لا تدفع فاتورة المنصة قبل ما تتأكد منها" },
      { property: "og:description", content: "أعد احتساب كل بند في فواتير هنقرستيشن وكيتا وجاهز، واسترجع التعويضات بأدلة موثقة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: () => listPublicPlans(),
  errorComponent: () => <Landing plans={[]} />,
  notFoundComponent: () => <Landing plans={[]} />,
  component: LandingRoute,
});

const NAV = [
  ["#features", "المنتج"],
  ["#how", "كيف يعمل"],
  ["#compensation", "مركز التعويضات"],
  ["#pricing", "الخطط والأسعار"],
  ["#faq", "الأسئلة"],
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
    points: ["ملخص واضح للمستحق والمخصوم والفرق", "مقارنة الرسوم بين الفروع", "مطالبة تعويض جاهزة بالأدلة"],
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
    body: "تدقيق منظم وسريع مع نتائج قابلة للتصدير والمراجعة.",
    icon: FileSpreadsheet,
    points: ["نتائج قابلة للتصدير", "مصدر واضح لكل رقم", "وصول حسب الدور"],
  },
];

const FAQS = [
  ["ما الملفات التي أحتاجها؟", "ملف الطلبات من بوابة التاجر وفاتورة المنصة لنفس الفترة. نقبل Excel وCSV وPDF."],
  ["هل يغيّر الذكاء الاصطناعي أي رقم؟", "لا. الأرقام من المحرك المحاسبي، والذكاء الاصطناعي يشرح ويلخص النتائج فقط."],
  ["ماذا لو غيّرت المنصة صيغة ملفاتها؟", "يظهر تنبيه بتغيّر الصيغة بدلاً من احتساب نتيجة غير موثوقة."],
  ["هل يحتاج موظف الفرع تطبيقاً لإرسال الأدلة؟", "لا. يرسل الصورة أو الفيديو في قروب الفرع على Telegram، والبوت يربطه برقم الطلب."],
  ["هل بيانات شركتي منفصلة؟", "نعم. لكل شركة مساحة خاصة، مع صلاحيات تحدد ما يراه ويعدله كل موظف."],
];

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

  return (
    <div ref={rootRef} className="lp-root min-h-screen bg-background" dir="rtl">
      <div className="flex items-center justify-center gap-3 bg-ink px-4 py-2.5 text-center text-xs text-ink-foreground sm:text-[13px]">
        <span className="lp-pulse shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">جديد</span>
        <span className="hidden sm:inline">مركز التعويضات: اعترض على التعويضات بفيديو من قروب الفرع على Telegram</span>
        <span className="sm:hidden">اعترض على التعويضات بأدلة من Telegram</span>
        <a href="#compensation" className="shrink-0 font-semibold text-primary">اعرف أكثر ←</a>
      </div>

      <div className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
        <header className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 rounded-full border border-border bg-card/95 ps-4 pe-2 shadow-[0_12px_32px_-18px_rgb(19_35_43/0.28)] backdrop-blur sm:h-[68px] sm:ps-5">
          <Link to="/" aria-label="تدقيق — الرئيسية" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-[11px] bg-ink font-display text-lg font-extrabold text-primary">ت</span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-lg font-extrabold">تدقيق</span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">مراجعة فواتير التوصيل</span>
            </span>
          </Link>
          <nav aria-label="الرئيسية" className="hidden items-center gap-1 rounded-full bg-background p-1 text-sm lg:flex">
            {NAV.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-full px-4 py-2 text-foreground/75 transition-colors hover:bg-card hover:text-foreground hover:shadow-sm"
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
              className="grid size-11 place-items-center rounded-full hover:bg-muted lg:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </header>
        {menuOpen ? (
          <nav aria-label="القائمة" className="mx-auto mt-2 flex max-w-7xl flex-col rounded-2xl border border-border bg-card p-2 shadow-lg lg:hidden">
            {NAV.map(([href, label]) => (
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
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-20">
            <div className="lp-stagger flex flex-col gap-6">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-primary-text">
                <span className="size-1.5 rounded-full bg-primary" />
                تدقيق فواتير هنقرستيشن وكيتا وجاهز
              </p>
              <h1 className="font-display text-4xl font-extrabold leading-[1.3] sm:text-5xl lg:text-[3.6rem]">
                لا تدفع فاتورة المنصة قبل ما تتأكد منها.
              </h1>
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
                <a href="#how" className="inline-flex h-[52px] items-center rounded-full border border-border bg-card px-6 text-[15px] font-semibold">
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
            <HeroDashboard />
          </div>
        </section>

        <section className="border-y border-border">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
            <span>يدعم فواتير وملفات:</span>
            {["هنقرستيشن", "كيتا", "جاهز"].map((name) => (
              <span key={name} className="font-display text-xl font-bold text-foreground">
                {name}
              </span>
            ))}
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
            <SectionIntro eyebrow="مطابقة الفاتورة" title="ما خصمته المنصة. ما يقوله عقدك. والفرق بينهما.">
              ارفع الفاتورة ويعيد تدقيق بناءها بنداً بنداً من ملف الطلبات. عند الاختلاف ترى البند والنسبة المحتسبة والنسبة المتفق عليها.
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-ink-foreground"
              >
                جرّب مطابقة الفاتورة
                <ArrowLeft className="size-4" />
              </Link>
            </SectionIntro>
            <InvoiceMock />
          </div>
        </section>

        <CompensationFlow />

        <ProductShowcase />

        <ChecksGrid />

        <Audiences />

        {plans.length ? <Pricing plans={plans} /> : null}

        <section id="faq" className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] lg:py-24">
          <SectionIntro eyebrow="أسئلة" title="قبل أن تبدأ">
            ما يسأله أصحاب المطاعم عادة.
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

        <section className="px-4 pb-16 sm:px-6">
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

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 pb-10 text-[13px] text-muted-foreground sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-[7px] bg-primary font-display text-sm font-extrabold text-primary-foreground">ت</span>
          <span>تدقيق · مراجعة فواتير التوصيل للمطاعم في السعودية</span>
        </div>
        <span className="num">© {new Date().getFullYear()} تدقيق</span>
      </footer>
    </div>
  );
}

/** True once the element has scrolled into view (and stays true). */
function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

/** Steps through 0..count-1 while `active`; stays still for reduced-motion users. */
function useCycle(count: number, active: boolean, delay: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), delay);
    return () => window.clearInterval(timer);
  }, [active, count, delay]);
  return index;
}

const SHOWCASE: TourItem[] = [
  {
    key: "invoice",
    name: "مطابقة الفاتورة",
    tagline: "ما خصمته المنصة، وما يقوله عقدك، والفرق.",
    body: "ارفع الفاتورة وملف الطلبات ويعيد تدقيق احتساب كل بند من عقدك. كل فرق يظهر باسمه ومبلغه ونسبته، وجاهز للمطالبة.",
    icon: FileSpreadsheet,
  },
  {
    key: "charges",
    name: "خريطة الرسوم",
    tagline: "أين يذهب كل ريال تخصمه المنصة.",
    body: "كل خصم في الفاتورة مصنف: عمولة، رسوم دفع، حملات، ضريبة. وأي بند لا يطابق الخريطة يظهر كبند غير مصنف بدلاً من أن يختفي.",
    icon: PieChart,
  },
  {
    key: "exceptions",
    name: "مركز الاستثناءات",
    tagline: "كل فرق له حالة ومسؤول حتى يُغلق.",
    body: "الفروقات تتحول إلى استثناءات بأولوية وحالة ومسؤول، مع سجل لكل إجراء حتى يبقى إغلاق الشهر قابلاً للمراجعة.",
    icon: AlertTriangle,
  },
  {
    key: "compensation",
    name: "مركز التعويضات",
    tagline: "تعويضات لم تتسبب فيها، تُعترض بالدليل.",
    body: "الكاشير يرسل فيديو الطلب في قروب الفرع على Telegram، وتدقيق يربطه برقم الطلب ويجهز ملف الاعتراض بالعربي والإنجليزي.",
    icon: Video,
  },
  {
    key: "promotions",
    name: "تحليل العروض و ROI",
    tagline: "أي عرض يربح، وأي عرض يأكل هامشك.",
    body: "لكل حملة ما دفعته فيها وما جلبته من مبيعات إضافية، حتى تقرر أي عرض تكرره وأي عرض توقفه.",
    icon: Megaphone,
  },
  {
    key: "ai",
    name: "Tadqeeq AI",
    tagline: "أرقامك، مشروحة بلغة بسيطة.",
    body: "اسأل عن أي فترة واحصل على إجابة من الحقائق المدققة. الأرقام من المحرك المحاسبي، والصياغة من الذكاء الاصطناعي، ولا يغيّر أي رقم.",
    icon: Sparkles,
  },
];

type TourItem = { key: string; name: string; tagline: string; body: string; icon: LucideIcon; points?: string[] };

/** Scroll-pinned tour: the section stays on screen while scrolling moves through the items. */
function PinnedTour({
  id,
  eyebrow,
  title,
  desktopHint,
  mobileHint,
  items,
  renderVisual,
  ctaLabel,
  className,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  desktopHint: string;
  mobileHint: string;
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
            <span className="hidden lg:inline">{desktopHint}</span>
            <span className="lg:hidden">{mobileHint}</span>
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
                <h3 className="mt-5 font-display text-5xl font-extrabold leading-[1.25]">{current.name}</h3>
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
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="mt-6 inline-flex h-12 w-fit items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-ink-foreground transition-transform hover:-translate-y-0.5"
                >
                  {ctaLabel(current)}
                  <ArrowLeft className="size-4" />
                </Link>
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

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6 lg:hidden">
        {items.map((item, index) => (
          <article key={item.key} data-reveal className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary-text">
                  <item.icon className="size-5" />
                </span>
                <span className="num text-xs text-muted-foreground" dir="ltr">
                  {counter(index)}
                </span>
              </div>
              <h3 className="mt-4 font-display text-2xl font-extrabold">{item.name}</h3>
              <p className="mt-2 font-medium">{item.tagline}</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.body}</p>
              {item.points ? (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {item.points.map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-success" />
                      {point}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="grid place-items-center bg-secondary p-5">{renderVisual(item.key, true)}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductShowcase() {
  return (
    <PinnedTour
      id="products"
      title="كل أداة في تدقيق، وهي تعمل."
      desktopHint="واصل التمرير للانتقال من أداة إلى أخرى."
      mobileHint="ست أدوات تعمل من نفس الفروع والعقود والملفات."
      items={SHOWCASE}
      renderVisual={(key, active) => <ShowcaseVisual kind={key} active={active} />}
      ctaLabel={(item) => `جرّب ${item.name}`}
      className="bg-background"
    />
  );
}

function Audiences() {
  return (
    <PinnedTour
      id="who"
      eyebrow="لمن تدقيق"
      title="لمن يملك الأرقام ويُسأل عنها."
      desktopHint="واصل التمرير لترى ما يحصل عليه كل دور."
      mobileHint="كل دور يرى ما يحتاجه من نفس الأرقام."
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
        <p className="text-sm font-semibold">ملخص الشهر · هنقرستيشن</p>
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
  expanded = false,
  onSelect,
}: {
  item: CheckItem;
  state: CheckState;
  flagged: boolean;
  compact?: boolean;
  selected?: boolean;
  expanded?: boolean;
  onSelect?: () => void;
}) {
  const dark = flagged && state === "checked";
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={onSelect ? expanded || selected : undefined}
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
      {expanded ? (
        <div className={cn("relative mt-3 border-t pt-3 text-[13px] leading-6", dark ? "border-ink-foreground/15" : "border-border")}>
          <p className={cn("text-[11px] font-semibold", dark ? "text-primary" : "text-primary-text")}>كيف نتحقق</p>
          <p className="mt-1">{item.how}</p>
          <p className={cn("mt-2 rounded-lg px-2.5 py-2 text-xs", dark ? "bg-ink-foreground/10" : "bg-muted")}>مثال: {item.example}</p>
        </div>
      ) : (
        <span className={cn("relative mt-3 block text-[11px] font-semibold", dark ? "text-primary" : "text-primary-text")}>
          {onSelect ? "كيف نتحقق؟" : null}
        </span>
      )}
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

function ChecksGrid() {
  const [trackRef, progress] = useTrackProgress<HTMLDivElement>();
  // Slightly shorter than the track so the last card settles before the section unpins.
  const active = Math.min(CHECKS.length, Math.floor(Math.min(1, progress / 0.9) * CHECKS.length));
  const verified = Math.min(active, CHECKS.length - 1);
  const done = active >= CHECKS.length;
  const focus = Math.min(active, CHECKS.length - 1);
  const focusItem = CHECKS[focus] ?? CHECKS[0]!;

  const [gridRef, inView] = useInView<HTMLDivElement>(0.25);
  const cycling = useCycle(CHECKS.length + 2, inView, 900);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function jumpTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const scrollable = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + scrollable * 0.9 * ((index + 0.3) / CHECKS.length), behavior: "smooth" });
  }

  const intro = (
    <SectionIntro eyebrow="ما الذي نراجعه" title="كل بند في الفاتورة، لا الإجمالي فقط.">
      أي خصم لا يطابق خريطة الرسوم يظهر كبند غير مصنف بدلاً من أن يمر دون أن يلاحظه أحد.
    </SectionIntro>
  );

  return (
    <section aria-label="ما الذي نراجعه">
      <div ref={trackRef} className="relative hidden lg:block" style={{ height: `${CHECKS.length * 45 + 70}vh` }}>
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-12 px-6 pt-20">
            <div>
              <div className="[&_h2]:text-[2.2rem] [&_h2]:leading-[1.35]">{intro}</div>
              <div className="mt-6 rounded-2xl border border-border bg-card p-4">
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
              <CheckExplainer key={focus} item={focusItem} index={focus} flagged={focus === CHECKS.length - 1} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CHECKS.map((item, index) => (
                <CheckCard
                  key={item.title}
                  compact
                  item={item}
                  flagged={index === CHECKS.length - 1}
                  selected={!done && index === focus}
                  state={index < active ? "checked" : index === active ? "scanning" : "idle"}
                  onSelect={() => jumpTo(index)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:hidden">
        {intro}
        <p className="mt-4 text-sm text-muted-foreground">اضغط على أي بند لترى كيف نتحقق منه.</p>
        <div ref={gridRef} className={cn("lp-checks mt-6 grid gap-3.5 sm:grid-cols-2", inView && "is-in")}>
          {CHECKS.map((item, index) => (
            <div key={item.title} style={{ animationDelay: `${(index % 2) * 0.08 + Math.floor(index / 2) * 0.12}s` }} className="lp-check">
              <CheckCard
                item={item}
                flagged={index === CHECKS.length - 1}
                expanded={openIndex === index}
                onSelect={() => setOpenIndex((v) => (v === index ? null : index))}
                state={inView && index < cycling ? "checked" : inView && index === cycling ? "scanning" : "idle"}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionIntro({
  eyebrow,
  title,
  tone = "primary",
  children,
}: {
  eyebrow: string;
  title: string;
  tone?: "primary" | "success";
  children?: ReactNode;
}) {
  return (
    <div data-reveal className="flex flex-col">
      <p className={cn("flex items-center gap-2 text-[13px] font-semibold", tone === "success" ? "text-success" : "text-primary-text")}>
        <span className={cn("size-1.5 rounded-full", tone === "success" ? "bg-success" : "bg-primary")} />
        {eyebrow}
      </p>
      <h2 className="mt-3 font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]">{title}</h2>
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
        <span className="grid size-7 place-items-center rounded-[7px] bg-primary font-display text-xs font-extrabold text-primary-foreground">ت</span>
        {[0.5, 0.3, 0.3, 0.3].map((o, i) => (
          <span key={i} className="h-[3px] w-[18px] rounded-sm bg-ink-foreground" style={{ opacity: o }} />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-primary-text">اللوحة التنفيذية</p>
            <p className="mt-1 font-display text-lg font-bold">جاهز · سبتمبر</p>
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
          <p className="text-xs text-muted-foreground">حسب فاتورة المنصة</p>
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
    who: "في مركز التعويضات",
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
    mobileBorder: "border-success/20",
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
    mobileBorder: "border-border",
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

  const intro = <SectionIntro eyebrow={eyebrow} title={title} tone={t.eyebrowTone} />;
  const counter = (i: number) => `${String(i + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`;

  return (
    <section id={id} aria-label={eyebrow} className={className}>
      <div ref={trackRef} className="relative hidden lg:block" style={{ height: `${count * 60 + 60}vh` }}>
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center gap-12 px-6 pt-20">
            <div>
              <div className="[&_h2]:text-[2.2rem] [&_h2]:leading-[1.35]">{intro}</div>
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

      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 lg:hidden">
        {intro}
        <ol className="mt-8 space-y-5">
          {steps.map((step, index) => (
            <li key={step.title} data-reveal className={cn("overflow-hidden rounded-3xl border bg-card", t.mobileBorder)}>
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <span className={cn("grid size-10 place-items-center rounded-full", t.mobileIcon)}>
                    <step.icon className="size-[18px]" />
                  </span>
                  <div>
                    <p className="num text-[11px] text-muted-foreground" dir="ltr">
                      {counter(index)}
                    </p>
                    <p className="font-bold">{step.title}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-foreground/80">{step.body}</p>
                <p className={cn("mt-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground", t.mobileNote)}>{step.detail}</p>
              </div>
              <div className={cn("grid place-items-center p-5", t.panel)}>{renderVisual(index, true)}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CompensationFlow() {
  return (
    <ScrollFlow
      id="compensation"
      eyebrow="مركز التعويضات"
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
    who: "مركز الاستثناءات",
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
          <span className="rounded-full bg-ink px-2.5 py-1 text-ink-foreground">المنصة: هنقرستيشن</span>
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
            <p className="mt-0.5 text-xs text-muted-foreground">فرع النرجس · هنقرستيشن · أغسطس</p>
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
          <div className="flex justify-between"><span>يوليو · هنقرستيشن</span><span>مغلقة</span></div>
          <div className="flex justify-between"><span>يونيو · جاهز</span><span>مغلقة</span></div>
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
        <p className="text-sm font-semibold">تعويضات فاتورة هنقرستيشن · سبتمبر</p>
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

function Pricing({ plans }: { plans: PublicPlan[] }) {
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
