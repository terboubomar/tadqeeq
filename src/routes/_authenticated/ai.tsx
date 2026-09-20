import { createFileRoute } from "@tanstack/react-router";
import { Bot, GitCompareArrows, Sparkles } from "lucide-react";

import { AiPeriodSummaryPanel } from "@/components/AiPeriodSummaryPanel";
import { EmptyState } from "@/components/AppShell";
import { PeriodIntelligencePanel } from "@/components/PeriodIntelligencePanel";
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
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h1 className="audit-heading">Tadqeeq AI</h1>
          <span className="rounded-full border border-primary/15 bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary">
            تحليل مساعد
          </span>
        </div>
        <p className="audit-subtitle">
          {selected.label} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)} ·{" "}
          {platformLabel}
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <InfoCard
          icon={Sparkles}
          title="ملخص الفترة"
          body="قراءة تنفيذية ومالية مبنية على نتائج Tadqeeq الحتمية والاستثناءات الموثقة."
        />
        <InfoCard
          icon={GitCompareArrows}
          title="ذكاء الفترات"
          body="مقارنة حتمية مع أقرب فترة سابقة لنفس المنصة، ثم تفسير AI للتغيّرات."
        />
        <InfoCard
          icon={Bot}
          title="حدود واضحة"
          body="AI يشرح فقط؛ لا يغيّر نتائج التدقيق أو الاستثناءات أو مبالغ الاسترداد."
        />
      </section>

      <AiPeriodSummaryPanel key={"summary-" + selected.id} periodId={selected.id} />

      <PeriodIntelligencePanel current={selected} periods={periods} />
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-primary" />
        <p className="text-xs font-semibold">{title}</p>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}
