import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Check,
  X,
  BarChart3,
  Bot,
  CalendarClock,
  Camera,
  FileCheck2,
  Receipt,
  Rocket,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

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
      {
        name: "description",
        content:
          "منصة سعودية لتدقيق فواتير تطبيقات التوصيل، استرجاع التعويضات بأدلة من الفروع، وتحليل أداء كل فرع بالذكاء الاصطناعي.",
      },
      { property: "og:title", content: "تدقيق · لا تدفع فاتورة المنصة قبل ما تتأكد منها" },
      {
        property: "og:description",
        content: "أعد احتساب كل بند في فواتير هنقرستيشن وكيتا وجاهز، واسترجع التعويضات بأدلة من فروعك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: () => listPublicPlans(),
  errorComponent: () => <Landing plans={[]} />,
  notFoundComponent: () => <Landing plans={[]} />,
  component: () => <Landing plans={Route.useLoaderData()} />,
});

const FEATURES = [
  { icon: Receipt, title: "إعادة احتساب كل بند", body: "العمولات، رسوم الدفع، الحملات، وقت الانتظار — بنفس معادلات عقد المنصة." },
  { icon: FileCheck2, title: "مطابقة الفاتورة سطراً بسطر", body: "قراءة فاتورة PDF ومقارنتها بالطلبات الخام مع إظهار الفرق ونسبته." },
  { icon: Camera, title: "أدلة التعويضات من الفروع", body: "الكاشير يرسل صورة أو فيديو عبر Telegram، ويقرأ Tadqeeq AI رقم الطلب تلقائياً." },
  { icon: Bot, title: "Tadqeeq AI", body: "اسأل عن أي فرع أو فترة واحصل على إجابة وجداول من بياناتك مباشرة." },
  { icon: BarChart3, title: "تقارير الفروع واليوم", body: "أي فرع يستهلك العمولات؟ تتبّع المبيعات والرسوم يوماً بيوم." },
  { icon: ShieldCheck, title: "مساحة عمل خاصة بشركتك", body: "بيانات كل منشأة معزولة تماماً، مع صلاحيات لكل موظف وفرع." },
];

const STEPS = [
  { icon: UserPlus, title: "سجّل منشأتك", body: "أنشئ حساباً وأدخل السجل التجاري والرقم الضريبي وعدد الفروع." },
  { icon: CalendarClock, title: "اجتماع مع خبير", body: "احجز موعداً يناسبك لنراجع عقودك ومنصاتك ونتفق على الخطة." },
  { icon: Rocket, title: "التهيئة والتفعيل", body: "بعد الاتفاق والتحويل نجهّز حسابك وفروعك وتُفتح كل الميزات." },
];

function Landing({ plans }: { plans: PublicPlan[] }) {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[8px] bg-primary text-lg font-bold text-primary-foreground">ت</span>
          <span className="text-lg font-bold">تدقيق</span>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/auth">تسجيل الدخول</Link></Button>
          <Button asChild size="sm"><Link to="/auth" search={{ mode: "signup" }}>سجّل منشأتك</Link></Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pb-14 pt-14 sm:pt-20">
          <p className="inline-flex rounded-[6px] border border-primary/20 bg-secondary px-2.5 py-1 text-xs font-medium text-primary">
            هنقرستيشن · كيتا · جاهز
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.3] tracking-[-0.025em] sm:text-6xl">
            لا تدفع فاتورة المنصة
            <br />
            <span className="text-primary">قبل ما تتأكد منها</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
            «تدقيق» يعيد بناء كل بند في فواتير تطبيقات التوصيل من بيانات طلباتك، يكشف الفروقات، ويساعدك
            تسترجع التعويضات بأدلة موثقة من فروعك.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>ابدأ الآن</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/auth">لدي حساب</Link></Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="panel p-5">
              <span className="inline-grid size-10 place-items-center rounded-[8px] bg-secondary text-primary">
                <f.icon className="size-5" />
              </span>
              <h2 className="mt-4 text-lg font-bold">{f.title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-bold sm:text-3xl">كيف تبدأ؟</h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="panel p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                  <s.icon className="size-5 text-primary" />
                </div>
                <h3 className="mt-4 font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {plans.length ? <Pricing plans={plans} /> : null}

        <section className="panel mt-20 flex flex-col items-start justify-between gap-5 p-7 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold">جاهز توقف الخسائر المخفية؟</h2>
            <p className="mt-1 text-sm text-muted-foreground">سجّل منشأتك واحجز اجتماعك مع خبير خلال دقيقتين.</p>
          </div>
          <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>سجّل منشأتك</Link></Button>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} تدقيق — المملكة العربية السعودية
      </footer>
    </div>
  );
}

function Pricing({ plans }: { plans: PublicPlan[] }) {
  return (
    <section id="pricing" className="mt-20">
      <h2 className="text-2xl font-bold sm:text-3xl">الباقات</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        السعر حسب الميزات وعدد مرات رفع الملفات شهرياً — بدون احتساب عدد الفروع.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {plans.map((p) => (
          <article
            key={p.id}
            className={"panel flex flex-col p-6 " + (p.highlighted ? "border-primary ring-1 ring-primary" : "")}
          >
            {p.highlighted ? (
              <span className="mb-3 self-start rounded-[6px] bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                الأكثر طلباً
              </span>
            ) : null}
            <h3 className="text-lg font-bold">{p.name}</h3>
            {p.description ? <p className="mt-1 text-sm text-muted-foreground">{p.description}</p> : null}
            <p className="mt-4">
              <span className="num text-3xl font-bold">{p.price.toLocaleString("en-US")}</span>
              <span className="text-sm text-muted-foreground"> ر.س / {p.cycle === "yearly" ? "سنوياً" : "شهرياً"}</span>
            </p>
            <p className="mt-2 text-sm font-medium">
              {p.uploadLimit === null ? "رفع ملفات بلا حدود" : `حتى ${p.uploadLimit} رفعة ملفات شهرياً`}
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {CORE_FEATURE_LABELS.map((l) => (
                <li key={l} className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />{l}</li>
              ))}
              {PLAN_FEATURES.map((f) => {
                const on = p.features.includes(f.key);
                return (
                  <li key={f.key} className={"flex gap-2 " + (on ? "" : "text-muted-foreground line-through")}>
                    {on ? <Check className="size-4 shrink-0 text-primary" /> : <X className="size-4 shrink-0" />}
                    {f.label}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 grid gap-2">
              <Button asChild variant={p.highlighted ? "default" : "outline"}>
                <Link to="/auth" search={{ mode: "signup" }}>سجّل منشأتك</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="mailto:hello@tadqeeq.app">تواصل معنا</a>
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
