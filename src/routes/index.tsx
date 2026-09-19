import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, FileCheck2, Receipt, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تدقيق · مراجعة فواتير هنقرستيشن وكيتا" },
      {
        name: "description",
        content:
          "ارفع بيانات الطلبات وفواتير المنصات، وأعد احتساب العمولات ورسوم الدفع والحملات لاكتشاف أي فروقات قبل السداد.",
      },
      { property: "og:title", content: "تدقيق · مراجعة فواتير هنقرستيشن وكيتا" },
      {
        property: "og:description",
        content: "أعد احتساب كل بند في فاتورة المنصة من بيانات الطلبات الخام وقارنه بالمطالبة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Receipt,
    title: "إعادة احتساب كل بند",
    body: "عمولة المبيعات، رسوم الدفع الإلكتروني، حملات التوصيل المجاني، التعويضات، رسوم العروض ووقت الانتظار — بنفس معادلات دليل المنصة.",
  },
  {
    icon: FileCheck2,
    title: "مطابقة مباشرة بالفاتورة",
    body: "اقرأ فاتورة المنصة وقارن كل سطر بالرقم المحتسب من بيانات الطلبات، مع إظهار الفرق ونسبته.",
  },
  {
    icon: BarChart3,
    title: "تفصيل بالفرع واليوم",
    body: "اعرف أي فرع يستهلك العمولات، وتتبّع المبيعات والعمولة يوماً بيوم، مع تصدير Excel وCSV.",
  },
  {
    icon: ShieldCheck,
    title: "أرشيف الفترات",
    body: "احفظ كل شهر في حسابك وقارن الأداء بمرور الوقت دون إعادة رفع الملفات.",
  },
];

function Landing() {
  return (
    <div className="grain-bg min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground">
            ت
          </span>
          <span className="font-display text-xl font-black gold-text">تدقيق</span>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">تسجيل الدخول</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="pt-10 pb-16 sm:pt-20">
          <p className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            هنقرستيشن · كيتا
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.25] sm:text-6xl">
            لا تدفع فاتورة المنصة
            <br />
            <span className="gold-text">قبل ما تتأكد منها</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
            ارفع ملف الطلبات الخام وفاتورة المنصة، ويقوم «تدقيق» بإعادة بناء كل بند في الفاتورة من
            بيانات الطلبات نفسها، ثم يعرض لك الفرق بين ما تم احتسابه وما تمت المطالبة به — لكل فرع
            ولكل يوم.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">ابدأ التدقيق الآن</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">لدي حساب</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="panel p-6">
              <span className="inline-grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                <feature.icon className="size-5" />
              </span>
              <h2 className="mt-4 text-lg font-bold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
