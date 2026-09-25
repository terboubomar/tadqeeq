import { createFileRoute, Link } from "@tanstack/react-router";
import {
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

export const Route = createFileRoute("/")({
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
  component: Landing,
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

function Landing() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[8px] bg-primary text-lg font-bold text-primary-foreground">ت</span>
          <span className="text-lg font-bold">تدقيق</span>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/auth">تسجيل الدخول</Link></Button>
          <Button asChild size="sm"><Link to="/auth">سجّل منشأتك</Link></Button>
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
            <Button asChild size="lg"><Link to="/auth">ابدأ الآن</Link></Button>
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

        <section className="panel mt-20 flex flex-col items-start justify-between gap-5 p-7 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold">جاهز توقف الخسائر المخفية؟</h2>
            <p className="mt-1 text-sm text-muted-foreground">سجّل منشأتك واحجز اجتماعك مع خبير خلال دقيقتين.</p>
          </div>
          <Button asChild size="lg"><Link to="/auth">سجّل منشأتك</Link></Button>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} تدقيق — المملكة العربية السعودية
      </footer>
    </div>
  );
}
