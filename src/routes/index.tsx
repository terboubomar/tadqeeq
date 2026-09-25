import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Check, ChevronDown, LockKeyhole, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { isOpsHost } from "@/lib/ops";
import { getRequestHost } from "@/lib/ops.functions";
import { CORE_FEATURE_LABELS, PLAN_FEATURES, type PublicPlan } from "@/lib/plans";
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
  component: () => <Landing plans={Route.useLoaderData()} />,
});

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
  { label: "صاحب المطعم", title: "اعرف كم تأخذ المنصة فعلاً من كل طلب", body: "ارفع ملفين في نهاية الشهر واعرف قبل السداد إن كانت الفاتورة صحيحة.", points: ["ملخص واضح للمستحق والمخصوم والفرق", "مقارنة الرسوم بين الفروع", "مطالبة تعويض جاهزة بالأدلة"] },
  { label: "المدير المالي", title: "إغلاق شهري قابل للمراجعة لكل منصة", body: "كل رقم مربوط بمصدره، وكل فرق له حالة ومسؤول قبل اعتماد الفترة.", points: ["مطابقة كل بند بمعادلته", "متابعة حالة كل فترة", "سجل كامل للإجراءات"] },
  { label: "مجموعة مطاعم", title: "كل فروعك ومنصاتك في مساحة واحدة", body: "قارن الفروع والمنصات واعرف أين تتكرر الفروقات لتتفاوض بأرقام.", points: ["تقارير موحدة لكل الفروع", "مقارنة الفترات", "صلاحيات منفصلة للموظفين"] },
  { label: "فريق المحاسبة", title: "الأرقام التي تحتاجها من دون جداول يدوية", body: "تدقيق منظم وسريع مع نتائج قابلة للتصدير والمراجعة.", points: ["نتائج قابلة للتصدير", "مصدر واضح لكل رقم", "وصول حسب الدور"] },
];

const FAQS = [
  ["ما الملفات التي أحتاجها؟", "ملف الطلبات من بوابة التاجر وفاتورة المنصة لنفس الفترة. نقبل Excel وCSV وPDF."],
  ["هل يغيّر الذكاء الاصطناعي أي رقم؟", "لا. الأرقام من المحرك المحاسبي، والذكاء الاصطناعي يشرح ويلخص النتائج فقط."],
  ["ماذا لو غيّرت المنصة صيغة ملفاتها؟", "يظهر تنبيه بتغيّر الصيغة بدلاً من احتساب نتيجة غير موثوقة."],
  ["هل بيانات شركتي منفصلة؟", "نعم. لكل شركة مساحة خاصة، مع صلاحيات تحدد ما يراه ويعدله كل موظف."],
];

function Landing({ plans }: { plans: PublicPlan[] }) {
  const [audience, setAudience] = useState(0);
  const current = AUDIENCES[audience] ?? AUDIENCES[0];
  if (!current) return null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-ink-2 bg-ink text-ink-foreground">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-[9px] bg-primary font-display text-lg font-extrabold text-primary-foreground">ت</span>
            <span className="font-display text-lg font-bold">تدقيق</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-ink-muted md:flex">
            <a href="#how" className="transition-colors hover:text-ink-foreground">كيف يعمل</a>
            <a href="#checks" className="transition-colors hover:text-ink-foreground">ماذا ندقق</a>
            <a href="#who" className="transition-colors hover:text-ink-foreground">لمن</a>
            <a href="#pricing" className="transition-colors hover:text-ink-foreground">الباقات</a>
          </nav>
          <span className="flex-1" />
          <Button asChild variant="ghost" size="sm" className="text-ink-foreground hover:bg-ink-2 hover:text-ink-foreground"><Link to="/auth">تسجيل الدخول</Link></Button>
          <Button asChild size="sm"><Link to="/auth" search={{ mode: "signup" }}>سجّل منشأتك</Link></Button>
        </div>
      </header>

      <main>
        <section className="overflow-hidden bg-ink text-ink-foreground">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_0.92fr] lg:py-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-ink-2 px-3 py-1 text-xs text-ink-muted"><span className="size-2 rounded-full bg-primary" /> هنقرستيشن · كيتا · جاهز</p>
              <h1 className="mt-6 max-w-3xl font-display text-4xl font-extrabold leading-[1.45] sm:text-5xl lg:text-[3.5rem]">
                لا تدفع فاتورة المنصة <span className="text-primary">قبل ما تتأكد منها</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-ink-muted sm:text-lg">ارفع ملف الطلبات وفاتورة المنصة، ويعيد «تدقيق» بناء كل بند من بيانات الطلبات نفسها، ثم يكشف الفرق لكل فرع ولكل يوم.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>ابدأ أول تدقيق</Link></Button>
                <Button asChild size="lg" variant="outline" className="border-ink-2 bg-transparent text-ink-foreground hover:bg-ink-2 hover:text-ink-foreground"><a href="#how">شاهد كيف يعمل</a></Button>
              </div>
            </div>

            <div className="rounded-[16px] bg-background p-4 text-foreground shadow-2xl sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs text-muted-foreground">فاتورة هنقرستيشن · أغسطس</p><p className="mt-1 font-bold">مطابقة الفاتورة · 12 فرعاً</p></div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">3 فروقات مفتوحة</span>
              </div>
              <div className="mt-5 overflow-hidden rounded-[10px] border border-border bg-card text-xs sm:text-sm">
                <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 bg-muted px-3 py-2 text-muted-foreground"><span>البند</span><span>الفاتورة</span><span>الفرق</span></div>
                {[["عمولة المبيعات","49,870.15","+1,659.75"],["رسوم الدفع","6,120.00","مطابق"],["حملات التوصيل","4,215.50","+735.50"],["التعويضات","2,145.00","+243.00"]].map((row) => (
                  <div key={row[0]} className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-t border-border px-3 py-3"><span>{row[0]}</span><span className="num">{row[1]}</span><span className={row[2] === "مطابق" ? "font-semibold text-success" : "num font-semibold text-destructive"}>{row[2]}</span></div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-4 rounded-[10px] bg-ink px-4 py-4 text-ink-foreground">
                <div><p className="text-xs text-ink-muted">مبلغ قابل للاسترداد</p><p className="mt-1"><span className="num text-2xl font-semibold text-primary">2,638.25</span> <span className="text-sm">ر.س</span></p></div>
                <span className="rounded-[8px] bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">تجهيز المطالبة</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-muted"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-4 py-6 sm:px-6"><p className="text-sm text-muted-foreground">يقرأ الملفات كما تصدر من بوابة التاجر</p><div className="flex gap-7 font-display text-lg font-bold sm:gap-12"><span>هنقرستيشن</span><span>كيتا</span><span>جاهز</span></div></div></section>

        <section id="how" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeading eyebrow="دورة التدقيق الشهرية" title="أربع خطوات واضحة بالترتيب نفسه كل شهر" body="من رفع الملفات حتى تجهيز المطالبة، تعرف دائماً ما الخطوة التالية." />
          <ol className="mt-12 grid border-t-2 border-foreground md:grid-cols-4">
            {STEPS.map(([n,title,body]) => <li key={n} className="border-b border-border py-7 md:border-b-0 md:px-5 md:first:pr-0"><span className="num text-sm font-semibold text-primary-text">{n}</span><h3 className="mt-3 font-display text-lg font-bold">{title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p></li>)}
          </ol>
        </section>

        <section id="checks" className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
          <SectionHeading eyebrow="ماذا ندقق" title="كل سطر في الفاتورة، من بيانات الطلبات نفسها" body="البنود غير المصنفة تظهر لك بوضوح بدلاً من أن تختفي داخل الإجمالي." />
          <div className="grid overflow-hidden rounded-[14px] border border-border bg-border sm:grid-cols-2">
            {CHECKS.map(([title,body]) => <div key={title} className="m-px bg-card p-5"><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{body}</p></div>)}
          </div>
        </section>

        <section id="who" className="bg-ink text-ink-foreground"><div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <SectionHeading dark eyebrow="لمن تدقيق" title="مساحة واحدة تناسب فريقك" />
          <div className="mt-8 flex gap-2 overflow-x-auto pb-2">{AUDIENCES.map((item,index) => <Button key={item.label} type="button" size="sm" variant={index === audience ? "default" : "outline"} onClick={() => setAudience(index)} className={index === audience ? "shrink-0" : "shrink-0 border-ink-2 bg-transparent text-ink-muted hover:bg-ink-2 hover:text-ink-foreground"}>{item.label}</Button>)}</div>
          <div className="mt-7 grid gap-10 border-t border-ink-2 pt-8 md:grid-cols-2"><div><h3 className="font-display text-2xl font-bold">{current.title}</h3><p className="mt-4 max-w-xl text-base leading-8 text-ink-muted">{current.body}</p></div><div>{current.points.map((point) => <div key={point} className="flex items-center gap-3 border-b border-ink-2 py-4"><span className="size-2 rounded-[2px] bg-primary" /><span>{point}</span></div>)}</div></div>
        </div></section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="الأمان والدقة" title="المحرك المحاسبي هو المرجع، والذكاء الاصطناعي يشرح فقط" />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[{icon:ShieldCheck,title:"احتساب ثابت وقابل للتكرار",body:"نفس الملفات تعطي نفس النتيجة، مع حفظ كل إصدار للمراجعة."},{icon:LockKeyhole,title:"مساحة خاصة لكل شركة",body:"بيانات كل منشأة معزولة، والوصول مقيد حسب دور المستخدم."},{icon:Sparkles,title:"ذكاء اصطناعي مضبوط",body:"يستلم حقائق مدققة ليشرح النتائج، ولا يغيّر الأرقام المحاسبية."}].map((item) => <article key={item.title} className="panel p-6"><item.icon className="size-6 text-primary-text"/><h3 className="mt-5 font-display font-bold">{item.title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{item.body}</p></article>)}
          </div>
        </section>

        {plans.length ? <Pricing plans={plans} /> : null}

        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6"><h2 className="font-display text-3xl font-bold">أسئلة شائعة</h2><div className="mt-6 border-b border-border">{FAQS.map(([q,a]) => <details key={q} className="group border-t border-border"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold"><span>{q}</span><ChevronDown className="size-5 text-primary-text transition-transform group-open:rotate-180" /></summary><p className="max-w-2xl pb-5 text-sm leading-7 text-muted-foreground">{a}</p></details>)}</div></section>

        <section className="bg-primary"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 px-4 py-16 sm:px-6 md:flex-row md:items-center"><h2 className="max-w-3xl font-display text-3xl font-extrabold leading-[1.5] text-primary-foreground">دقق فاتورة الشهر الماضي قبل موعد السداد القادم</h2><Button asChild size="lg" className="border-ink bg-ink text-ink-foreground hover:bg-ink-2"><Link to="/auth" search={{ mode: "signup" }}>سجّل منشأتك</Link></Button></div></section>
      </main>

      <footer className="bg-ink text-ink-muted"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-4 py-10 text-sm sm:px-6"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-[7px] bg-primary font-display font-bold text-primary-foreground">ت</span><span className="font-semibold text-ink-foreground">تدقيق</span><span>· مراجعة فواتير منصات التوصيل في السعودية</span></div><span>© {new Date().getFullYear()} تدقيق</span></div></footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, body, dark = false }: { eyebrow: string; title: string; body?: string; dark?: boolean }) {
  return <div><p className={"text-xs font-semibold " + (dark ? "text-primary" : "text-primary-text")}>{eyebrow}</p><h2 className="mt-2 max-w-3xl font-display text-2xl font-bold leading-[1.55] sm:text-4xl">{title}</h2>{body ? <p className={"mt-3 max-w-2xl text-base leading-8 " + (dark ? "text-ink-muted" : "text-muted-foreground")}>{body}</p> : null}</div>;
}

function Pricing({ plans }: { plans: PublicPlan[] }) {
  return <section id="pricing" className="border-y border-border bg-muted"><div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
    <SectionHeading eyebrow="الباقات" title="اختر الميزات وعدد مرات رفع الملفات المناسب" body="السعر لا يعتمد على عدد الفروع. يمكنك ترقية الباقة مع نمو عملياتك." />
    <div className="mt-10 grid gap-4 md:grid-cols-3">{plans.map((plan) => <article key={plan.id} className={"relative flex flex-col rounded-[16px] p-6 " + (plan.highlighted ? "bg-ink text-ink-foreground shadow-xl" : "border border-border bg-card")}>
      {plan.highlighted ? <span className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">الأنسب لأغلب المطاعم</span> : null}
      <h3 className="font-display text-xl font-bold">{plan.name}</h3><p className={"mt-2 min-h-12 text-sm leading-6 " + (plan.highlighted ? "text-ink-muted" : "text-muted-foreground")}>{plan.description}</p>
      <p className="mt-5"><span className="num text-4xl font-semibold">{plan.price.toLocaleString("en-US")}</span> <span className={"text-sm " + (plan.highlighted ? "text-ink-muted" : "text-muted-foreground")}>ر.س / {plan.cycle === "yearly" ? "سنة" : "شهر"}</span></p>
      <p className="mt-2 text-sm font-semibold">{plan.uploadLimit === null ? "رفع ملفات بلا حدود" : `حتى ${plan.uploadLimit} عمليات رفع شهرياً`}</p>
      <ul className="mt-6 flex-1 space-y-3 text-sm">{CORE_FEATURE_LABELS.map((label) => <li key={label} className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />{label}</li>)}{PLAN_FEATURES.map((feature) => { const on = plan.features.includes(feature.key); return <li key={feature.key} className={"flex gap-2 " + (!on ? "opacity-45 line-through" : "")} >{on ? <Check className="size-4 shrink-0 text-primary" /> : <X className="size-4 shrink-0" />}{feature.label}</li>; })}</ul>
      <Button asChild className="mt-7" variant={plan.highlighted ? "default" : "outline"}><Link to="/auth" search={{ mode: "signup" }}>سجّل منشأتك</Link></Button>
    </article>)}</div>
  </div></section>;
}