import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, Menu, Video, X } from "lucide-react";
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

const STEPS = [
  ["01", "ارفع الملفات", "ملف الطلبات وفاتورة المنصة بصيغتها الأصلية. يتعرّف تدقيق على المنصة والفترة تلقائياً."],
  ["02", "نعيد الاحتساب", "محرك محاسبي ثابت يحتسب كل بند بمعادلات عقدك ويقارنه بما ورد في الفاتورة."],
  ["03", "راجع الفروقات", "كل فرق يظهر مع مصدره ومعادلته والسطر المقابل في الفاتورة حتى تتخذ القرار."],
  ["04", "استرد وأغلق", "جهّز مطالبة التعويض بأدلتها، ثم أغلق الفترة واحفظها في سجل قابل للمراجعة."],
];

const CHECKS = [
  ["عمولة المبيعات", "حسب نسبة العقد لكل فرع وقناة"],
  ["رسوم الدفع الإلكتروني", "مدى والبطاقات وآبل باي"],
  ["حملات التوصيل المجاني", "حصة المطعم من كل حملة"],
  ["التعويضات", "التكرار والفرع الخاطئ والطلبات المفقودة"],
  ["رسوم العروض ووقت الانتظار", "مع قياس العائد على كل عرض"],
  ["ضريبة القيمة المضافة", "على كل بند خاضع للضريبة"],
  ["صافي التسوية", "المستحق مقابل المحوّل فعلياً"],
  ["بنود غير مصنفة", "أي خصم لا يطابق خريطة الرسوم"],
];

const AUDIENCES = [
  ["صاحب المطعم", "ارفع ملفين في نهاية الشهر واعرف قبل السداد إن كانت الفاتورة صحيحة."],
  ["المدير المالي", "كل رقم مربوط بمصدره، وكل فرق له حالة ومسؤول قبل اعتماد الفترة."],
  ["مجموعة مطاعم", "قارن الفروع والمنصات واعرف أين تتكرر الفروقات لتتفاوض بأرقام."],
  ["فريق المحاسبة", "تدقيق منظم وسريع مع نتائج قابلة للتصدير والمراجعة."],
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

        <section id="how" className="bg-muted">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-24">
            <SectionIntro eyebrow="كيف يعمل" title="أربع خطوات. بدون جداول يدوية." />
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(([n, title, body], index) => (
                <li
                  key={n}
                  data-reveal
                  style={{ transitionDelay: `${index * 0.1}s` }}
                  className={cn(
                    "flex flex-col gap-2.5 rounded-2xl p-6",
                    index === STEPS.length - 1 ? "bg-ink text-ink-foreground" : "bg-card",
                  )}
                >
                  <span className={cn("num text-sm font-semibold", index === STEPS.length - 1 ? "text-primary" : "text-primary-text")}>{n}</span>
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className={cn("text-sm leading-7", index === STEPS.length - 1 ? "text-ink-muted" : "text-muted-foreground")}>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

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

        <section id="compensation" className="bg-success-soft">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-28">
            <SectionIntro eyebrow="مركز التعويضات" title="تعويض لم تتسبب فيه؟ اعترض عليه بالدليل." tone="success">
              الكاشير يرسل فيديو أو صورة الطلب في قروب الفرع على Telegram. تدقيق يربطها برقم الطلب تلقائياً، وعند ظهور التعويض يكون ملف الاعتراض جاهزاً بالعربي والإنجليزي.
              <ul className="mt-5 space-y-2.5 text-[15px] text-foreground">
                {["لا تطبيق ولا تسجيل دخول للموظف", "الدليل مربوط برقم الطلب والفرع والوقت", "متابعة كل حالة حتى الاسترداد"].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <Check className="size-4 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </SectionIntro>
            <CompensationMock />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionIntro eyebrow="ما الذي نراجعه" title="كل بند في الفاتورة، لا الإجمالي فقط." />
            <p data-reveal className="max-w-md text-base leading-8 text-muted-foreground">
              أي خصم لا يطابق خريطة الرسوم يظهر كبند غير مصنف بدلاً من أن يمر دون أن يلاحظه أحد.
            </p>
          </div>
          <div className="mt-10 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {CHECKS.map(([title, body], index) => (
              <div
                key={title}
                data-reveal
                style={{ transitionDelay: `${(index % 4) * 0.08}s` }}
                className={cn(
                  "rounded-[14px] p-5",
                  index === CHECKS.length - 1 ? "bg-ink text-ink-foreground" : "border border-border bg-card",
                )}
              >
                <h3 className="font-bold">{title}</h3>
                <p className={cn("mt-1.5 text-[13px]", index === CHECKS.length - 1 ? "text-ink-muted" : "text-muted-foreground")}>{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-muted">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <SectionIntro eyebrow="لمن تدقيق" title="لمن يملك الأرقام ويُسأل عنها." />
            <div className="mt-9 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map(([title, body], index) => (
                <div key={title} data-reveal style={{ transitionDelay: `${index * 0.08}s` }} className="rounded-2xl bg-card p-6">
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

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

function CompensationMock() {
  return (
    <div data-reveal aria-hidden="true" className="flex flex-col items-stretch gap-4 rounded-[22px] bg-success/15 p-5 sm:flex-row sm:items-center sm:p-9">
      <div className="lp-float flex shrink-0 flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-[0_20px_40px_-24px_rgb(19_35_43/0.35)] sm:w-56">
        <p className="text-xs font-semibold">قروب فرع الملقا</p>
        <div className="lp-rec relative grid h-36 place-items-center rounded-xl bg-ink/90 text-ink-foreground">
          <Video className="size-7" />
        </div>
        <p className="lp-pop rounded-[10px] bg-success-soft px-2.5 py-2 text-xs text-success">✓ تم الربط بالطلب HS-88214073</p>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 rounded-[18px] bg-card p-5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>تعويض في فاتورة هنقرستيشن</span>
          <span className="num">HS-88214073</span>
        </div>
        <p className="num text-3xl font-semibold">
          142.50 <span className="text-sm">ر.س</span>
        </p>
        <p className="text-[13px] text-muted-foreground">طلب ناقص · فرع الملقا</p>
        <div className="lp-pop flex items-center gap-2.5 rounded-xl bg-success-soft p-3 text-[13px]" style={{ animationDelay: "0.8s" }}>
          <span className="grid size-8 place-items-center rounded-lg bg-card">
            <Video className="size-4 text-success" />
          </span>
          <div>
            <p className="font-semibold text-success">يوجد دليل</p>
            <p className="text-xs text-muted-foreground">فيديو التغليف · قبل التسليم للمندوب</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="lp-pop rounded-full bg-ink px-3.5 py-2 text-[13px] text-ink-foreground" style={{ animationDelay: "1.6s" }}>
            ملف الاعتراض جاهز
          </span>
          <span className="rounded-full border border-border px-3.5 py-2 text-[13px]">عربي · English</span>
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
