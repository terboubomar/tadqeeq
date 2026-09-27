import { createFileRoute } from "@tanstack/react-router";
import { Bot, GitCompareArrows, Sparkles } from "lucide-react";

import { AiPeriodSummaryPanel } from "@/components/AiPeriodSummaryPanel";
import { EmptyState } from "@/components/AppShell";
import { PeriodIntelligencePanel } from "@/components/PeriodIntelligencePanel";
import { AI_UI_ENABLED } from "@/lib/ai/config";
import { arabicDate } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({
    meta: [
      { title: "Tadqeeq AI · تدقيق" },
      {
        name: "description",
        content: "مساحة الذكاء التحليلي لملخص الفترة ومقارنة التغيّرات.",
      },
      { property: "og:title", content: "Tadqeeq AI · تدقيق" },
    ],
  }),
  component: TadqeeqAiPage,
});

function TadqeeqAiPage() {
  const { periods, selected, isLoading } = useSelectedPeriod();

  if (!AI_UI_ENABLED) {
    return (
      <section className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-white p-8 text-center">
        <h1 className="text-lg font-bold">Tadqeeq AI غير مفعّل</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          التدقيق الحتمي والتقارير ومركز الاستثناءات تعمل بشكل طبيعي بدون الذكاء الاصطناعي.
        </p>
      </section>
    );
  }

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (!selected) {
    return (
      <EmptyState
        title="لا توجد فترة للتحليل"
        body="ارفع بيانات فترة تدقيق أولاً، ثم استخدم Tadqeeq AI لشرح النتائج والتغيّرات."
      />
    );
  }

  const platformLabel =
    selected.platform === "hungerstation"
      ? "هنقرستيشن"
      : selected.platform === "keeta"
        ? "كيتا"
        : "جاهز";

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[18px] bg-ink p-6 text-ink-foreground sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 end-[-6rem] size-72 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-primary), transparent 70%)" }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="size-5" />
            </span>
            <h1 className="text-2xl font-bold">Tadqeeq AI</h1>
            <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10.5px] font-semibold text-primary">تحليل مساعد</span>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {selected.label} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)} · {platformLabel}
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <HeroFeature icon={Sparkles} title="ملخص الفترة" body="قراءة تنفيذية ومالية مبنية على نتائج Tadqeeq الحتمية والاستثناءات الموثقة." />
            <HeroFeature icon={GitCompareArrows} title="ذكاء الفترات" body="مقارنة حتمية مع أقرب فترة سابقة لنفس المنصة، ثم تفسير AI للتغيّرات." />
            <HeroFeature icon={Bot} title="حدود واضحة" body="AI يشرح فقط؛ لا يغيّر نتائج التدقيق أو الاستثناءات أو مبالغ الاسترداد." />
          </div>
        </div>
      </section>

      <AiPeriodSummaryPanel key={"summary-" + selected.id} periodId={selected.id} />

      <PeriodIntelligencePanel current={selected} periods={periods} />
    </div>
  );
}

function HeroFeature({ icon: Icon, title, body }: { icon: typeof Sparkles; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-ink-2 bg-ink-2/60 p-3.5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <p className="text-[13px] font-semibold">{title}</p>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-5 text-ink-muted">{body}</p>
    </div>
  );
}
